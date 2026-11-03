/**
 * Making a floor plan: the steps between a building that has none and the
 * editor.
 *
 * The list of floors is the whole state of this, so it lives here as plain
 * data with plain functions over it, the same way every other operation in
 * this model works. The modals are a view of this list; the check screen is
 * a view of this list; neither owns it.
 *
 * A floor here is a *pending* floor — a page somebody dropped in, not yet a
 * storey of anything. It becomes a storey when the plan is saved, which is
 * the one moment the editor's model is involved at all.
 */

/** Which way the user said they would build the plan. */
export type CreateMethod = "pdf" | "manual";

export interface PendingFloor {
  id: string;
  /** The file it came from, or the name given to a blank one. */
  name: string;
  /**
   * What was dropped. A vector PDF is the case detection can work on; an
   * image is something to draw over; null is a blank floor, which the
   * manual path offers and the PDF path does not.
   */
  source: "pdf" | "image" | null;
  /**
   * Whether detection found spaces on it. Only a PDF can, and even then
   * not always — a scan saved as a PDF is a picture of a plan, not a plan.
   * False is what puts the check screen into its "No spaces detected"
   * state rather than being an error.
   */
  segmented: boolean;
  /**
   * Which floor is at ground level. Exactly one carries it, because the
   * storey numbers are counted from it.
   */
  ground: boolean;
  /** The user has looked at this one on the check screen. */
  checked: boolean;
}

/** Floors are held highest-first, the way the list is read and drawn. */
export type FloorList = PendingFloor[];

function freeId(taken: FloorList): string {
  const used = new Set(taken.map((f) => f.id));
  for (let n = 1; ; n += 1) {
    const id = `pending:${n}`;
    if (!used.has(id)) return id;
  }
}

/**
 * Add what was dropped, on top.
 *
 * On top because the list is highest-first and a building is built
 * upwards: dropping the pages of a scan in order should give the order
 * they were in. If that is upside down, Reverse is one click.
 */
export function addFloors(
  floors: FloorList,
  dropped: { name: string; source: "pdf" | "image" | null }[],
): FloorList {
  let out = floors;
  for (const file of dropped) {
    out = [
      ...out,
      {
        id: freeId(out),
        name: file.name,
        source: file.source,
        // A PDF is the only thing worth running detection on, and a
        // blank floor has nothing to detect.
        segmented: file.source === "pdf",
        ground: false,
        checked: false,
      },
    ];
  }
  return withOneGround(out);
}

/** A floor to draw on with nothing behind it. */
export function addBlankFloor(floors: FloorList): FloorList {
  return addFloors(floors, [
    { name: `Floor ${floors.length + 1}`, source: null },
  ]);
}

export function removeFloor(floors: FloorList, id: string): FloorList {
  return withOneGround(floors.filter((f) => f.id !== id));
}

/**
 * Move a floor to a new position in the list.
 *
 * The list is the building's section, so dragging a row is saying which
 * storey is above which — there is nothing else to express that with.
 */
export function moveFloor(
  floors: FloorList,
  id: string,
  to: number,
): FloorList {
  const from = floors.findIndex((f) => f.id === id);
  if (from < 0) return floors;
  const target = Math.max(0, Math.min(floors.length - 1, to));
  if (from === target) return floors;

  const out = [...floors];
  const [moved] = out.splice(from, 1);
  out.splice(target, 0, moved);
  return out;
}

/**
 * Turn the list upside down.
 *
 * A folder of scans is as likely to be ground-first as top-first, and
 * re-dragging eight rows to say so is not a thing to ask of anybody.
 */
export function reverseFloors(floors: FloorList): FloorList {
  return [...floors].reverse();
}

/**
 * Say which floor is at ground level.
 */
export function setGroundFloor(floors: FloorList, id: string): FloorList {
  if (!floors.some((f) => f.id === id)) return floors;
  return floors.map((f) => ({ ...f, ground: f.id === id }));
}

export function markChecked(floors: FloorList, id: string): FloorList {
  return floors.map((f) => (f.id === id ? { ...f, checked: true } : f));
}

/**
 * The bottom floor is ground until somebody says otherwise.
 *
 * Reasserted after every add and remove, because "exactly one" is an
 * invariant of the list rather than something each caller remembers.
 */
function withOneGround(floors: FloorList): FloorList {
  if (floors.length === 0) return floors;
  if (floors.filter((f) => f.ground).length === 1) return floors;

  const chosen = floors.find((f) => f.ground) ?? floors[floors.length - 1];
  return floors.map((f) => ({ ...f, ground: f.id === chosen.id }));
}

/**
 * What storey each floor is, counted from the ground one.
 *
 * The list is highest-first, so walking it backwards from the ground floor
 * counts upwards. Below ground goes negative, which is what a basement is.
 */
export function storeyLevels(floors: FloorList): Map<string, number> {
  const ground = floors.findIndex((f) => f.ground);
  const out = new Map<string, number>();
  if (ground < 0) return out;
  floors.forEach((f, i) => out.set(f.id, ground - i));
  return out;
}

/** "Ground floor", "floor 1", "basement 1" — what the storey is called. */
export function storeyName(level: number): string {
  if (level === 0) return "ground floor";
  if (level < 0) return `basement ${-level}`;
  return `floor ${level}`;
}

/**
 * Whether the plan can be saved: every floor has been looked at.
 *
 * The check step exists because detection is a guess, and a guess nobody
 * read is not a check. Saving with floors still unread would make the
 * step decorative.
 */
export function allChecked(floors: FloorList): boolean {
  return floors.length > 0 && floors.every((f) => f.checked);
}

/** The next floor needing a look, starting after the one in hand. */
export function nextUnchecked(
  floors: FloorList,
  after: string | null,
): PendingFloor | null {
  const start = after ? floors.findIndex((f) => f.id === after) + 1 : 0;
  for (let i = 0; i < floors.length; i += 1) {
    const floor = floors[(start + i) % floors.length];
    if (!floor.checked) return floor;
  }
  return null;
}
