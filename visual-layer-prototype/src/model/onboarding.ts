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
  /**
   * The storey this page already stands for, when it was added to a
   * building that has a plan. The first wizard pairs pages with the
   * drawn floors by position; a page added later has its own floor
   * from the start, and says so.
   */
  floor_id?: string;
}

/** Floors are held highest-first, the way the list is read and drawn. */
export type FloorList = PendingFloor[];

/**
 * How many storeys the plan ends up with.
 *
 * The building behind this prototype has five, and the check screen shows
 * a real drawn floor for each one. So however many pages are dropped in,
 * the wizard settles on five: fewer and there would be storeys with
 * nothing to check, more and there would be pages with no floor behind
 * them. In the product this is however many pages were uploaded.
 */
export const BUILDING_FLOORS = 5;

/**
 * Which storey a page's name says it is, if it says.
 *
 * "ground", "first", "2nd", "floor 3", "level 4", "L2", "F1", a bare
 * number — the ways a plan's page gets named. Null when the name says
 * nothing, which "a.pdf" and "scan 2024" do not.
 */
export function storeyFromName(name: string): number | null {
  const n = name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[_\-]+/g, " ")
    .trim();
  if (/\b(ground|gf|g)\b/.test(n)) return 0;
  // "basement", "basement 2", "b1" — but not a bare "b", which is
  // what a page called b.pdf is, and says nothing.
  const base = n.match(/\bbasement\s*(\d+)?\b/) ?? n.match(/\bb(\d+)\b/);
  if (base) return -(Number(base[1] ?? 1));
  const words: Record<string, number> = {
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
    sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  };
  for (const [w, v] of Object.entries(words)) {
    if (new RegExp(`\\b${w}\\b`).test(n)) return v;
  }
  const tagged = n.match(/\b(?:floor|level|storey|story|l|f|p)\s*(\d+)(?:st|nd|rd|th)?\b/);
  if (tagged) return Number(tagged[1]);
  const ordinal = n.match(/\b(\d+)(?:st|nd|rd|th)\b/);
  if (ordinal) return Number(ordinal[1]);
  const bare = n.match(/^(\d+)$/);
  if (bare) return Number(bare[1]);
  return null;
}

/**
 * Match the pages to the building's storeys.
 *
 * The check screen shows the drawn floors the prototype has, and each
 * page has to stand for one of them — the right one, and in the right
 * order, whether or not the ground floor was marked correctly in the
 * upload. So the match is read off the pages rather than off the
 * marker: a page whose name says which storey it is goes to that
 * storey, and the rest fill the storeys left over, from the ground up,
 * in the order the list has them from the bottom. A storey no page
 * stands for gets a page of its own, named for the storey. More pages
 * than storeys, and the ones that would be above the roof are left
 * out. Each page then knows its floor, and the ground floor is the
 * page at level 0 — which is where the marker ends up, not where it
 * started.
 */
export function fitToBuilding(
  floors: FloorList,
  count = BUILDING_FLOORS,
): FloorList {
  const levels = new Map<string, number>();
  const taken = new Set<number>();
  /** Pages whose names say where they go — even somewhere there is not. */
  const named = new Set<string>();

  // Pages that say where they go, first come first placed. One that
  // names a storey the building does not have is left out rather than
  // put somewhere it did not say: "7" is not a page of the ground floor.
  for (const f of floors) {
    const said = storeyFromName(f.name);
    if (said === null) continue;
    named.add(f.id);
    if (said < 0 || said >= count || taken.has(said)) continue;
    levels.set(f.id, said);
    taken.add(said);
  }
  // The rest fill in from the ground up, reading the list from the
  // bottom — the list is highest-first, so its bottom is its ground.
  let next = 0;
  for (const f of [...floors].reverse()) {
    if (levels.has(f.id) || named.has(f.id)) continue;
    while (taken.has(next)) next += 1;
    if (next >= count) break;
    levels.set(f.id, next);
    taken.add(next);
  }

  let out: FloorList = floors
    .filter((f) => levels.has(f.id))
    .map((f) => ({ ...f, ground: false, floor_id: `${levels.get(f.id)}:floor` }));
  for (let level = 0; level < count; level += 1) {
    if (taken.has(level)) continue;
    out = [
      ...out,
      {
        id: freeId(out),
        name: storeyName(level),
        // A page of the storey's own stands for a page, and is checked
        // like one.
        source: "pdf" as const,
        segmented: true,
        ground: false,
        checked: false,
        floor_id: `${level}:floor`,
      },
    ];
    levels.set(out[out.length - 1].id, level);
  }

  out.sort((a, b) => levels.get(b.id)! - levels.get(a.id)!);
  return out.map((f) => ({ ...f, ground: levels.get(f.id) === 0 }));
}

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
