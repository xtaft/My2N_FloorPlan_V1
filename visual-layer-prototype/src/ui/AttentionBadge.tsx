/**
 * The small orange "!" that says something here wants attention: a
 * category with spaces that are not on the plan, a floor that does not
 * sit over the one below. One mark for both, so it reads as one thing.
 */
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";

export function AttentionBadge({
  label,
  hint,
}: {
  /** What it means, for a screen reader. */
  label: string;
  /** The same, on hover — where the row has no words for it. */
  hint?: string;
}) {
  const mark = (
    <Box
      component="span"
      role="img"
      aria-label={label}
      sx={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        bgcolor: "#ef6c00",
        color: "#ffffff",
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      !
    </Box>
  );
  return hint ? <Tooltip title={hint}>{mark}</Tooltip> : mark;
}
