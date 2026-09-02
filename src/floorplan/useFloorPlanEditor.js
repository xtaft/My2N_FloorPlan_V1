import { useEffect, useState, useCallback, useMemo } from 'react';
import { polygon, featureCollection, union, point, booleanPointInPolygon } from '@turf/turf';
import { getFloorData } from './floors.js';
import { useFloorPlanData } from './FloorPlanDataContext.jsx';
import {
  UNKNOWN_CATEGORY_ID,
  seedZoneCategoryIds,
  pickRandomPaletteColor,
} from './categories.js';
import {
  buildAdjacencyGraph,
  buildFloorWallSegments,
  pruneOrphanedDoors,
  regularizeZoneForMerge,
  splitRingAtEdgePoints,
  ringToEdges,
  findNearestEdgeIndex,
  orderZonesForDoorName,
  buildDoorId,
  buildDoorSymbolPath,
  pathBoundingBoxCenter,
  getWallSegments,
  findWallSegmentAtPoint,
  findDoorWallEdge,
  getDoorWallMidpoint,
  perpendicularOffsetCandidates,
  rayEdgeIntersection,
  pointToSegmentDistance,
} from './geometry.js';

// A door's id is otherwise just a label, but a user-visible one — freezing
// it at whatever it was when the door was created means it keeps naming a
// room that may not exist anymore a few edits later. Whenever Merge or
// Divide changes a door's zoneA/zoneB, this regenerates its id from the
// CURRENT pairing instead, through the same ordering/suffix rules Add Door
// itself uses (orderZonesForDoorName + buildDoorId), so "the newly created
// rooms" — not whatever the room was called before the edit — are what
// show up in the id and its __2/__3 suffix.
function regenerateDoorId(door, zones, otherDoors) {
  const zoneA = zones.find((z) => z.id === door.zoneA);
  if (!zoneA) return door.id; // shouldn't happen; don't crash a rename we can't resolve
  const zoneB = door.zoneB ? zones.find((z) => z.id === door.zoneB) : null;
  if (door.zoneB && !zoneB) return door.id;
  const [orderedA, orderedB] = zoneB ? orderZonesForDoorName(zoneA, zoneB) : [zoneA, null];
  return buildDoorId(orderedA, orderedB, otherDoors);
}

// Applies `reassign` (returning the door's new {zoneA, zoneB}, or null if
// this door is untouched) to every door, then regenerates the id of every
// door that actually changed — one at a time, so two doors renamed to the
// same new pair in this same batch still collide correctly and end up with
// distinct __2/__3 suffixes instead of both claiming the bare base id.
function reassignAndRenameDoors(doors, zones, reassign) {
  const updated = doors.map((door) => {
    const next = reassign(door);
    return next ? { ...door, ...next } : door;
  });
  let result = updated;
  for (let i = 0; i < doors.length; i++) {
    const before = doors[i];
    const after = updated[i];
    if (before.zoneA === after.zoneA && before.zoneB === after.zoneB) continue; // untouched by reassign
    const others = result.filter((_, idx) => idx !== i);
    const newId = regenerateDoorId(result[i], zones, others);
    result = result.map((d, idx) => (idx === i ? { ...d, id: newId } : d));
  }
  return result;
}

// Reassigns any door that referenced `oldZoneId` on one side to `newZoneId`
// instead — keeps the explicit door<->zone references in doors.json-shaped
// data valid across a Merge (the absorbed zone's id disappears), and
// renames the door to match (see reassignAndRenameDoors above).
function reassignDoorZoneId(doors, oldZoneId, newZoneId, zones) {
  return reassignAndRenameDoors(doors, zones, (door) => {
    if (door.zoneA !== oldZoneId && door.zoneB !== oldZoneId) return null;
    return {
      zoneA: door.zoneA === oldZoneId ? newZoneId : door.zoneA,
      zoneB: door.zoneB === oldZoneId ? newZoneId : door.zoneB,
    };
  });
}

// Same idea for a Divide: the original zone id disappears into two new ones,
// and each door that referenced it has to be reassigned to whichever of the
// two resulting rings actually contains it, geometrically — and renamed to
// match (reassignAndRenameDoors above).
//
// The containment test can't just check the door's opening midpoint
// (findDoorWallEdge + getDoorWallMidpoint) directly: that point sits
// exactly ON the wall shared with the door's OTHER zone, which is also
// exactly the boundary both new sub-zones inherit from the original one —
// so turf's point-in-polygon is ambiguous there and can come back false for
// BOTH halves (observed: it did, and the code's `? zoneA : zoneB` fallback
// then always picked zoneB regardless of which side was actually correct).
// perpendicularOffsetCandidates nudges a couple of units off the wall, and
// whichever of the two nudge directions actually lands inside the
// ORIGINAL (pre-divide) zone is the one pointing into its interior — that's
// the point that's safe to test against zoneA/zoneB.
const WALL_NUDGE_DISTANCE = 2;

function reassignDoorZoneIdAfterDivide(doors, oldZone, zoneA, zoneB, prevZones) {
  const zonesForLookup = [...prevZones, zoneA, zoneB];
  return reassignAndRenameDoors(doors, zonesForLookup, (door) => {
    if (door.zoneA !== oldZone.id && door.zoneB !== oldZone.id) return null;
    const neighborZoneId = door.zoneA === oldZone.id ? door.zoneB : door.zoneA;
    const edge = findDoorWallEdge(door, oldZone, neighborZoneId, prevZones);

    let target;
    if (!edge) {
      const fallback = pathBoundingBoxCenter(door.d);
      target = booleanPointInPolygon(point(fallback), polygon(zoneA.rings)) ? zoneA.id : zoneB.id;
    } else {
      const wallMidpoint = getDoorWallMidpoint(door, edge);
      const [candidate1, candidate2] = perpendicularOffsetCandidates(wallMidpoint, edge, WALL_NUDGE_DISTANCE);
      const inward = booleanPointInPolygon(point(candidate1), polygon(oldZone.rings)) ? candidate1 : candidate2;
      target = booleanPointInPolygon(point(inward), polygon(zoneA.rings)) ? zoneA.id : zoneB.id;
    }

    return {
      zoneA: door.zoneA === oldZone.id ? target : door.zoneA,
      zoneB: door.zoneB === oldZone.id ? target : door.zoneB,
    };
  });
}

// A click is invalid — for both Add Door and Divide — if it lands within an
// existing door's own span on the wall, rather than on open wall. Works for
// interior walls (a real neighbor zone) and exterior ones (no neighbor)
// alike, since getWallSegments accepts either. zoneBId is already known
// here (not re-derived from a point) because the click comes from a
// rendered wall segment that's already tagged with both zone ids it
// belongs to — see buildFloorWallSegments.
function isClickOnDoorSpan(zoneAId, zoneBId, clickedPoint, zones, doors) {
  const zoneA = zones.find((z) => z.id === zoneAId);
  if (!zoneA) return false;
  const zoneB = zoneBId ? zones.find((z) => z.id === zoneBId) : null;
  const segments = getWallSegments(zoneA, zoneB, doors, zones);
  const hitSegment = findWallSegmentAtPoint(segments, clickedPoint);
  return hitSegment?.type === 'door';
}

// zone.rings -> turf Polygon feature. rings[0] = outer boundary, rings[1..] = holes.
// Our rings are already closed (first point === last point), which is what turf expects.
function zoneToTurfPolygon(zone) {
  return polygon(zone.rings, { id: zone.id, kind: zone.kind });
}

// turf Polygon geometry.coordinates is already in our [outerRing, ...holeRings] shape —
// no conversion needed beyond lifting it straight out.
function turfPolygonToRings(geometry) {
  return geometry.coordinates;
}

const MERGE_NOT_ADJACENT_MESSAGE = 'Select zones that are next to each other to merge them.';
// Exact copy from Figma's <Snackbar> wrongDivideNoneadjacent (node 72:100165).
const DIVIDE_WRONG_ZONE_MESSAGE = 'Select walls belonging to one zone';

/**
 * Merge tool interaction (see ActionBarFloorPlan.jsx for the full spec):
 *  1. First zone click while Merge is active -> marked as the pending zone
 *     (firstMergeZoneId), highlighted as "selected".
 *  2. Every other zone is classified relative to it: eligibleZoneIds (shares
 *     an edge -> valid target, highlighted as "eligible") or implicitly
 *     dimmed (everything else, once a first zone is pending).
 *  3. Second click: adjacent -> merge immediately (second zone's id/kind
 *     wins, first is dropped) and clear the pending zone, tool stays active.
 *     Not adjacent -> clear the pending zone, show the snackbar message.
 *     Re-clicking the pending zone itself cancels it (no snackbar).
 *  4. Deactivating the tool (handled by the effect below, which reacts to
 *     activeTool changing away from 'merge' for ANY reason — re-click,
 *     switching tools, or Escape) silently discards a pending first zone.
 *
 * Walls: every wall on the floor is rendered exactly once (FloorPlanCanvas.
 * jsx, via buildFloorWallSegments), tagged with both zone ids it borders
 * (zoneBId null for an exterior wall) — not once per zone as before. That
 * matters for correctness, not just tidiness: rendering each zone's own
 * edges independently draws a shared wall twice, stacked on top of itself,
 * and only DOM paint order — not the user's intent — decided which copy
 * actually received a click. A Divide click on hallway__H01's own wall
 * could silently resolve to stairs__S01 instead, whenever stairs__S01's
 * copy happened to paint on top. With one canonical entry per wall, a click
 * always reports both real zone ids it belongs to (handleWallClick's
 * zoneAId/zoneBId), so both tools below have something unambiguous to work
 * with.
 *
 * Divide tool interaction:
 *  1. First wall click while Divide is active -> marked as the pending wall
 *     (firstDivideEdge = {zoneAId, zoneBId, point, wallEdge}), highlighted
 *     on canvas — wallEdge defines the perpendicular direction both the
 *     cursor-following preview line (FloorPlanCanvas.jsx) and the actual cut
 *     (below) are constrained to.
 *  2. Second click only picks WHICH wall to cut to, not where on it: the
 *     actual second point is wherever the ray perpendicular to the first
 *     wall, starting at the first click, actually meets the second wall
 *     (rayEdgeIntersection, geometry.js) — never the raw second click
 *     position. The two clicks' zone-pairs are intersected to find the one
 *     zone common to both (the zone the user means to split); each point is
 *     then translated into that zone's own nearest edgeIndex
 *     (findNearestEdgeIndex) and the zone is split along that perpendicular
 *     line. Both halves inherit the original zone's kind; ids become
 *     `${original}-1`/`${original}-2` (poly1/poly2 from
 *     splitRingAtEdgePoints, in that order). Tool stays active for another
 *     divide. Per spec, the two clicks don't need to share a wall — they
 *     only need one zone in common between them.
 *  2b. Second click resolving to the SAME edge of the target zone as the
 *      first -> ignored entirely (no state change, no snackbar) — the
 *      first click stays pending.
 *  2c. No zone in common between the two clicks -> pending click clears and
 *      the snackbar shows (exact Figma copy, see above).
 *  2d. A click landing on an existing door's own span (per getWallSegments,
 *      geometry.js) -> invalid, silently ignored the same way as 2b — a
 *      wall can only be divided where it's still actually wall.
 *  2e. A second wall whose line the perpendicular ray doesn't actually
 *      reach within that wall's own real span (i.e. the ray would land
 *      beyond one of its endpoints) -> invalid, ignored the same way as 2b —
 *      there's no perpendicular cut to make to that particular wall from
 *      the first click.
 *  3. Deactivating the tool discards a pending click the same way Merge does.
 *
 * Add Door tool interaction:
 *  1. Click a wall between two zones -> a door is created at that point
 *     immediately, named per the same kind-priority hierarchy used
 *     elsewhere (orderZonesForDoorName/buildDoorId), with a __2/__3/...
 *     suffix if a door already exists on that same zone pair. Tool stays
 *     active.
 *  2. Click on an exterior wall (zoneBId null) -> silently ignored, no
 *     snackbar (not a stated error case in the spec).
 *  3. Click on an existing door's own span on that wall (per
 *     getWallSegments) -> invalid, silently ignored — same rule as Divide's
 *     2d. Two doors can still coexist on one wall (the __2 suffix case) as
 *     long as each click lands on the open wall stretch between/around
 *     them, not on top of one.
 *  This is a single-click gesture (no pending state, unlike Merge/Divide).
 *
 * Door <-> zone references: each door explicitly stores zoneA/zoneB (zoneB
 * is null for an exterior door) rather than that being re-derived from
 * geometry on every render. Add Door already knows both zones at creation
 * time. Merge and Divide each make an old zone id disappear, so both keep
 * every door's reference valid:
 *  - Merge deletes the door(s) directly between the two merging zones (that
 *    wall is now interior space, not a real door anymore) and repoints any
 *    other door that referenced the absorbed zone at the surviving
 *    (second-clicked) zone.
 *  - Divide repoints each door that referenced the original zone at
 *    whichever of the two new sub-zones geometrically contains it, using
 *    the door's actual wall-opening midpoint (findDoorWallEdge +
 *    getDoorWallMidpoint, geometry.js) rather than a bounding-box centroid —
 *    the swing glyph is asymmetric, so a centroid skews toward whichever
 *    side it bulges into and can land on the wrong side of the split.
 * Legacy doors from the original Figma data were backfilled with zoneA/
 * zoneB once, offline (see scripts/addDoorZoneRefs.mjs) — formatDoorTooltip
 * only falls back to geometric inference if they're somehow missing.
 *
 * dropPin: a per-zone slot (null until Add Pin — not yet implemented — sets
 * it), not an array, since a zone can only hold one pin. Merge keeps
 * whichever of the two zones already had one (favoring the surviving
 * zone's); Divide can't yet know which half a pin belongs in without also
 * implementing Add Pin's geometry, so both halves start with none.
 */
export function useFloorPlanEditor(floorId, activeTool) {
  // Every floor's edited zones/doors (keyed by floorId) and the
  // building-wide categories both live in FloorPlanDataContext, above the
  // router — NOT in this hook. That's what lets an edit made in the editor
  // survive Save/Close and show up in the read-only view, which is a
  // separate route and therefore a separate mount of this hook. See that
  // file's doc comment.
  //
  // A floor is still lazily seeded from its static JSON the first time it's
  // visited (see the effect below); after that its edits stay in the store
  // regardless of which floor is active or which screen is mounted.
  const { floorsData, setFloorsData, categories, setCategories } = useFloorPlanData();
  const zones = floorsData[floorId]?.zones ?? [];
  const doors = floorsData[floorId]?.doors ?? [];

  // setZones/setDoors below mimic the plain useState setter API (including
  // the functional-updater form used throughout this file) but write into
  // the CURRENT floor's slot only, leaving every other floor's data intact.
  const setZones = useCallback(
    (updater) => {
      setFloorsData((prev) => {
        const current = prev[floorId] ?? { zones: [], doors: [] };
        const nextZones = typeof updater === 'function' ? updater(current.zones) : updater;
        return { ...prev, [floorId]: { ...current, zones: nextZones } };
      });
    },
    [floorId, setFloorsData],
  );
  const setDoors = useCallback(
    (updater) => {
      setFloorsData((prev) => {
        const current = prev[floorId] ?? { zones: [], doors: [] };
        const nextDoors = typeof updater === 'function' ? updater(current.doors) : updater;
        return { ...prev, [floorId]: { ...current, doors: nextDoors } };
      });
    },
    [floorId, setFloorsData],
  );

  const [firstMergeZoneId, setFirstMergeZoneId] = useState(null);
  const [firstDivideEdge, setFirstDivideEdge] = useState(null);
  const [toolSnackbarMessage, setToolSnackbarMessage] = useState(null);

  // Seed a floor's data from its static JSON the first time it's visited —
  // a no-op (returns the same `prev` reference, so React bails out of the
  // update) for a floor that's already been loaded, edited or not, which is
  // exactly what keeps edits alive across navigation. Pending gesture state
  // is still per-activation, not per-floor, so that part does reset.
  useEffect(() => {
    setFloorsData((prev) => {
      if (prev[floorId]) return prev;
      const data = getFloorData(floorId);
      const zones = data ? seedZoneCategoryIds(data.zones) : [];
      return { ...prev, [floorId]: { zones, doors: data ? data.doors : [] } };
    });
    setFirstMergeZoneId(null);
    setFirstDivideEdge(null);
    setToolSnackbarMessage(null);
  }, [floorId, setFloorsData]);

  // Categories are building-wide (see categories.js), not per-floor like
  // zones/doors — the same "Apartments"/"Hallways"/etc. taxonomy applies
  // across every floor, which is why they come from the shared store above
  // rather than being per-floor state. A zone's own `categoryId` field is
  // still per-floor (it lives on the zone, in floorsData), so bulk
  // operations below (reassign, delete) walk every *already-loaded* floor's
  // zones, not just the active one — a floor that hasn't been visited yet
  // seeds its zones' categoryId fresh from the id-prefix mapping when it
  // first loads, so it can't already reference a category that was
  // renamed/deleted earlier.
  const zonesByCategory = useMemo(() => {
    const counts = new Map();
    for (const floor of Object.values(floorsData)) {
      for (const zone of floor.zones) {
        counts.set(zone.categoryId, (counts.get(zone.categoryId) ?? 0) + 1);
      }
    }
    return counts;
  }, [floorsData]);

  const renameCategory = useCallback(
    (categoryId, newName) => {
      setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, name: newName } : c)));
    },
    [setCategories],
  );

  const setCategoryColor = useCallback(
    (categoryId, newColor) => {
      setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, color: newColor } : c)));
    },
    [setCategories],
  );

  // Moves every zone (on every already-loaded floor) from one category to
  // another — used by both "Reassign all" and by deleteCategory below
  // (reassigning to Unknown is the exact same operation, just with a fixed
  // target).
  const reassignCategoryZones = useCallback((fromCategoryId, toCategoryId) => {
    setFloorsData((prev) => {
      const next = {};
      for (const [id, floor] of Object.entries(prev)) {
        next[id] = {
          ...floor,
          zones: floor.zones.map((zone) =>
            zone.categoryId === fromCategoryId ? { ...zone, categoryId: toCategoryId } : zone,
          ),
        };
      }
      return next;
    });
  }, [setFloorsData]);

  // Deleting a category and reassigning its zones to Unknown are the same
  // operation whether or not it currently has any zones — the UI only needs
  // to gate the *confirmation dialog* on that (see ZoneCategoriesContent),
  // not fork this function into two versions.
  const deleteCategory = useCallback(
    (categoryId) => {
      if (categoryId === UNKNOWN_CATEGORY_ID) return; // protected — see categories.js
      reassignCategoryZones(categoryId, UNKNOWN_CATEGORY_ID);
      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    },
    [reassignCategoryZones, setCategories],
  );

  // Appended to the bottom of the list with a random preset color and a
  // generated id distinct from any existing one — returns that id so the
  // caller can immediately put the new row into edit mode (per spec, a new
  // category opens straight into naming it), or (ZoneMenu.jsx's "Change
  // category" search-with-no-match case) immediately assign it to a zone
  // under whatever name the user was searching for.
  const addCategory = useCallback(
    (name = 'New category') => {
      const newId = `category-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      setCategories((prev) => [...prev, { id: newId, name, color: pickRandomPaletteColor(), protected: false }]);
      return newId;
    },
    [setCategories],
  );

  useEffect(() => {
    if (activeTool !== 'merge') setFirstMergeZoneId(null);
    if (activeTool !== 'divide') setFirstDivideEdge(null);
  }, [activeTool]);

  // Computed once per zones change (not per click) — see buildAdjacencyGraph.
  const adjacencyGraph = useMemo(() => buildAdjacencyGraph(zones), [zones]);

  // Every wall on the floor, computed once per zones/doors change — see the
  // big comment above for why this replaced rendering each zone's own edges
  // independently.
  const wallSegments = useMemo(
    () => buildFloorWallSegments(zones, doors, adjacencyGraph),
    [zones, doors, adjacencyGraph],
  );

  const eligibleZoneIds = useMemo(() => {
    if (!firstMergeZoneId) return [];
    return Array.from(adjacencyGraph.get(firstMergeZoneId) ?? []);
  }, [adjacencyGraph, firstMergeZoneId]);

  const performMerge = useCallback((firstId, secondId) => {
    setZones((prevZones) => {
      const firstZone = prevZones.find((z) => z.id === firstId);
      const secondZone = prevZones.find((z) => z.id === secondId);
      if (!firstZone || !secondZone) return prevZones;

      // regularizeZoneForMerge snaps one zone's shared-border edges exactly
      // onto the other's — turf's union() turned out to be intolerant of
      // the same sub-unit imprecision in the source geometry that required
      // a custom adjacency check in the first place (see geometry.js);
      // without this, union() can come back as a MultiPolygon for zone
      // pairs that are genuinely adjacent (observed for real zone pairs on
      // both floor_00 and floor_01). Which zone needs to be the one that
      // gets adjusted (rather than the reference) isn't predictable from
      // which one is "first" or "second" — it depends on which zone's
      // original geometry is the more reliable reference line for this
      // specific pair (observed empirically: it goes either way) — so this
      // tries adjusting firstZone onto secondZone first, and only falls
      // back to the other direction if that's not enough.
      let merged;
      for (const [zoneToAdjust, referenceZone, adjustingFirst] of [
        [firstZone, secondZone, true],
        [secondZone, firstZone, false],
      ]) {
        const regularized = regularizeZoneForMerge(zoneToAdjust, referenceZone);
        const polyA = adjustingFirst ? regularized : referenceZone;
        const polyB = adjustingFirst ? referenceZone : regularized;
        try {
          const attempt = union(featureCollection([zoneToTurfPolygon(polyA), zoneToTurfPolygon(polyB)]));
          if (attempt && attempt.geometry.type !== 'MultiPolygon') {
            merged = attempt;
            break;
          }
        } catch {
          // try the other direction before giving up
        }
      }

      if (!merged) {
        // Shouldn't normally happen — edge-sharing is already checked before
        // performMerge is called, and regularizeZoneForMerge above resolves
        // the usual cause in one direction or the other — but geometry is
        // geometry; fail safe.
        setToolSnackbarMessage(MERGE_NOT_ADJACENT_MESSAGE);
        return prevZones;
      }

      // The second-clicked zone absorbs the first: the merged zone keeps the
      // second's name/category, and the first zone's id disappears entirely.
      const mergedZone = {
        id: secondZone.id,
        kind: secondZone.kind,
        categoryId: secondZone.categoryId,
        name: secondZone.name,
        rings: turfPolygonToRings(merged.geometry),
        dropPin: firstZone.dropPin ?? secondZone.dropPin ?? null,
      };
      const newZones = [...prevZones.filter((z) => z.id !== firstId && z.id !== secondId), mergedZone];
      const newAdjacencyGraph = buildAdjacencyGraph(newZones);
      setDoors((prevDoors) => {
        // The door(s) directly between the two merging zones are now
        // interior to the merged zone — the wall they sat on no longer
        // exists, so they're deleted rather than reassigned (which would
        // otherwise leave a nonsensical door with zoneA === zoneB).
        const withoutSharedDoor = prevDoors.filter(
          (d) => !((d.zoneA === firstId && d.zoneB === secondId) || (d.zoneA === secondId && d.zoneB === firstId)),
        );
        const reassigned = reassignDoorZoneId(withoutSharedDoor, firstId, secondZone.id, prevZones);
        // Safety net: whatever the explicit rules above missed, drop any
        // door whose wall doesn't actually exist anymore per the fresh
        // adjacency graph — see pruneOrphanedDoors, geometry.js.
        return pruneOrphanedDoors(reassigned, newZones, newAdjacencyGraph);
      });
      return newZones;
    });
    // setZones/setDoors close over `floorId` (see above) and are recreated
    // whenever it changes, so they must be real dependencies here — with an
    // empty array, this callback would keep calling the setters bound to
    // whichever floor was active when it was first created, silently
    // editing that floor forever regardless of which one is actually shown.
  }, [setZones, setDoors]);

  const handleZoneClick = useCallback(
    (zoneId) => {
      if (activeTool !== 'merge') return;

      setFirstMergeZoneId((currentFirstId) => {
        if (!currentFirstId) return zoneId;
        if (zoneId === currentFirstId) return null; // re-clicking the pending zone cancels it

        if (adjacencyGraph.get(currentFirstId)?.has(zoneId)) {
          performMerge(currentFirstId, zoneId);
        } else {
          setToolSnackbarMessage(MERGE_NOT_ADJACENT_MESSAGE);
        }
        return null;
      });
    },
    [activeTool, adjacencyGraph, performMerge],
  );

  const performDivide = useCallback((zoneId, edgeIndexA, pointA, edgeIndexB, pointB) => {
    setZones((prevZones) => {
      const zone = prevZones.find((z) => z.id === zoneId);
      if (!zone) return prevZones;

      const [ring1, ring2] = splitRingAtEdgePoints(zone.rings[0], edgeIndexA, pointA, edgeIndexB, pointB);
      // Neither half can know which one a pin (once Add Pin exists) belongs
      // in without that tool's own geometry, so both start empty. Both
      // inherit the original zone's category, same as `kind`.
      const zoneA = { id: `${zone.id}-1`, kind: zone.kind, categoryId: zone.categoryId, rings: [ring1], dropPin: null };
      const zoneB = { id: `${zone.id}-2`, kind: zone.kind, categoryId: zone.categoryId, rings: [ring2], dropPin: null };
      const newZones = [...prevZones.filter((z) => z.id !== zoneId), zoneA, zoneB];
      const newAdjacencyGraph = buildAdjacencyGraph(newZones);
      setDoors((prevDoors) => {
        const reassigned = reassignDoorZoneIdAfterDivide(prevDoors, zone, zoneA, zoneB, prevZones);
        // Safety net — see performMerge's identical comment above.
        return pruneOrphanedDoors(reassigned, newZones, newAdjacencyGraph);
      });
      return newZones;
    });
  }, [setZones, setDoors]); // same stale-closure reasoning as performMerge above

  const performAddDoor = useCallback(
    (zoneAId, zoneBId, clickedPoint) => {
      if (!zoneBId) return; // exterior wall: silently no-op, per spec
      setDoors((prevDoors) => {
        const zoneA = zones.find((z) => z.id === zoneAId);
        const zoneB = zones.find((z) => z.id === zoneBId);
        if (!zoneA || !zoneB) return prevDoors;

        const segments = getWallSegments(zoneA, zoneB, prevDoors, zones);
        const hitSegment = findWallSegmentAtPoint(segments, clickedPoint);
        if (hitSegment?.type === 'door') return prevDoors; // clicked an existing door's own span: invalid, no-op

        // buildDoorSymbolPath needs the wall's line direction — zoneA's own
        // nearest edge lies on that same line regardless of which zone the
        // rendered segment happened to be tagged as "A".
        const edge = ringToEdges(zoneA.rings[0])[findNearestEdgeIndex(zoneA, clickedPoint)];
        const [orderedA, orderedB] = orderZonesForDoorName(zoneA, zoneB);
        const newDoor = {
          id: buildDoorId(orderedA, orderedB, prevDoors),
          d: buildDoorSymbolPath(clickedPoint, edge),
          zoneA: orderedA.id,
          zoneB: orderedB.id,
        };
        return [...prevDoors, newDoor];
      });
    },
    [zones, setDoors], // setDoors closes over floorId — see performMerge's comment above
  );

  const handleWallClick = useCallback(
    (zoneAId, zoneBId, clickedPoint, wallEdge) => {
      if (activeTool === 'addDoor') {
        performAddDoor(zoneAId, zoneBId, clickedPoint);
        return;
      }
      if (activeTool !== 'divide') return;
      // Same "no clicking through an existing door" rule as Add Door — a
      // click starting or ending on a door's own span is invalid, silently
      // ignored (consistent with the same-edge-reclick case below).
      if (isClickOnDoorSpan(zoneAId, zoneBId, clickedPoint, zones, doors)) return;

      setFirstDivideEdge((current) => {
        // wallEdge (the clicked wall's own line) is only needed for the
        // cursor-following preview line in FloorPlanCanvas.jsx, to figure
        // out which direction is "perpendicular to this wall" for snapping.
        if (!current) return { zoneAId, zoneBId, point: clickedPoint, wallEdge };

        const targetZoneId = [current.zoneAId, current.zoneBId]
          .filter(Boolean)
          .find((id) => id === zoneAId || id === zoneBId);
        if (!targetZoneId) {
          setToolSnackbarMessage(DIVIDE_WRONG_ZONE_MESSAGE);
          return null;
        }

        const targetZone = zones.find((z) => z.id === targetZoneId);
        const edgeIndexA = findNearestEdgeIndex(targetZone, current.point);
        const edgeIndexB = findNearestEdgeIndex(targetZone, clickedPoint);
        if (edgeIndexA === edgeIndexB) {
          return current; // same edge of the target zone re-clicked: ignored, stays pending, no snackbar
        }

        // The cut always runs exactly perpendicular to the first-clicked
        // wall — the second click only picks WHICH wall to cut to, not
        // where on it; the actual second point is wherever that
        // perpendicular ray actually meets the chosen wall.
        const edgeB = ringToEdges(targetZone.rings[0])[edgeIndexB];
        const wx = current.wallEdge.x2 - current.wallEdge.x1;
        const wy = current.wallEdge.y2 - current.wallEdge.y1;
        const wallLen = Math.hypot(wx, wy);
        const perpDir = [-wy / wallLen, wx / wallLen];
        const pointB = rayEdgeIntersection(current.point, perpDir, edgeB);
        // Invalid if the perpendicular ray doesn't actually reach the
        // clicked wall within its real span (i.e. it would land beyond one
        // of that wall's own endpoints) — ignored the same silent way as
        // re-clicking the same edge, since there's no perpendicular cut to
        // make to this particular wall from here.
        if (!pointB || pointToSegmentDistance(pointB[0], pointB[1], edgeB.x1, edgeB.y1, edgeB.x2, edgeB.y2) > 1) {
          return current;
        }

        performDivide(targetZoneId, edgeIndexA, current.point, edgeIndexB, pointB);
        return null;
      });
    },
    [activeTool, zones, doors, performDivide, performAddDoor],
  );

  // ZoneMenu.jsx's Rename/Change category — same shape as renameCategory/
  // setCategoryColor above, just scoped to one zone's own fields rather than
  // a whole category. renameZone sets the `name` override getZoneDisplayName
  // (formatNames.js) prefers over the id-derived name; setZoneCategory is
  // the single-zone counterpart to reassignCategoryZones (which moves every
  // zone currently in one category — this only ever touches one).
  const renameZone = useCallback(
    (zoneId, newName) => {
      setZones((prev) => prev.map((z) => (z.id === zoneId ? { ...z, name: newName } : z)));
    },
    [setZones],
  );

  const setZoneCategory = useCallback(
    (zoneId, categoryId) => {
      setZones((prev) => prev.map((z) => (z.id === zoneId ? { ...z, categoryId } : z)));
    },
    [setZones],
  );

  // Deletes a zone and every door on it (either side — doorA/doorB alike),
  // via the same setZones/setDoors per-floor helpers performMerge/performDivide
  // use. Doesn't touch devices: a device pinned to this zone or to one of its
  // doors is unpinned by the caller (FloorPlanScreen.jsx's handleDeleteZone),
  // which needs the *pre-deletion* `doors` list to know which door ids are
  // about to disappear — this hook has no visibility into the devices roster
  // at all (see useDevices.js's own doc comment for why they're separate).
  const deleteZone = useCallback(
    (zoneId) => {
      setDoors((prevDoors) => prevDoors.filter((d) => d.zoneA !== zoneId && d.zoneB !== zoneId));
      setZones((prevZones) => prevZones.filter((z) => z.id !== zoneId));
    },
    [setZones, setDoors],
  );

  const dismissToolSnackbar = useCallback(() => setToolSnackbarMessage(null), []);

  return {
    zones,
    doors,
    adjacencyGraph,
    wallSegments,
    firstMergeZoneId,
    eligibleZoneIds,
    handleZoneClick,
    firstDivideEdge,
    handleWallClick,
    deleteZone,
    renameZone,
    setZoneCategory,
    toolSnackbarMessage,
    dismissToolSnackbar,
    categories,
    zonesByCategory,
    renameCategory,
    setCategoryColor,
    reassignCategoryZones,
    deleteCategory,
    addCategory,
    // Raw state + setter, not just the per-floor/per-category helpers above —
    // for useEditHistory (FloorPlanScreen.jsx) to snapshot and restore on
    // undo/redo. floorsData covers every floor's zones/doors at once (not
    // just the active floor's), since some edits — Reassign All, deleting a
    // category — touch zones on floors other than the one currently shown.
    floorsData,
    setFloorsData,
    setCategories,
  };
}
