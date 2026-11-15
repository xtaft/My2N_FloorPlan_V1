/**
 * What a category holds, under its name. Figma 42:70620.
 *
 * "X spaces" is every space the category holds, placed or not, so the
 * second figure reads as a part of the first: four spaces, one of which
 * has nowhere to be yet. Counting only the placed ones would make
 * unassigning a space look like losing it.
 *
 * The unplaced half — a rule, the count and the orange mark — is drawn
 * only when there is something unplaced: a space imported from a rooms
 * table that matched nothing on the plan, or one taken off it. A
 * trailing "0 unplaced" on every category would be noise on a building
 * nobody has imported a list into.
 *
 * Used by the editor's categories drawer and the view's space list, so
 * the two cannot count the same category differently.
 */
import Box from "@mui/material/Box";
import { AttentionBadge } from "./AttentionBadge";

export function CategoryTally({
  spaces,
  unplaced,
}: {
  spaces: number;
  unplaced: number;
}) {
  return (
    <Box
      component="span"
      sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}
    >
      <span>
        {spaces} space{spaces === 1 ? "" : "s"}
      </span>
      {unplaced > 0 && (
        <>
          <Box
            component="span"
            sx={{ width: "1px", height: 16, bgcolor: "divider" }}
          />
          <span>{unplaced} unplaced</span>
          <AttentionBadge label="Has unplaced spaces" />
        </>
      )}
    </Box>
  );
}
