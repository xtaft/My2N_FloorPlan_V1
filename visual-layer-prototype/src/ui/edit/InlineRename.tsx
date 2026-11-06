/**
 * Renaming, in the row itself. Figma 88:154627 — a bordered field with a
 * tick and a cross at its right end, filling the row it replaces.
 *
 * In the row rather than in a dialog because the name is the row: a dialog
 * would take the thing being renamed off screen at the moment you are
 * deciding what to call it, and leave you naming it from memory.
 */
import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Check from "@mui/icons-material/Check";
import Close from "@mui/icons-material/Close";

export interface InlineRenameProps {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  placeholder?: string;
}

export function InlineRename({
  value,
  onChange,
  onCommit,
  onCancel,
  placeholder = "Item name",
}: InlineRenameProps) {
  const field = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  const valid = value.trim().length > 0;

  return (
    <Box
      // The row's own click handlers would select or fold the thing being
      // renamed out from under the field.
      onClick={(e) => e.stopPropagation()}
      sx={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        pl: 1.5,
        pr: 0.5,
        height: 40,
        borderRadius: 1,
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <InputBase
        inputRef={field}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && valid) onCommit();
          if (e.key === "Escape") onCancel();
        }}
        sx={{ flex: 1, minWidth: 0, fontSize: 16 }}
      />
      <IconButton size="small" disabled={!valid} onClick={onCommit}>
        <Check sx={{ fontSize: 20 }} />
      </IconButton>
      <IconButton size="small" onClick={onCancel}>
        <Close sx={{ fontSize: 20 }} />
      </IconButton>
    </Box>
  );
}
