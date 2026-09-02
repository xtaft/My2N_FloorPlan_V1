import { useState } from 'react';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import SearchIcon from '@mui/icons-material/Search';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import PlaceIcon from '@mui/icons-material/Place';
import DomainIcon from '@mui/icons-material/Domain';
import LayersIcon from '@mui/icons-material/Layers';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { FLOOR_LIST } from '../floorplan/floors.js';
import { hasFloorPlanBeenCreated } from './floorPlanSession.js';

// "4" -> "Floor 04", "-1" -> "Floor -1" — matches Figma's tree labels
// (node 7:18092) exactly: zero-padded for positive floor numbers, the
// minus sign alone is enough width for negative ones.
function floorTreeLabel(label) {
  const padded = label.startsWith('-') ? label : label.padStart(2, '0');
  return `Floor ${padded}`;
}

function TreeRow({ icon, label, depth, selected, onClick, expandable, expanded, onToggleExpand }) {
  return (
    <Box
      role="button"
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 1,
        pl: 1 + depth * 3,
        pr: 1,
        bgcolor: selected ? 'rgba(33,150,243,0.08)' : 'transparent',
        cursor: 'pointer',
        '&:hover': { bgcolor: selected ? 'rgba(33,150,243,0.08)' : 'action.hover' },
      }}
    >
      {expandable ? (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          sx={{ p: 0.25, transform: expanded ? 'rotate(90deg)' : 'none' }}
        >
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      ) : (
        <Box sx={{ width: 24 }} />
      )}
      {icon}
      <Typography sx={{ fontWeight: selected ? 700 : 400, color: selected ? 'primary.dark' : 'text.primary', fontSize: 16 }}>
        {label}
      </Typography>
    </Box>
  );
}

/**
 * Matches Figma's "NavigationTreeView" — two states of the same component:
 *  - Before a floor plan exists (node 11:31249): one row, "Riverside, Prague
 *    4" selected, no children — this prototype's Structure hasn't been
 *    built out yet, so there's nothing under it.
 *  - After one does (node 7:18092, "shown after floorplan creation"): the
 *    same row now expands into Building A, and Building A into one row per
 *    floor (FLOOR_LIST, floors.js) — Building A defaults expanded (matching
 *    what that node actually shows), toggled by its own chevron.
 * Clicking the Location row goes to "/" (Structure); clicking a floor row
 * goes to the Floor Plan tab, the one place a floor is actually shown.
 */
export default function LocationNavigationTree({ onNavigate }) {
  const [buildingExpanded, setBuildingExpanded] = useState(true);
  const showTree = hasFloorPlanBeenCreated();

  return (
    <Box
      sx={{
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'grey.50',
        borderRight: '1px solid rgba(0,0,0,0.12)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 56, px: 1 }}>
        <Box
          sx={{
            flex: 1,
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
        <IconButton aria-label="Collapse all">
          <UnfoldLessIcon />
        </IconButton>
      </Box>
      <Divider />

      <TreeRow
        icon={<PlaceIcon sx={{ fontSize: 20, color: 'primary.main' }} />}
        label="Riverside, Prague 4"
        depth={0}
        selected
        onClick={() => onNavigate('/')}
        expandable={false}
      />

      {showTree && (
        <>
          <TreeRow
            icon={<DomainIcon sx={{ fontSize: 20, color: 'action.active' }} />}
            label="Building A"
            depth={1}
            onClick={() => setBuildingExpanded((prev) => !prev)}
            expandable
            expanded={buildingExpanded}
            onToggleExpand={() => setBuildingExpanded((prev) => !prev)}
          />
          {buildingExpanded &&
            FLOOR_LIST.map((floor) => (
              <TreeRow
                key={floor.floorId}
                icon={<LayersIcon sx={{ fontSize: 20, color: 'action.active' }} />}
                label={floorTreeLabel(floor.label)}
                depth={2}
                onClick={() => onNavigate('/floor-plans')}
                expandable={false}
              />
            ))}
        </>
      )}

      {/* Pushes the closing Divider to the bottom of the sidebar, matching
          Figma's TreeViewContainer (node 7:18092): a divider right under
          the search box, a second one right above the container's bottom
          edge, with the tree's own grey background filling everything in
          between — not a divider sitting flush under the last row. */}
      <Box sx={{ flex: 1 }} />
      <Divider />
    </Box>
  );
}
