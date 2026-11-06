/**
 * What can be done to a door once it is in a wall.
 *
 * A door's orientation is two characters, both read off the drawing's swing
 * arc: `hinge` says which end of the wall the arc centres on, `swing` says
 * which room the leaf opens into. Segmentation gets them from the arc, and
 * when the arc was ambiguous it gets them wrong — so both need flipping by
 * hand, and neither is derivable from anything else.
 */
import { commit, OperationRejected, type EditState } from "./edit";
import { must } from "./load";
import type { Device, Door } from "./types";

function physical(state: EditState, doorId: string): Door {
  const door = must(state.layer.doors, doorId, "door");
  if (door.kind === "virtual" || door.wall_id === null) {
    throw new OperationRejected(
      `${door.name} is a vertical link between storeys, not a door in a wall. It has no sides to flip.`,
    );
  }
  return door;
}

/**
 * Which room the leaf opens into. The arc is drawn on that side, so getting
 * it wrong puts the swing through the neighbour's wall.
 */
export function flipDoorSwing(state: EditState, doorId: string): EditState {
  const door = physical(state, doorId);
  const swing = door.swing === "a" ? "b" : "a";
  return commit(state, "flip_door", "Flip wall side", {
    ...state.file,
    doors: state.file.doors.map((d) =>
      d.id === doorId ? { ...d, swing } : d,
    ),
  });
}

/** Which end of the wall the leaf is hinged on, so which way the arc sweeps. */
export function flipDoorHinge(state: EditState, doorId: string): EditState {
  const door = physical(state, doorId);
  const hinge = door.hinge === "v1" ? "v2" : "v1";
  return commit(state, "flip_door", "Flip opening side", {
    ...state.file,
    doors: state.file.doors.map((d) =>
      d.id === doorId ? { ...d, hinge } : d,
    ),
  });
}

/**
 * Take a door out. The wall closes up and the two rooms stop being joined
 * there.
 *
 * A device on it is orphaned, never deleted — the same rule as when a wall
 * goes. A reader is a provisioned physical asset, and losing its record
 * because someone edited a doorway would lose a real device.
 */
export function deleteDoor(state: EditState, doorId: string): EditState {
  const { file } = state;
  const door = must(state.layer.doors, doorId, "door");

  const devices: Device[] = file.devices.map((d) =>
    d.host_kind === "door" && d.host_id === doorId
      ? { ...d, host_id: null, guards: [] }
      : d,
  );

  return commit(state, "delete_door", "Delete door", {
    ...file,
    doors: file.doors.filter((d) => d.id !== door.id),
    devices,
    unplaced_devices: devices.filter((d) => d.host_id === null).map((d) => d.id),
  });
}
