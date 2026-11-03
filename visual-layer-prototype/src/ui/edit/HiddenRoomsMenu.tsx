/**
 * An envelope's menu of the rooms folded away inside it.
 *
 * A hidden room is in no list and cannot be clicked, so the envelope that
 * contains it is how it is reached. The ⋮ on an envelope row opens this,
 * and picking a room runs Show room on it.
 */
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { hiddenRoomsIn, type VisualLayer } from "../../model";

export interface HiddenRoomsMenuProps {
  layer: VisualLayer;
  menu: { el: HTMLElement; groupId: string } | null;
  onClose: () => void;
  onShowRoom: (roomId: string) => void;
}

export function HiddenRoomsMenu({
  layer,
  menu,
  onClose,
  onShowRoom,
}: HiddenRoomsMenuProps) {
  const hidden = menu ? hiddenRoomsIn(layer, menu.groupId) : [];
  const group = menu ? layer.groups.get(menu.groupId) : undefined;

  return (
    <Menu anchorEl={menu?.el ?? null} open={menu !== null} onClose={onClose}>
      <ListSubheader sx={{ lineHeight: "32px" }}>
        {hidden.length > 0
          ? `Show room in ${group?.name ?? ""}`
          : `Nothing hidden in ${group?.name ?? ""}`}
      </ListSubheader>
      {hidden.map((room) => (
        <MenuItem
          key={room.id}
          onClick={() => {
            onShowRoom(room.id);
            onClose();
          }}
        >
          <ListItemText
            primary={room.name}
            secondary={room.id}
            primaryTypographyProps={{ variant: "body2" }}
            secondaryTypographyProps={{ variant: "caption" }}
          />
        </MenuItem>
      ))}
      {hidden.length === 0 && (
        <MenuItem disabled>
          <ListItemText
            primary="Every room here is already shown"
            primaryTypographyProps={{ variant: "body2" }}
          />
        </MenuItem>
      )}
    </Menu>
  );
}
