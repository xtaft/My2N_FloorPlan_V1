// Pure geometry helpers shared between the data layer (useFloorPlanEditor —
// adjacency checks, polygon splitting) and the rendering layer
// (FloorPlanCanvas — hit-testing which edge was clicked). ringToEdges is the
// single source of truth for what "edge index N" means, so a click on edge N
// in the UI always corresponds to the same edge the split logic operates on.

// ring: closed ring array ([x,y] pairs, first === last). Edge i connects
// ring[i] to ring[i+1].
export function ringToEdges(ring) {
  const edges = [];
  for (let i = 0; i < ring.length - 1; i++) {
    edges.push({ edgeIndex: i, x1: ring[i][0], y1: ring[i][1], x2: ring[i + 1][0], y2: ring[i + 1][1] });
  }
  return edges;
}

export function projectPointOntoSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return [x1, y1];
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return [x1 + t * dx, y1 + t * dy];
}

// --- adjacency ("shares an edge") ---
//
// Tried turf's lineOverlap first; it didn't reliably detect real shared
// edges in our actual data even with a generous tolerance, because the
// source geometry has small dogleg notches (door-jamb details baked into
// the wall outline — e.g. apartment__A01's boundary steps out by ~0.26
// units right where it meets the hallway) that put nominally-coincident
// edges a fraction of a unit apart. Verified against real floor_00/floor_01
// zone pairs before relying on it.
//
// Every zone in the original Figma data is axis-aligned, but Divide isn't
// restricted to axis-aligned cuts — it splits along the straight line
// between whatever two points the user clicked. A diagonal cut creates two
// new zones sharing a diagonal wall, and that wall has to be just as
// detectable as any original one (Add Door and further Divide/Merge all
// depend on it), so this is a general "are these two segments collinear and
// overlapping" test — parallel-and-coincident, not "same x" or "same y" —
// which axis-aligned edges satisfy as a special case.
const COINCIDE_EPSILON = 1; // max perpendicular distance between two lines to still count as "the same line"
const MIN_OVERLAP_LENGTH = 1; // minimum shared length to count as a real edge, not just corners touching

// Signed perpendicular distance from (px,py) to the infinite line through
// (x1,y1)-(x2,y2) — 0 exactly on the line, magnitude grows with distance.
function perpendicularDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(px - x1, py - y1);
  return Math.abs((px - x1) * dy - (py - y1) * dx) / len;
}

// Both of edgeB's endpoints lying on edgeA's infinite line implies edgeB's
// whole line coincides with edgeA's (two points determine a line) — checked
// against edgeA specifically (rather than symmetrically) because it's
// always called on the longer of the two candidate edges below, which is
// the more numerically stable reference line.
function edgesAreCollinear(edgeA, edgeB) {
  return (
    perpendicularDistance(edgeB.x1, edgeB.y1, edgeA.x1, edgeA.y1, edgeA.x2, edgeA.y2) <= COINCIDE_EPSILON &&
    perpendicularDistance(edgeB.x2, edgeB.y2, edgeA.x1, edgeA.y1, edgeA.x2, edgeA.y2) <= COINCIDE_EPSILON
  );
}

function edgeLength(edge) {
  return Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1);
}

// Parameterizes (px,py) along edgeA's own direction: 0 at (x1,y1), 1 at
// (x2,y2) — used once two edges are already known to be collinear, to find
// how far along edgeA's line a point (typically from edgeB) falls.
function projectParam(px, py, edgeA) {
  const dx = edgeA.x2 - edgeA.x1;
  const dy = edgeA.y2 - edgeA.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  return ((px - edgeA.x1) * dx + (py - edgeA.y1) * dy) / len2;
}

// The longer edge is the more stable reference line for the collinearity
// and projection math above (its direction vector is less sensitive to the
// COINCIDE_EPSILON tolerance than a very short edge's would be).
function longerEdgeFirst(edgeA, edgeB) {
  return edgeLength(edgeA) >= edgeLength(edgeB) ? [edgeA, edgeB] : [edgeB, edgeA];
}

export function edgesShareBorder(edgeA, edgeB) {
  const [longEdge, shortEdge] = longerEdgeFirst(edgeA, edgeB);
  if (!edgesAreCollinear(longEdge, shortEdge)) return false;
  const t1 = projectParam(shortEdge.x1, shortEdge.y1, longEdge);
  const t2 = projectParam(shortEdge.x2, shortEdge.y2, longEdge);
  const lo = Math.max(0, Math.min(t1, t2));
  const hi = Math.min(1, Math.max(t1, t2));
  return (hi - lo) * edgeLength(longEdge) > MIN_OVERLAP_LENGTH;
}

// --- Add Door tool ---

// Naming/priority hierarchy for ordering the two zones in a door id — the
// same hierarchy used throughout this app's naming convention:
// hallway > commercial > apartment > technical > parking(garage) > anything
// else (alphabetical by id).
export const KIND_PRIORITY_ORDER = ['hallway', 'commercial', 'apartment', 'technical', 'garage'];

export function orderZonesForDoorName(zoneA, zoneB) {
  const rank = (kind) => {
    const idx = KIND_PRIORITY_ORDER.indexOf(kind);
    return idx === -1 ? KIND_PRIORITY_ORDER.length : idx;
  };
  const rankA = rank(zoneA.kind);
  const rankB = rank(zoneB.kind);
  if (rankA !== rankB) return rankA < rankB ? [zoneA, zoneB] : [zoneB, zoneA];
  return zoneA.id <= zoneB.id ? [zoneA, zoneB] : [zoneB, zoneA];
}

// door__{zoneA.id}-{zoneB.id} (or door__{zoneA.id}-ext for an exterior door
// — pass zoneB as null), with a __2/__3/... suffix appended if a door
// already exists on this exact zone pair. "Already exists" is judged by the
// existing doors' actual zoneA/zoneB fields (checked in either order, since
// orderZonesForDoorName is deterministic but a door predating that
// convention — or this specific ordering — could still store them the other
// way round) — NOT by pattern-matching door ids as strings, which silently
// missed every legacy Figma-sourced door (e.g. "door__H01-A07" doesn't match
// the "door__hallway__H01-apartment__A07..." pattern at all), letting a
// second, differently-named door pile up on a wall that already had one
// instead of getting the __2 suffix.
export function buildDoorId(zoneA, zoneB, existingDoors) {
  const base = zoneB ? `door__${zoneA.id}-${zoneB.id}` : `door__${zoneA.id}-ext`;
  const matchingCount = existingDoors.filter((d) =>
    zoneB
      ? (d.zoneA === zoneA.id && d.zoneB === zoneB.id) || (d.zoneA === zoneB.id && d.zoneB === zoneA.id)
      : d.zoneA === zoneA.id && d.zoneB === null,
  ).length;
  return matchingCount === 0 ? base : `${base}__${matchingCount + 1}`;
}

// The two points obtained by offsetting `position` by `distance` along
// either perpendicular direction to `edge`. Used when a point that sits
// exactly ON a wall (e.g. a door's opening midpoint) needs to be tested for
// which side of that wall it's on: testing the on-wall point directly
// against a polygon whose own boundary IS that wall is inherently
// ambiguous (turf's point-in-polygon can come back false for both sides) —
// nudging a couple of units off the wall first, into whichever zone the
// point conceptually belongs to, resolves that ambiguity.
export function perpendicularOffsetCandidates(position, edge, distance) {
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [position, position];
  const nx = -dy / len;
  const ny = dx / len;
  const [px, py] = position;
  return [
    [px + nx * distance, py + ny * distance],
    [px - nx * distance, py - ny * distance],
  ];
}

// Where a ray from `origin` ([x,y]) in unit direction `direction` ([dx,dy])
// crosses the infinite line through `edge`. Returns null if the ray is
// parallel to that line (no unique crossing). Used to constrain Divide's
// cut to run exactly perpendicular to the first-clicked wall — the second
// click only picks WHICH wall to cut to; the actual second point is this
// intersection, not wherever on that wall the click landed.
export function rayEdgeIntersection(origin, direction, edge) {
  const [ox, oy] = origin;
  const [dx, dy] = direction;
  const ex = edge.x2 - edge.x1;
  const ey = edge.y2 - edge.y1;
  const denom = ex * dy - ey * dx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = (ex * (edge.y1 - oy) - ey * (edge.x1 - ox)) / denom;
  return [ox + t * dx, oy + t * dy];
}

// Matches the hand-authored door glyphs already in the source Figma data
// (e.g. door__H01-A07: "M1314.83 714.62 H1267.3 C1270.48 684.038 1280.04
// 673.669 1314.83 670.617 V714.62 Z") — a standard architectural door-swing
// symbol: a straight leaf line perpendicular to the wall, a quarter-circle
// arc sweeping back to the wall, and a closing segment along the wall
// spanning the opening. Reverse-engineered from that example: leaf length
// == swing radius == wall-opening width, all equal to DOOR_SWING_WIDTH
// (~44 units, matching the source data). The clicked point is the MIDDLE of
// that opening (not one edge/hinge of it) — the hinge and the far wall-end
// sit DOOR_SWING_WIDTH/2 to either side of it along the wall, so the click
// lands where the user visually placed the door, not at one of its jambs.
const DOOR_SWING_WIDTH = 44;
const ARC_KAPPA = 0.5523; // standard cubic-bezier quarter-circle approximation constant

export function buildDoorSymbolPath(point, edge) {
  const [clickX, clickY] = point;
  const wallLen = Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1);
  const wx = (edge.x2 - edge.x1) / wallLen; // unit vector along the wall
  const wy = (edge.y2 - edge.y1) / wallLen;
  const nx = -wy; // unit vector perpendicular to the wall (the leaf's swing direction)
  const ny = wx;

  const halfWidth = DOOR_SWING_WIDTH / 2;
  const hingeX = clickX - wx * halfWidth;
  const hingeY = clickY - wy * halfWidth;
  const wallEndX = clickX + wx * halfWidth;
  const wallEndY = clickY + wy * halfWidth;
  const leafTipX = hingeX + nx * DOOR_SWING_WIDTH;
  const leafTipY = hingeY + ny * DOOR_SWING_WIDTH;
  const c1x = leafTipX + wx * DOOR_SWING_WIDTH * ARC_KAPPA;
  const c1y = leafTipY + wy * DOOR_SWING_WIDTH * ARC_KAPPA;
  const c2x = wallEndX + nx * DOOR_SWING_WIDTH * ARC_KAPPA;
  const c2y = wallEndY + ny * DOOR_SWING_WIDTH * ARC_KAPPA;

  return `M${hingeX},${hingeY} L${leafTipX},${leafTipY} C${c1x},${c1y} ${c2x},${c2y} ${wallEndX},${wallEndY} Z`;
}

// --- walls: shared boundary, split at doors ---
//
// A zone's ring edge is NOT the same thing as "the wall between it and one
// neighbor" — e.g. hallway__H01 has a single long edge running the whole
// length of the building, while each apartment along that same physical
// wall has its own much shorter edge. So "the wall between hallway__H01 and
// apartment__A07" is the OVERLAP between H01's long edge and A07's short
// one, not either edge wholesale. getWallSegments computes that overlap
// (across every matching edge pair, in case a wall has a jog) and splits it
// wherever an existing door sits, into an ordered list of typed sub-segments
// — 'wall' (clickable to add a door / valid to divide through) or 'door'
// (already occupied — invalid for both tools). zoneB may be null to ask
// about zoneA's exterior walls instead of a shared interior one; `zones` is
// only needed in that case, to determine which of zoneA's edges truly have
// no neighbor at all.

// The actual overlapping sub-segment between two already-collinear edges —
// general (any line direction), via the same longer-edge-as-reference
// projection edgesShareBorder uses, not an axis-specific min/max.
function overlapSegment(edgeA, edgeB) {
  const [longEdge, shortEdge] = longerEdgeFirst(edgeA, edgeB);
  const t1 = projectParam(shortEdge.x1, shortEdge.y1, longEdge);
  const t2 = projectParam(shortEdge.x2, shortEdge.y2, longEdge);
  const lo = Math.max(0, Math.min(t1, t2));
  const hi = Math.min(1, Math.max(t1, t2));
  const dx = longEdge.x2 - longEdge.x1;
  const dy = longEdge.y2 - longEdge.y1;
  return {
    x1: longEdge.x1 + lo * dx,
    y1: longEdge.y1 + lo * dy,
    x2: longEdge.x1 + hi * dx,
    y2: longEdge.y1 + hi * dy,
  };
}

// Projects every on-curve point of a door's glyph onto `edge`'s own line and
// returns the min/max parameter (0 at edge start, 1 at edge end) — the
// door's actual opening span along that wall, not a bounding-box of the
// whole swing glyph (which would skew toward whichever side the arc bulges
// into, off the true doorway centerline). The leaf tip's perpendicular
// offset doesn't move it along the wall, so it never affects this range —
// only the two wall-anchored ends of the glyph do. Shared by the wall-
// splitting below and by Divide's zone-reassignment (useFloorPlanEditor.js),
// so both agree on the exact same "where is this door" answer.
export function getDoorWallExtent(door, edge) {
  const points = parsePathOnCurvePoints(door.d);
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const len2 = dx * dx + dy * dy;
  let minT = Infinity;
  let maxT = -Infinity;
  for (const [px, py] of points) {
    const t = len2 === 0 ? 0 : ((px - edge.x1) * dx + (py - edge.y1) * dy) / len2;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  return { minT, maxT };
}

export function getDoorWallMidpoint(door, edge) {
  const { minT, maxT } = getDoorWallExtent(door, edge);
  const midT = (minT + maxT) / 2;
  return [edge.x1 + midT * (edge.x2 - edge.x1), edge.y1 + midT * (edge.y2 - edge.y1)];
}

function segmentFromSpan(span, t1, t2, type, door) {
  const dx = span.x2 - span.x1;
  const dy = span.y2 - span.y1;
  return {
    type,
    x1: span.x1 + t1 * dx,
    y1: span.y1 + t1 * dy,
    x2: span.x1 + t2 * dx,
    y2: span.y1 + t2 * dy,
    ...(door ? { door } : {}),
  };
}

export function getWallSegments(zoneA, zoneB, doors, zones) {
  const edgesA = ringToEdges(zoneA.rings[0]);
  const rawSpans = [];

  if (zoneB) {
    const edgesB = ringToEdges(zoneB.rings[0]);
    for (const edgeA of edgesA) {
      for (const edgeB of edgesB) {
        if (edgesShareBorder(edgeA, edgeB)) rawSpans.push(overlapSegment(edgeA, edgeB));
      }
    }
  } else {
    for (const edgeA of edgesA) {
      const hasNeighbor = zones.some(
        (z) => z.id !== zoneA.id && ringToEdges(z.rings[0]).some((edgeB) => edgesShareBorder(edgeA, edgeB)),
      );
      if (!hasNeighbor) rawSpans.push(edgeA);
    }
  }

  const relevantDoors = doors.filter((d) =>
    zoneB
      ? (d.zoneA === zoneA.id && d.zoneB === zoneB.id) || (d.zoneA === zoneB.id && d.zoneB === zoneA.id)
      : d.zoneA === zoneA.id && d.zoneB === null,
  );

  const segments = [];
  for (const span of rawSpans) {
    const doorRanges = relevantDoors
      .map((door) => ({ door, ...getDoorWallExtent(door, span) }))
      // a zone pair can have more than one disjoint shared-wall run; only
      // attribute a door to this span if its midpoint actually falls on it
      .filter(({ minT, maxT }) => (minT + maxT) / 2 >= -0.01 && (minT + maxT) / 2 <= 1.01)
      .sort((a, b) => a.minT - b.minT);

    let cursor = 0;
    for (const { door, minT, maxT } of doorRanges) {
      const clampedMin = Math.max(0, Math.min(1, minT));
      const clampedMax = Math.max(0, Math.min(1, maxT));
      if (clampedMin > cursor) segments.push(segmentFromSpan(span, cursor, clampedMin, 'wall'));
      segments.push(segmentFromSpan(span, clampedMin, clampedMax, 'door', door));
      cursor = Math.max(cursor, clampedMax);
    }
    if (cursor < 1) segments.push(segmentFromSpan(span, cursor, 1, 'wall'));
  }

  return segments;
}

// Every wall on the floor, each rendered/computed exactly once — the fix
// for a real bug: rendering each zone's own edges independently (the old
// approach) draws a SHARED wall twice, once from each zone's side, stacked
// on top of each other. Since DOM/paint order (not user intent) then
// decides which copy actually receives a click, a Divide gesture could
// silently resolve to the wrong zone whenever the topmost copy happened to
// belong to a different zone than the one the user meant to cut (observed
// empirically: clicking hallway__H01's own wall next to stairs__S01 could
// resolve to stairs__S01 instead, because stairs__S01 happened to render
// later). Walking adjacencyGraph's pairs (each pair visited once) plus each
// zone's own exterior walls guarantees a single, unambiguous entry per
// physical wall, tagged with both zone ids it belongs to (zoneBId null for
// an exterior wall) so callers never have to re-derive "which zone(s) is
// this."
export function buildFloorWallSegments(zones, doors, adjacencyGraph) {
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const segments = [];
  const seenPairs = new Set();

  for (const zone of zones) {
    for (const neighborId of adjacencyGraph.get(zone.id) ?? []) {
      const pairKey = [zone.id, neighborId].sort().join('|');
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      const neighborZone = zoneById.get(neighborId);
      for (const seg of getWallSegments(zone, neighborZone, doors, zones)) {
        segments.push({ ...seg, zoneAId: zone.id, zoneBId: neighborId });
      }
    }
    for (const seg of getWallSegments(zone, null, doors, zones)) {
      segments.push({ ...seg, zoneAId: zone.id, zoneBId: null });
    }
  }

  return segments;
}

// The index of `zone`'s own ring edge nearest `point` — used once a Divide
// gesture's two clicks have resolved to a shared target zone (see
// useFloorPlanEditor.js), to translate a clicked point back into the
// edgeIndex splitRingAtEdgePoints needs.
export function findNearestEdgeIndex(zone, point) {
  const [px, py] = point;
  let bestIndex = -1;
  let bestDist = Infinity;
  for (const edge of ringToEdges(zone.rings[0])) {
    const dist = pointToSegmentDistance(px, py, edge.x1, edge.y1, edge.x2, edge.y2);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = edge.edgeIndex;
    }
  }
  return bestIndex;
}

// Finds which of clickedPoint's containing wall segments a point belongs to
// (by nearest-segment, since floating point can leave clickedPoint a hair
// off any one segment's exact line) — used to validate an Add Door or
// Divide click against existing doors before accepting it.
export function findWallSegmentAtPoint(segments, point) {
  const [px, py] = point;
  let best = null;
  let bestDist = Infinity;
  for (const seg of segments) {
    const dist = pointToSegmentDistance(px, py, seg.x1, seg.y1, seg.x2, seg.y2);
    if (dist < bestDist) {
      bestDist = dist;
      best = seg;
    }
  }
  return best;
}

// Finds the specific edge of `zone`'s own ring that `door` sits on — needed
// before getDoorWallExtent/getDoorWallMidpoint can be used, since those need
// a concrete wall line, not just a zone. `neighborZoneId` is the door's
// OTHER zone reference (null for an exterior door). When a zone has more
// than one edge that could match, the door's rough position (bounding-box
// center — fine here, this is only for picking WHICH edge, not for the
// final position) disambiguates.
// A door can only actually sit on an edge whose own span it projects within
// (see getDoorWallExtent). Projecting past an endpoint means the door is
// somewhere off past that wall's corner, not on it. The tolerance absorbs
// the sub-unit imprecision in the source geometry that shows up everywhere
// else in this file.
const DOOR_ON_EDGE_TOLERANCE = 0.01;

function doorProjectsWithinEdge(door, edge) {
  const { minT, maxT } = getDoorWallExtent(door, edge);
  return minT >= -DOOR_ON_EDGE_TOLERANCE && maxT <= 1 + DOOR_ON_EDGE_TOLERANCE;
}

function nearestEdgeToDoor(door, edges) {
  const [roughX, roughY] = pathBoundingBoxCenter(door.d);
  let best = null;
  let bestDist = Infinity;
  for (const edge of edges) {
    const dist = pointToSegmentDistance(roughX, roughY, edge.x1, edge.y1, edge.x2, edge.y2);
    if (dist < bestDist) {
      bestDist = dist;
      best = edge;
    }
  }
  return best;
}

export function findDoorWallEdge(door, zone, neighborZoneId, zones) {
  const edgesA = ringToEdges(zone.rings[0]);
  let candidates;
  if (neighborZoneId) {
    const neighborZone = zones.find((z) => z.id === neighborZoneId);
    if (!neighborZone) return null;
    const edgesB = ringToEdges(neighborZone.rings[0]);
    candidates = edgesA.filter((edgeA) => edgesB.some((edgeB) => edgesShareBorder(edgeA, edgeB)));
  } else {
    candidates = edgesA.filter(
      (edgeA) => !zones.some((z) => z.id !== zone.id && ringToEdges(z.rings[0]).some((edgeB) => edgesShareBorder(edgeA, edgeB))),
    );
  }

  // Prefer a candidate the door genuinely projects onto. Distance alone
  // isn't enough: the bounding-box center is pulled off the wall by the
  // swing arc, so a wall the door merely points at from outside can score
  // closer than the wall it's actually set into.
  const onCandidate = candidates.filter((edge) => doorProjectsWithinEdge(door, edge));
  if (onCandidate.length > 0) return nearestEdgeToDoor(door, onCandidate);

  // Nothing in the filtered set holds the door. That's reachable for a real
  // exterior door whose wall is only PARTLY shared with a neighbour — the
  // filter above drops such an edge wholesale, even though the stretch the
  // door sits on is genuinely exterior (floor -1's hallway/garage door: its
  // bottom wall overlaps stairs__S-1 for the left half, so the whole edge was
  // discarded and the door resolved to the hallway's right wall instead,
  // putting a pinned reader out past the corner). Fall back to any edge of
  // this zone the door does project onto.
  const onAnyEdge = edgesA.filter((edge) => doorProjectsWithinEdge(door, edge));
  if (onAnyEdge.length > 0) return nearestEdgeToDoor(door, onAnyEdge);

  if (candidates.length === 0) return null;
  return nearestEdgeToDoor(door, candidates);
}

// --- door <-> zone association (for tooltips) ---
//
// Legacy door ids (from the source Figma data, e.g. "door__H01-A07") are
// unreliable to parse back into zone ids — zone codes themselves can contain
// hyphens ("G-1", "T01-a") — and a static reference captured at creation time
// would go stale after a future merge/divide. Instead, find the 1-2 zones
// geometrically nearest the door's own position, which works uniformly for
// both legacy and newly-created doors and stays correct as zones change.

// Parses only the genuine on-curve endpoints out of an SVG path `d` string:
// M/L carry an explicit (x,y) pair each; H/V carry a single coordinate and
// reuse the other axis from the current point; C's first 4 numbers are
// control points (skipped) and only the final (x,y) pair is on-curve.
export function parsePathOnCurvePoints(d) {
  const points = [];
  let x = 0;
  let y = 0;
  const commandRe = /([MLHVCZ])([^MLHVCZ]*)/gi;
  let match;
  while ((match = commandRe.exec(d))) {
    const cmd = match[1];
    const nums = match[2].trim().length ? match[2].trim().split(/[\s,]+/).map(Number) : [];
    if (cmd === 'M' || cmd === 'L') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        x = nums[i];
        y = nums[i + 1];
        points.push([x, y]);
      }
    } else if (cmd === 'H') {
      for (const n of nums) {
        x = n;
        points.push([x, y]);
      }
    } else if (cmd === 'V') {
      for (const n of nums) {
        y = n;
        points.push([x, y]);
      }
    } else if (cmd === 'C') {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        x = nums[i + 4];
        y = nums[i + 5];
        points.push([x, y]);
      }
    }
    // Z: closes back to the start, no new on-curve point.
  }
  return points;
}

export function pathBoundingBoxCenter(d) {
  const points = parsePathOnCurvePoints(d);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

export function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const [qx, qy] = projectPointOntoSegment(px, py, x1, y1, x2, y2);
  return Math.hypot(px - qx, py - qy);
}

// Returns the 1-2 zones whose boundary is nearest the door's position,
// closest first — empirically validated (against real floor_00/floor_01
// data) to correctly recover both legacy and newly-created doors' connected
// zones, including single-zone results for exterior (`-ext`) doors.
export function findDoorConnectingZones(door, zones, maxDistance = 40) {
  const [cx, cy] = pathBoundingBoxCenter(door.d);
  const distances = zones.map((zone) => {
    let minDistance = Infinity;
    for (const edge of ringToEdges(zone.rings[0])) {
      const distance = pointToSegmentDistance(cx, cy, edge.x1, edge.y1, edge.x2, edge.y2);
      if (distance < minDistance) minDistance = distance;
    }
    return { zone, distance: minDistance };
  });
  distances.sort((a, b) => a.distance - b.distance);
  return distances
    .filter((d) => d.distance <= maxDistance)
    .slice(0, 2)
    .map((d) => d.zone);
}

// Outer ring (rings[0]) only — holes (e.g. garage's cutout for the hallway
// core) describe what's carved out of a zone, not a border it shares with
// another zone.
export function areZonesAdjacent(zoneA, zoneB) {
  const edgesA = ringToEdges(zoneA.rings[0]);
  const edgesB = ringToEdges(zoneB.rings[0]);
  for (const edgeA of edgesA) {
    for (const edgeB of edgesB) {
      if (edgesShareBorder(edgeA, edgeB)) return true;
    }
  }
  return false;
}

// Adjacency graph for a whole floor: zone id -> Set of neighboring zone ids.
// Computed once (memoized by the caller against the current `zones` array)
// instead of re-testing one zone against every other zone on each click —
// same areZonesAdjacent test as above, just materialized for every pair up
// front so lookups (Merge's eligible-neighbor list, and anything else that
// needs "what's next to this zone") are a Set.has() instead of an O(n) scan.
export function buildAdjacencyGraph(zones) {
  const graph = new Map(zones.map((z) => [z.id, new Set()]));
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      if (areZonesAdjacent(zones[i], zones[j])) {
        graph.get(zones[i].id).add(zones[j].id);
        graph.get(zones[j].id).add(zones[i].id);
      }
    }
  }
  return graph;
}

// A door whose zoneA/zoneB no longer form an adjacent pair — or reference a
// zone id that doesn't exist anymore — is sitting on a wall that no longer
// exists: the shared boundary two zones had before a Merge absorbed one of
// them, or a stretch a Divide's cut moved. Rather than relying entirely on
// each edit's own explicit cleanup logic to get every case right up front
// (which is exactly what kept producing new bugs — Merge's same-pair check,
// Divide's point-in-polygon reassignment, each fixed only for the specific
// case it was tested against), this re-derives validity from the CURRENT
// adjacency graph after any edit and drops whatever no longer has a real
// wall to sit on — the same self-healing property persisting a `walls`
// array explicitly would have given for free, without actually persisting
// one (walls stay purely derived, as decided earlier, so they can't go
// stale themselves).
export function pruneOrphanedDoors(doors, zones, adjacencyGraph) {
  const zoneIds = new Set(zones.map((z) => z.id));
  return doors.filter((door) => {
    if (!zoneIds.has(door.zoneA)) return false;
    if (!door.zoneB) return true; // exterior door: only zoneA needs to still exist
    if (!zoneIds.has(door.zoneB)) return false;
    return adjacencyGraph.get(door.zoneA)?.has(door.zoneB) ?? false;
  });
}

// Unclamped projection of (px,py) onto the infinite line through edge — as
// opposed to projectPointOntoSegment, which clamps to the segment itself.
function projectPointOntoLine(px, py, edge) {
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return [px, py];
  const t = ((px - edge.x1) * dx + (py - edge.y1) * dy) / len2;
  return [edge.x1 + t * dx, edge.y1 + t * dy];
}

// turf's union() turned out to be intolerant of the sub-unit imprecision
// already known to exist in the original Figma-extracted geometry along a
// real adjacency — either a thin notch where one zone's boundary only
// touches the neighbor's line at a single point (rather than running along
// it for a stretch), or two edges that are almost but not quite
// parallel/collinear across their length. Both were confirmed (empirically,
// against real zone pairs that our own areZonesAdjacent correctly calls
// touching) to make union() come back as a MultiPolygon instead of the
// single merged Polygon it should be. Rather than re-running the global
// vertex-snap migration (scripts/snapVertices.mjs) — which only welds
// near-duplicate POINTS, not this "runs almost-but-not-quite along the same
// line" case — this snaps `zoneToAdjust`'s own edges that share a border
// with `referenceZone` (per the same edgesShareBorder used everywhere else)
// exactly onto referenceZone's matching edge line. It doesn't touch the
// stored zone data — it's only used to build the geometry actually handed
// to turf for a Merge's union call.
export function regularizeZoneForMerge(zoneToAdjust, referenceZone) {
  const ring = zoneToAdjust.rings[0].map((p) => [...p]);
  const edgesToAdjust = ringToEdges(ring);
  const edgesReference = ringToEdges(referenceZone.rings[0]);
  for (const edgeAdjust of edgesToAdjust) {
    for (const edgeRef of edgesReference) {
      if (!edgesShareBorder(edgeAdjust, edgeRef)) continue;
      ring[edgeAdjust.edgeIndex] = projectPointOntoLine(edgeAdjust.x1, edgeAdjust.y1, edgeRef);
      ring[edgeAdjust.edgeIndex + 1] = projectPointOntoLine(edgeAdjust.x2, edgeAdjust.y2, edgeRef);
    }
  }
  ring[ring.length - 1] = ring[0]; // re-enforce closure in case the first point was adjusted
  return { ...zoneToAdjust, rings: [ring, ...zoneToAdjust.rings.slice(1)] };
}

// --- polygon splitting (Divide tool) ---
//
// Splits a simple ring into two rings along the straight line between two
// points that each lie on one of the ring's edges. Classic "insert both cut
// points as real vertices, then walk the ring in each direction from one to
// the other" approach.
//
// Only handles the outer ring — a zone with holes (only the garage, on
// floor -1, has one) would need each hole reassigned to whichever half
// geometrically contains it; not implemented, since no floor a user would
// realistically divide has holed zones exposed to this gesture.
export function splitRingAtEdgePoints(ring, edgeIndexA, pointA, edgeIndexB, pointB) {
  const openRing = ring.slice(0, -1); // drop the duplicated closing vertex
  const n = openRing.length;

  let eA = edgeIndexA;
  let pA = pointA;
  let eB = edgeIndexB;
  let pB = pointB;
  if (eA > eB) {
    [eA, eB] = [eB, eA];
    [pA, pB] = [pB, pA];
  }

  const augmented = [];
  let idxA = -1;
  let idxB = -1;
  for (let i = 0; i < n; i++) {
    augmented.push(openRing[i]);
    if (i === eA) {
      idxA = augmented.length;
      augmented.push(pA);
    }
    if (i === eB) {
      idxB = augmented.length;
      augmented.push(pB);
    }
  }

  const poly1 = augmented.slice(idxA, idxB + 1);
  poly1.push(poly1[0]); // close, matching our convention (first === last)

  const poly2 = [...augmented.slice(idxB), ...augmented.slice(0, idxA + 1)];
  poly2.push(poly2[0]);

  return [poly1, poly2];
}
