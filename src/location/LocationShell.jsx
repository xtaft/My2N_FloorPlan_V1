import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Avatar from '@mui/material/Avatar';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import ApartmentIcon from '@mui/icons-material/Apartment';
import LocationTopAppBar from './LocationTopAppBar.jsx';
import LocationIconRail from './LocationIconRail.jsx';
import LocationNavigationTree from './LocationNavigationTree.jsx';
import { LOCATION_TABS } from './tabs.js';

/**
 * The platform-wide chrome every Location screen sits in (Figma's "Location
 * / FloorPlan - Empty", node 11:31242): LocationTopAppBar across the top,
 * then a row of LocationIconRail (56px) + LocationNavigationTree (280px) +
 * this page's own Header (breadcrumbs, avatar, title, tab bar) and content.
 *
 * activeTabKey picks which tab renders selected; clicking any tab (or the
 * tree's own Location row, or the rail's Locations icon) with a `path` (see
 * tabs.js) navigates there. Tabs with no path (Overview/Operators/Logs &
 * Events — no screen exists for them in this prototype) render disabled,
 * same as the rest of this app's "present but not wired up yet" chrome.
 *
 * The header's "New" button is this screen's one primary action (filled,
 * not outlined, so it reads as such) — onPrimaryAction is only ever passed
 * for the Floor Plan tab (LocationTabScreen.jsx wires it to open
 * CreateFloorPlanWizard, the same wizard EmptyStateCard's own action button
 * used to trigger before it was removed in favor of this single header
 * entry point); every other tab leaves it undefined, so the button renders
 * inert there, consistent with the rest of this app's "present but not
 * wired up yet" chrome.
 */
export default function LocationShell({ activeTabKey, onPrimaryAction, children }) {
  const navigate = useNavigate();
  const activeTab = LOCATION_TABS.find((t) => t.key === activeTabKey) ?? LOCATION_TABS[0];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', bgcolor: 'background.default' }}>
      <LocationTopAppBar />

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <LocationIconRail onNavigate={navigate} />
        <LocationNavigationTree onNavigate={navigate} />

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ bgcolor: '#f5f5f5', borderBottom: '1px solid rgba(0,0,0,0.12)', px: 3, pt: 1 }}>
            <Breadcrumbs separator="/" sx={{ fontSize: 14, pb: 1 }}>
              <Link
                underline="hover"
                color="text.secondary"
                href="#"
                onClick={(e) => e.preventDefault()}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 14 }}
              >
                <ApartmentIcon sx={{ fontSize: 16 }} />
                Riverside, Prague 4
              </Link>
              <Typography color="text.primary" sx={{ fontSize: 14 }}>
                Tower A
              </Typography>
            </Breadcrumbs>

            <Box sx={{ display: 'flex', alignItems: 'center', pb: 1 }}>
              <Avatar variant="rounded" sx={{ width: 56, height: 56, bgcolor: 'primary.main' }}>
                <ApartmentIcon sx={{ fontSize: 35 }} />
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0, pl: 2, pr: 6 }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  Riverside, Prague 4
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Resident apartment
                </Typography>
              </Box>
              <Button variant="contained" color="primary" endIcon={<AddCircleIcon />} onClick={onPrimaryAction}>
                New
              </Button>
            </Box>

            <Tabs value={activeTab.key} textColor="primary" indicatorColor="primary" variant="scrollable" scrollButtons={false}>
              {LOCATION_TABS.map((tab) => (
                <Tab
                  key={tab.key}
                  value={tab.key}
                  label={tab.label}
                  disabled={!tab.path}
                  onClick={() => tab.path && navigate(tab.path)}
                />
              ))}
            </Tabs>
            <Divider />
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 3 }}>{children}</Box>
        </Box>
      </Box>
    </Box>
  );
}
