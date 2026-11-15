/**
 * Which envelopes are still worth keeping after rooms have moved.
 *
 * An envelope that holds nothing is a row that names nothing, so every
 * operation that takes a room out of one — a detach, a merge, a change
 * of category, a drag — drops the envelopes it emptied. This is that
 * rule, in one place.
 *
 * "Holds nothing" has three parts. A room is something. Another
 * envelope is something. And so is a space waiting to be placed: a
 * storage room unassigned from the map is still the shop's storage
 * room, and the shop does not stop existing because the plan has lost
 * track of where its rooms are. The drawer goes on listing the space
 * inside its group, so the group has to go on being there.
 */
import type { Group, Room, UnplacedSpace } from "./types";

export function liveGroups(
  groups: Group[],
  rooms: Room[],
  spaces: UnplacedSpace[] = [],
): Group[] {
  const used = new Set(rooms.map((r) => r.group_id).filter(Boolean));
  const hasChild = new Set(groups.map((g) => g.parent_group_id).filter(Boolean));
  const waiting = new Set(spaces.map((s) => s.group_id).filter(Boolean));
  return groups.filter(
    (g) => used.has(g.id) || hasChild.has(g.id) || waiting.has(g.id),
  );
}
