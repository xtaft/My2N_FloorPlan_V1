/**
 * Importing a list of spaces from a spreadsheet.
 *
 * The template states the contract and this follows it: one row is one
 * space; Name is required and Floor, Type and Note are optional; matching
 * ignores case, surrounding spaces and diacritics; and a row is matched
 * first against the plan, then against the structure, and failing both is
 * added as a space still to be placed.
 *
 * Nothing is deleted. A name or a type is replaced only where a row matched
 * something, which is what makes importing the same list twice an update
 * rather than a second copy of the building.
 */
import { commit, OperationRejected, type EditState } from "./edit";
import type { VisualLayer } from "./load";
import type { Room, UnplacedSpace } from "./types";

export interface SpaceRow {
  name: string;
  floor: string;
  type: string;
  note: string;
  /** The spreadsheet row this came from, for reporting. */
  line: number;
}

/**
 * Case, surrounding space and diacritics are ignored when matching, as the
 * template promises. A list typed by hand in a building whose plans came
 * from somewhere else will not agree on any of the three.
 */
export function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const HEADERS = ["name", "floor", "type", "note"] as const;
type Header = (typeof HEADERS)[number];

/**
 * Find the header row and read what follows it.
 *
 * The header is searched for rather than assumed at row 1: the template
 * carries a title and an instruction line above it, and a manager who adds
 * another note above that should not break the import.
 */
export function parseSpaceList(grid: string[][]): SpaceRow[] {
  let headerAt = -1;
  let columns: Partial<Record<Header, number>> = {};

  for (let r = 0; r < grid.length && headerAt < 0; r += 1) {
    const found: Partial<Record<Header, number>> = {};
    grid[r].forEach((cell, c) => {
      const key = normalise(cell) as Header;
      if (HEADERS.includes(key) && found[key] === undefined) found[key] = c;
    });
    if (found.name !== undefined) {
      headerAt = r;
      columns = found;
    }
  }

  if (headerAt < 0) {
    throw new OperationRejected(
      "No Name column found. The first row of the list has to name its columns — Name, and optionally Floor, Type and Note.",
    );
  }

  const at = (row: string[], key: Header) => {
    const c = columns[key];
    return c === undefined ? "" : (row[c] ?? "").trim();
  };

  const rows: SpaceRow[] = [];
  for (let r = headerAt + 1; r < grid.length; r += 1) {
    const name = at(grid[r], "name");
    if (name === "") continue; // blank rows pad every template
    rows.push({
      name,
      floor: at(grid[r], "floor"),
      type: at(grid[r], "type"),
      note: at(grid[r], "note"),
      line: r + 1,
    });
  }
  return rows;
}

export type MatchKind =
  /** Named a space drawn on the plan. */
  | "plan"
  /** Named a space in the structure that has no shape yet. */
  | "structure"
  /** Named nothing here; it joins the list of spaces to place. */
  | "new";

export interface SpaceMatch {
  row: SpaceRow;
  kind: MatchKind;
  /** The room it matched, for "plan". */
  roomId?: string;
  /** The unplaced space it matched, for "structure". */
  spaceId?: string;
  /** Resolved from the Floor column, null when it names no floor here. */
  floorId: string | null;
  /** Resolved from the Type column, null for unknown. */
  typeId: string | null;
  /** The row names a floor this building does not have. */
  unknownFloor: boolean;
  /** The row names a category this building does not have. */
  unknownType: boolean;
}

/**
 * Work out what each row would do, without doing any of it.
 *
 * Two rows naming the same space would otherwise both claim it and the
 * second would silently win, so a space is claimed once: the first row to
 * match it takes it and later ones fall through to the next step.
 */
export function matchSpaceList(
  layer: VisualLayer,
  rows: SpaceRow[],
): SpaceMatch[] {
  const floorByName = new Map(
    layer.floors.map((f) => [normalise(f.name), f.id]),
  );
  const typeByName = new Map(
    layer.file.space_types.map((t) => [normalise(t.name), t.id]),
  );

  const claimedRooms = new Set<string>();
  const claimedSpaces = new Set<string>();

  return rows.map((row) => {
    const floorId = row.floor === "" ? null : (floorByName.get(normalise(row.floor)) ?? null);
    const typeId = row.type === "" ? null : (typeByName.get(normalise(row.type)) ?? null);
    const key = normalise(row.name);

    // 1. a space on the plan, within the floor when one was given
    const room = layer.file.rooms.find(
      (r) =>
        !claimedRooms.has(r.id) &&
        normalise(r.name) === key &&
        (floorId === null || r.floor_id === floorId),
    );
    if (room) {
      claimedRooms.add(room.id);
      return {
        row,
        kind: "plan",
        roomId: room.id,
        floorId,
        typeId,
        unknownFloor: row.floor !== "" && floorId === null,
        unknownType: row.type !== "" && typeId === null,
      };
    }

    // 2. a space already in the structure, waiting to be placed
    const space = (layer.file.unplaced_spaces ?? []).find(
      (s) =>
        !claimedSpaces.has(s.id) &&
        normalise(s.name) === key &&
        (floorId === null || s.floor_id === floorId),
    );
    if (space) {
      claimedSpaces.add(space.id);
      return {
        row,
        kind: "structure",
        spaceId: space.id,
        floorId,
        typeId,
        unknownFloor: row.floor !== "" && floorId === null,
        unknownType: row.type !== "" && typeId === null,
      };
    }

    // 3. nothing here by that name
    return {
      row,
      kind: "new",
      floorId,
      typeId,
      unknownFloor: row.floor !== "" && floorId === null,
      unknownType: row.type !== "" && typeId === null,
    };
  });
}

export interface ImportSummary {
  matchedOnPlan: number;
  matchedInStructure: number;
  added: number;
  unknownFloors: number;
  unknownTypes: number;
}

export function summarise(matches: SpaceMatch[]): ImportSummary {
  return {
    matchedOnPlan: matches.filter((m) => m.kind === "plan").length,
    matchedInStructure: matches.filter((m) => m.kind === "structure").length,
    added: matches.filter((m) => m.kind === "new").length,
    unknownFloors: matches.filter((m) => m.unknownFloor).length,
    unknownTypes: matches.filter((m) => m.unknownType).length,
  };
}

function freeSpaceId(taken: Set<string>): string {
  for (let n = 1; ; n += 1) {
    const id = `space:${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Apply an import.
 *
 * A matched space is renamed to the spelling in the list — matching ignores
 * case and accents, so "lobby" matching "Lobby" is a match worth taking and
 * the list is the newer statement of the two. Its category is set only when
 * the row named one: a blank Type column says nothing, and saying nothing
 * is not the same as saying unknown.
 */
export function applySpaceList(
  state: EditState,
  matches: SpaceMatch[],
): EditState {
  const { file } = state;
  if (matches.length === 0) {
    throw new OperationRejected("That list has no rows in it.");
  }

  const byRoom = new Map<string, SpaceMatch>();
  const bySpace = new Map<string, SpaceMatch>();
  for (const m of matches) {
    if (m.kind === "plan" && m.roomId) byRoom.set(m.roomId, m);
    if (m.kind === "structure" && m.spaceId) bySpace.set(m.spaceId, m);
  }

  const rooms: Room[] = file.rooms.map((room) => {
    const m = byRoom.get(room.id);
    if (!m) return room;
    return {
      ...room,
      name: m.row.name,
      space_type: m.row.type === "" ? room.space_type : m.typeId,
      note: m.row.note === "" ? (room.note ?? null) : m.row.note,
    };
  });

  const taken = new Set((file.unplaced_spaces ?? []).map((s) => s.id));
  const existing: UnplacedSpace[] = (file.unplaced_spaces ?? []).map((space) => {
    const m = bySpace.get(space.id);
    if (!m) return space;
    return {
      ...space,
      name: m.row.name,
      floor_id: m.floorId ?? space.floor_id,
      space_type: m.row.type === "" ? space.space_type : m.typeId,
      note: m.row.note === "" ? space.note : m.row.note,
    };
  });

  const added: UnplacedSpace[] = [];
  for (const m of matches) {
    if (m.kind !== "new") continue;
    const id = freeSpaceId(taken);
    taken.add(id);
    added.push({
      id,
      name: m.row.name,
      floor_id: m.floorId,
      space_type: m.typeId,
      note: m.row.note === "" ? null : m.row.note,
    });
  }

  const summary = summarise(matches);
  return commit(
    state,
    "import_spaces",
    `Import ${matches.length} space${matches.length === 1 ? "" : "s"}`,
    {
      ...file,
      rooms,
      unplaced_spaces: [...existing, ...added],
      counts: { ...file.counts, imported_spaces: summary.added },
    },
  );
}
