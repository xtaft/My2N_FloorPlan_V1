/**
 * Where the product starts: a building that has everything except a plan.
 *
 * Figma: 2:24387. The icon rail, the flat space list, the building header
 * and the five tabs are the same on every tab — only the panel under them
 * changes, which is why they live here and the tables do not.
 */
import { Fragment, useMemo, useState } from "react";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import AddCircleOutline from "@mui/icons-material/AddCircle";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import ChevronRight from "@mui/icons-material/ChevronRight";
import EditOutlined from "@mui/icons-material/EditOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import MoreVert from "@mui/icons-material/MoreVert";
import NotificationsOutlined from "@mui/icons-material/NotificationsOutlined";
import PersonOutline from "@mui/icons-material/PersonOutline";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import ScheduleOutlined from "@mui/icons-material/Schedule";
import SearchIcon from "@mui/icons-material/Search";
import SecurityOutlined from "@mui/icons-material/SecurityOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import SupportOutlined from "@mui/icons-material/SupportOutlined";
import VideocamOutlined from "@mui/icons-material/VideocamOutlined";
import logoUrl from "../../assets/2n-logo.svg";
import { HEADER_BACKGROUND } from "../theme";
import { DevicesTable, OperatorsTable, ResidentsTable } from "./BuildingTabs";
import { FloorPlanTab } from "./FloorPlanTab";
import { OverviewTab } from "./OverviewTab";
import { SpaceTree } from "./SpaceTree";
import { StructureTab } from "./StructureTab";
import {
  buildingDevices,
  buildingSpaces,
  spacesByFloor,
  operators,
  residents,
  type VisualLayer,
} from "../../model";

export type BuildingTab =
  | "overview"
  | "structure"
  | "residents"
  | "devices"
  | "operators"
  | "logs"
  | "plan";

export interface BuildingScreenProps {
  layer: VisualLayer;
  buildingName: string;
  place: string;
  /** True once the wizard has been through to the end. */
  hasPlan: boolean;
  /** The header button, which has not said how, so the modal asks. */
  onCreatePlan: () => void;
  /** The empty state, which has said how, so it goes straight there. */
  onCreatePlanWith: (method: "pdf" | "manual") => void;
  onOpenPlan: () => void;
}

const TABS: { id: BuildingTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "structure", label: "Structure" },
  { id: "residents", label: "Residents" },
  { id: "devices", label: "Devices" },
  { id: "operators", label: "Operators" },
  { id: "logs", label: "Logs & Events" },
  { id: "plan", label: "Floor Plan" },
];

export function BuildingScreen({
  layer,
  buildingName,
  place,
  hasPlan,
  onCreatePlan,
  onCreatePlanWith,
  onOpenPlan,
}: BuildingScreenProps) {
  const [tab, setTab] = useState<BuildingTab>("plan");
  const [floorId, setFloorId] = useState(layer.floors[0]?.id ?? "");
  /** What the tree is pointing at, for the plan to light up. */
  const [spaceId, setSpaceId] = useState<string | null>(null);

  /** The one tab that is a screen rather than a card on the page. */
  const planFills = tab === "plan" && hasPlan;

  const spaces = useMemo(() => buildingSpaces(layer), [layer]);
  const storeys = useMemo(() => spacesByFloor(layer), [layer]);
  const people = useMemo(() => residents(layer), [layer]);
  const staff = useMemo(() => operators(layer), [layer]);
  const devices = useMemo(
    () => buildingDevices(layer, hasPlan),
    [layer, hasPlan],
  );

  /**
   * The button at the top right is whatever the tab under it is
   * about. On the plan that is making one, and once one exists it is
   * editing it — the primary thing you can do to a floor plan you are
   * looking at, which belongs beside the building's name rather than
   * tucked in among the filters.
   */
  const action: { label: string; onClick?: () => void } | null =
    tab === "devices"
      ? { label: "Add device" }
      : tab === "residents"
        ? { label: "Add resident" }
        : tab === "operators"
          ? { label: "Add operator" }
          : tab === "plan"
            ? hasPlan
              ? { label: "Edit floor plan", onClick: onOpenPlan }
              : { label: "Create Floor Plan", onClick: onCreatePlan }
            : null;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        bgcolor: "background.default",
      }}
    >
      <TopBar place={place} />

      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        <IconRail />
        <SpaceTree
          buildingName={buildingName}
          spaces={spaces}
          // Flat until the plan says which storey each space is on.
          storeys={hasPlan ? storeys : null}
          width={280}
          selectedSpaceId={hasPlan ? spaceId : null}
          selectedFloorId={hasPlan ? floorId : null}
          // Only once there is a plan is there anywhere for a click to
          // go: before it, a space has no storey and nothing to light up.
          onSelectSpace={
            hasPlan
              ? (id, floor) => {
                  setSpaceId(id);
                  if (floor) setFloorId(floor);
                }
              : undefined
          }
          onSelectFloor={
            hasPlan
              ? (id) => {
                  setFloorId(id);
                  setSpaceId(null);
                }
              : undefined
          }
        />

        {/*
          The pane carries the header's surface, and the header itself
          has no fill — it is a band of content, not a panel. The page
          grey belongs to the area under the tabs, where the cards sit,
          so that is where it is set.
        */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            bgcolor: HEADER_BACKGROUND,
          }}
        >
          <Box sx={{ px: 3, pt: 1.5, flexShrink: 0 }}>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <HomeOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
              <Crumb>{place}</Crumb>
              <Typography variant="caption" color="text.secondary">
                /
              </Typography>
              <Typography variant="caption">{buildingName}</Typography>
            </Stack>

            <Stack
              direction="row"
              alignItems="center"
              spacing={2}
              sx={{ mt: 2 }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 1,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ApartmentOutlined />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h5" fontWeight={500}>
                  {place}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Resident apartment
                </Typography>
              </Box>
              {action && (
                <Button
                  variant="contained"
                  endIcon={
                    planFills ? <EditOutlined /> : <AddCircleOutline />
                  }
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              )}
              <IconButton>
                <MoreVert />
              </IconButton>
            </Stack>

            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v as BuildingTab)}
              sx={{ mt: 1, borderBottom: 1, borderColor: "divider" }}
            >
              {TABS.map((t) => (
                <Tab key={t.id} value={t.id} label={t.label} sx={{ px: 3 }} />
              ))}
            </Tabs>
          </Box>

          {/*
            The plan fills the screen; everything else is a card on the
            page. Once there is a floor plan this tab *is* it — toolbar,
            canvas and drawer edge to edge under the tabs, with no gutter
            around them and nothing to scroll. The tables keep the page
            padding, which is the layout the empty state already had.
          */}
          <Box
            sx={
              planFills
                ? { flex: 1, minHeight: 0, display: "flex" }
                : {
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    p: 3,
                    bgcolor: "background.default",
                  }
            }
          >
            {tab === "residents" && <ResidentsTable residents={people} />}
            {tab === "devices" && <DevicesTable devices={devices} />}
            {tab === "operators" && <OperatorsTable operators={staff} />}
            {tab === "overview" && (
              <OverviewTab layer={layer} hasPlan={hasPlan} />
            )}
            {tab === "structure" && (
              <StructureTab layer={layer} hasPlan={hasPlan} />
            )}
            {tab === "logs" && <ComingSoon what="Logs & Events" />}
            {tab === "plan" && (
              <FloorPlanTab
                layer={layer}
                floorId={floorId}
                onFloorChange={setFloorId}
                selectedGroupId={spaceId}
                onClearSelection={() => setSpaceId(null)}
                hasPlan={hasPlan}
                onCreate={onCreatePlanWith}
              />
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function Crumb({ children }: { children: string }) {
  return (
    <Typography variant="caption" color="text.secondary">
      {children}
    </Typography>
  );
}

function TopBar({ place }: { place: string }) {
  return (
    <AppBar position="static" sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Toolbar disableGutters sx={{ minHeight: 64, height: 64, pr: 2 }}>
        {/* The same black 64×64 box the editor's bar has, so the logo does
            not change size between the two screens. */}
        <Box
          sx={{
            width: 64,
            height: 64,
            bgcolor: "common.black",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <img src={logoUrl} alt="2N" width={64} height={64} />
        </Box>
        <Typography variant="h6" sx={{ ml: 2 }}>
          My2N
        </Typography>
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.5}
          sx={{ ml: 3, flex: 1 }}
        >
          <LanguageOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
          <Typography variant="body1" fontWeight={500}>
            HomePlan Co.
          </Typography>
        </Stack>

        <TextField
          size="small"
          placeholder="Search"
          sx={{ width: 280 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
        />
        <Stack direction="row" alignItems="center" spacing={1} sx={{ ml: 2 }}>
          <ScheduleOutlined sx={{ fontSize: 20, color: "text.secondary" }} />
          <Typography variant="body2" color="text.secondary">
            15:38
          </Typography>
          <IconButton size="small">
            <AutoAwesome sx={{ fontSize: 20 }} />
          </IconButton>
          <IconButton size="small">
            <Badge badgeContent={13} color="error">
              <NotificationsOutlined sx={{ fontSize: 20 }} />
            </Badge>
          </IconButton>
          <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.main" }}>
            R
          </Avatar>
        </Stack>
        <Box sx={{ display: "none" }}>{place}</Box>
      </Toolbar>
    </AppBar>
  );
}

/**
 * The product's own navigation, which this prototype does not implement —
 * drawn because the screen is unreadable without it, and inert because
 * every one of these is a different part of My2N.
 *
 * Four groups with a rule between them, as the design has it: the rail is
 * 56 wide, its rows are 48 tall, and it ends with the control that widens
 * it into labels.
 */
const RAIL: React.ElementType[][] = [
  [LanguageOutlined, PlaceOutlined, PersonOutline],
  [VideocamOutlined, SecurityOutlined],
  [FactCheckOutlined, SupportOutlined],
  [SettingsOutlined, NotificationsOutlined, BadgeOutlined],
];

function IconRail() {
  let n = 0;
  return (
    <Box
      sx={{
        width: 56,
        flexShrink: 0,
        borderRight: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {RAIL.map((group, g) => (
        <Fragment key={g}>
          {g > 0 && <Divider flexItem sx={{ width: "100%" }} />}
          <Box sx={{ py: 1, width: "100%" }}>
            {group.map((Icon, i) => {
              const first = n++ === 0;
              return (
                <Box
                  key={i}
                  sx={{
                    height: 48,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconButton size="small" disabled>
                    <Icon
                      sx={{
                        fontSize: 20,
                        color: first ? "primary.main" : undefined,
                      }}
                    />
                  </IconButton>
                </Box>
              );
            })}
          </Box>
        </Fragment>
      ))}
      <Box sx={{ flex: 1 }} />
      <Box
        sx={{
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IconButton size="small" disabled>
          <ChevronRight sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>
    </Box>
  );
}

function ComingSoon({ what }: { what: string }) {
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 8,
        textAlign: "center",
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {what} is outside what this prototype covers.
      </Typography>
    </Box>
  );
}
