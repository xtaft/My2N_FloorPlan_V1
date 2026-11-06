/**
 * "What can this profile reach, and where were they turned away." The
 * traversal output is directly the render input, so this panel and the map read
 * the same object.
 */
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  accessType,
  doorsOfRoom,
  envelopeChain,
  neighboursOf,
  roomsOf,
  routeTo,
  spaceTypeName,
  type Reachability,
  type VisualLayer,
} from "../model";

export interface AccessPanelProps {
  layer: VisualLayer;
  profileId: string | null;
  onProfileChange: (id: string | null) => void;
  reach: Reachability | null;
  startRoom: string;
  selectedRoomId: string | null;
}

export function AccessPanel({
  layer,
  profileId,
  onProfileChange,
  reach,
  startRoom,
  selectedRoomId,
}: AccessPanelProps) {
  const profile = profileId
    ? layer.profiles.find((p) => p.id === profileId)
    : null;
  const selected = selectedRoomId ? layer.rooms.get(selectedRoomId) : undefined;

  const route =
    reach && selected ? routeTo(layer, reach, selected.id) : [];

  return (
    <Box sx={{ p: 2, overflowY: "auto", height: "100%" }}>
      <FormControl fullWidth size="small">
        <InputLabel id="profile-label">Access profile</InputLabel>
        <Select
          labelId="profile-label"
          label="Access profile"
          value={profileId ?? ""}
          onChange={(e) =>
            onProfileChange(e.target.value === "" ? null : String(e.target.value))
          }
        >
          <MenuItem value="">
            <em>None — show the plan unrestricted</em>
          </MenuItem>
          {layer.profiles.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.id} · {p.people_count}{" "}
              {p.people_count === 1 ? "person" : "people"} ·{" "}
              {p.devices.join(", ")}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
        {layer.profiles.length} distinct permission sets across{" "}
        {layer.profiles.reduce((n, p) => n + p.people_count, 0)} residents and
        staff. A profile is a permission set, not a person — grouping them is
        what keeps the search cheap.
      </Typography>

      {profile && reach && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2">
            From {layer.rooms.get(startRoom)?.name ?? startRoom}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Reaches <strong>{reach.seen.size - 1}</strong> of{" "}
            {layer.file.rooms.length} rooms. Turned away at{" "}
            <strong>{reach.blocked.size}</strong>{" "}
            {reach.blocked.size === 1 ? "door" : "doors"}.
          </Typography>

          {reach.blocked.size > 0 && (
            <Stack spacing={0.5} sx={{ mt: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Blocked at a named door — the actionable case:
              </Typography>
              {[...reach.blocked.entries()].slice(0, 8).map(([roomId, doorId]) => (
                <Typography key={roomId} variant="caption">
                  {layer.rooms.get(roomId)?.name ?? roomId} — refused by{" "}
                  {layer.doors.get(doorId)?.name ?? doorId}
                </Typography>
              ))}
              {reach.blocked.size > 8 && (
                <Typography variant="caption" color="text.secondary">
                  …and {reach.blocked.size - 8} more
                </Typography>
              )}
            </Stack>
          )}
        </>
      )}

      {selected && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2">{selected.name}</Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {selected.id}
          </Typography>

          <Stack spacing={0.5} sx={{ mt: 1 }}>
            <Row label="Type">
              {spaceTypeName(layer, selected)}
              {selected.space_type === null && (
                <Typography component="span" variant="caption" color="text.secondary">
                  {" "}
                  (inherited)
                </Typography>
              )}
            </Row>
            <Row label="Envelope">
              {envelopeChain(layer, selected)
                .map((id) => layer.groups.get(id)?.name ?? id)
                .reverse()
                .join(" › ")}
            </Row>
            <Row label="Walls">{selected.walls.length}</Row>
            <Row label="Doors">{doorsOfRoom(layer, selected).length}</Row>
            <Row label="Neighbours">{neighboursOf(layer, selected).size}</Row>
            <Row label="Surfaced">{selected.surfaced ? "yes" : "no"}</Row>
            <Row label="Access type">{accessType(layer, selected) ?? "—"}</Row>
          </Stack>

          {route.length > 0 && (
            <>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1.5, display: "block" }}
              >
                Route — walking the search backwards explains the answer rather
                than asserting it:
              </Typography>
              <Typography variant="caption">
                {route
                  .map((d) => `${d.name}${d.kind === "virtual" ? " (shaft)" : ""}`)
                  .join(" → ")}
              </Typography>
            </>
          )}

          {reach && !reach.seen.has(selected.id) && (
            <Typography variant="caption" sx={{ mt: 1.5, display: "block" }}>
              {reach.blocked.has(selected.id)
                ? `Refused at ${
                    layer.doors.get(reach.blocked.get(selected.id)!)?.name
                  }.`
                : "Never examined — something upstream was blocked first."}
            </Typography>
          )}

          {doorsOfRoom(layer, selected).length > 0 && (
            <>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1.5, display: "block" }}
              >
                Doors, derived from the room's walls:
              </Typography>
              {doorsOfRoom(layer, selected).map((door) => {
                const devices = layer.devicesOnDoor.get(door.id) ?? [];
                const other = roomsOf(layer, door).find((r) => r !== selected.id);
                return (
                  <Typography key={door.id} variant="caption" component="div">
                    {door.name} → {layer.rooms.get(other ?? "")?.name ?? other}
                    {devices.length > 0 &&
                      ` · ${devices.map((d) => d.name).join(", ")}`}
                  </Typography>
                );
              })}
            </>
          )}
        </>
      )}
    </Box>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", gap: 1, fontSize: 13 }}>
      <Box sx={{ minWidth: 92, color: "text.secondary" }}>{label}</Box>
      <Box>{children}</Box>
    </Box>
  );
}
