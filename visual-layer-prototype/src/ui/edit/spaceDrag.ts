/**
 * The drag type for a space that has no shape yet.
 *
 * Its own type rather than text/plain alone, so a room only accepts a drag
 * that is actually one of these — anything else dropped on the plan should
 * do nothing rather than be read as an id.
 */
export const SPACE_MIME = "application/x-my2n-space";
