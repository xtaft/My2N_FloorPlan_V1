import { useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import InputBase from '@mui/material/InputBase';
import IconButton from '@mui/material/IconButton';
import Badge from '@mui/material/Badge';
import Avatar from '@mui/material/Avatar';
import PublicIcon from '@mui/icons-material/Public';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SearchIcon from '@mui/icons-material/Search';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import NotificationsIcon from '@mui/icons-material/Notifications';

// Static — captured once at mount rather than a live-ticking clock, since
// this is decorative chrome (Figma just shows "15:38") and a ticking clock
// would be a distraction with no bearing on anything this app actually does.
function useStaticClock() {
  const [time] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  return time;
}

/**
 * Matches Figma's platform-wide "<AppBar>" (node 11:31245) — the same top
 * bar every Location screen sits under. Everything past the 2N logo/My2N/
 * product switcher (search, clock, the two badged icon buttons, avatar) is
 * static chrome: it establishes "this is the real platform's app bar, not a
 * one-off header" but none of it wires to anything in this prototype.
 */
export default function LocationTopAppBar() {
  const time = useStaticClock();

  return (
    <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: '1px solid rgba(0,0,0,0.12)', zIndex: 2 }}>
      <Toolbar sx={{ minHeight: '64px !important', gap: 2 }}>
        <Box sx={{ width: 64, height: 64, ml: -3, bgcolor: 'common.black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ color: 'white', fontWeight: 700, fontSize: 14 }}>2N</Typography>
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 500 }}>
          My2N
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <PublicIcon sx={{ fontSize: 20, color: 'action.active' }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            HomePlan Co.
          </Typography>
          <ArrowDropDownIcon sx={{ color: 'action.active' }} />
        </Box>

        <Box sx={{ flex: 1 }} />

        <Box
          sx={{
            width: 320,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            border: '1px solid rgba(0,0,0,0.23)',
            borderRadius: 1,
            px: 1.5,
            py: 0.75,
          }}
        >
          <SearchIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
          <InputBase placeholder="Search" fullWidth sx={{ fontSize: 16 }} />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, pl: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccessTimeIcon sx={{ fontSize: 24, color: 'text.secondary' }} />
            <Typography color="text.secondary">{time}</Typography>
          </Box>
          <IconButton aria-label="Assistant">
            <Badge variant="dot" color="warning">
              <AutoFixHighIcon sx={{ color: 'action.active' }} />
            </Badge>
          </IconButton>
          <IconButton aria-label="Notifications">
            <Badge badgeContent={13} color="warning">
              <NotificationsIcon sx={{ color: 'action.active' }} />
            </Badge>
          </IconButton>
          <Avatar sx={{ width: 40, height: 40, bgcolor: 'primary.main' }}>R</Avatar>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
