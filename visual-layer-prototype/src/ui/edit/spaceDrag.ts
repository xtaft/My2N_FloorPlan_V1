/**
 * The drag type for a space that has no shape yet.
 *
 * Its own type rather than text/plain alone, so a room only accepts a drag
 * that is actually one of these — anything else dropped on the plan should
 * do nothing rather than be read as an id.
 */
export const SPACE_MIME = "application/x-my2n-space";

/**
 * The drag type for an unplaced device.
 *
 * Its own type so the plan only catches what it can place: a room takes
 * a space or an answering unit, a doorway half takes a reader, and
 * anything else dropped does nothing rather than being read as an id.
 */
export const DEVICE_MIME = "application/x-my2n-device";
