import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import PublicIcon from '@mui/icons-material/Public';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import SupervisedUserCircleIcon from '@mui/icons-material/SupervisedUserCircle';
import PaymentsIcon from '@mui/icons-material/Payments';
import SecurityIcon from '@mui/icons-material/Security';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import SupportIcon from '@mui/icons-material/Support';
import SettingsIcon from '@mui/icons-material/Settings';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

// Four icon groups separated by dividers, matching Figma's "<Drawer>"
// (node 11:31248) collapsed rail exactly — only "Locations" does anything in
// this prototype (it's where the one Location this app has lives); the rest
// render for visual fidelity only, same "present but not implemented yet"
// status as the disabled Location tabs (location/tabs.js).
const GROUPS = [
  [
    { label: 'Organizations', icon: PublicIcon, active: true },
    { label: 'Locations', icon: LocationOnIcon, path: '/' },
    { label: 'Operators', icon: SupervisedUserCircleIcon },
  ],
  [
    { label: 'Payments', icon: PaymentsIcon },
    { label: 'Security', icon: SecurityIcon },
  ],
  [
    { label: 'Legal docs', icon: PlaylistAddCheckIcon },
    { label: 'Support', icon: SupportIcon },
  ],
  [
    { label: 'Settings', icon: SettingsIcon },
    { label: 'Notification', icon: NotificationsActiveIcon },
    { label: 'My profile', icon: AccountCircleIcon },
  ],
];

export default function LocationIconRail({ onNavigate }) {
  return (
    <Box
      sx={{
        width: 56,
        flexShrink: 0,
        bgcolor: 'background.paper',
        borderRight: '1px solid rgba(0,0,0,0.12)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <Box sx={{ flex: 1, width: '100%', py: 1 }}>
        {GROUPS.map((group, i) => (
          <Box key={i}>
            {i > 0 && <Divider sx={{ my: 1 }} />}
            {group.map(({ label, icon: Icon, active, path }) => (
              <Box key={label} sx={{ display: 'flex', justifyContent: 'center', py: 0.5 }}>
                <Tooltip title={label} placement="right">
                  <IconButton
                    aria-label={label}
                    onClick={() => path && onNavigate(path)}
                    sx={{ color: active ? 'primary.main' : 'action.active' }}
                  >
                    <Icon />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
      <Tooltip title="Expand menu" placement="right">
        <IconButton aria-label="Expand menu" sx={{ mb: 1 }}>
          <ChevronRightIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
