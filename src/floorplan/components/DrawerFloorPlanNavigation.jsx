import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import ButtonBase from '@mui/material/ButtonBase';
import { FLOOR_LIST } from '../floors.js';
import { CHROME_SHADOW } from '../chromeShadow.js';

/**
 * Matches Figma's "<Drawer> FloorPlanNavigation" (node 55:89767), Collapsed
 * variant — a vertical rail of floor number buttons. This is the one piece
 * of navigation chrome that's actually wired up: clicking a floor switches
 * which floor's data the editor canvas renders.
 *
 * boxShadow (not `elevation`): same layered shadow as ActionBarFloorPlan and
 * DrawerDropDownDrawer's header — all three chrome pieces read at one raised
 * level above the recessed canvas (keep this value in sync with
 * CHROME_SHADOW in those two files if it ever changes). It's three layered
 * shadows of increasing spread/decreasing opacity (mimicking Material's own
 * umbra/penumbra/ambient layers) rather than one flat shadow, which reads as
 * a much more convincing "elevated" surface. MUI's `elevation` prop renders
 * a shadow that blurs outward on every side regardless of offset; since
 * this Drawer is DOM-earlier than ActionBarFloorPlan (a normal-flow sibling
 * immediately to its right, so ActionBarFloorPlan paints after/on top of
 * it), a symmetric shadow's leftward-from-ActionBarFloorPlan reach doesn't
 * apply here, but a symmetric shadow on THIS Paper would still bleed
 * *upward* into the AppBar above. Each layer's offset equals its own blur
 * radius, so none of them can bleed backward like that.
 *
 * position: 'relative' + zIndex: 1: the *rightward* shadow, onto the canvas
 * beside this Drawer, needs this to even be visible: canvas is a later
 * sibling in the DOM tree (nested inside the column to this Drawer's
 * right), so without an explicit stacking order it paints over this
 * Paper's shadow rather than receiving it. (CHROME_SHADOW itself now lives
 * in chromeShadow.js, shared with ActionBarFloorPlan, DrawerDropDownDrawer,
 * and FloorPlanCreatedContent.jsx.)
 */
export default function DrawerFloorPlanNavigation({ activeFloorId, onSelectFloor }) {
  return (
    <Paper
      elevation={0}
      square
      sx={{
        width: 64,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        py: 1,
        position: 'relative',
        zIndex: 1,
        boxShadow: CHROME_SHADOW,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          flex: 1,
          minHeight: 0,
          width: '100%',
          overflowY: 'auto',
        }}
      >
        {FLOOR_LIST.map(({ floorId, label }) => {
          const isActive = floorId === activeFloorId;
          return (
            <ButtonBase
              key={floorId}
              onClick={() => onSelectFloor(floorId)}
              sx={{
                width: 40,
                height: 36,
                borderRadius: 1,
                fontSize: 14,
                fontWeight: 500,
                color: isActive ? 'primary.main' : 'rgba(0,0,0,0.87)',
                border: isActive ? '1px solid' : '1px solid transparent',
                borderColor: isActive ? 'primary.main' : 'transparent',
                bgcolor: isActive ? 'rgba(33,150,243,0.04)' : 'transparent',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
              }}
            >
              {label}
            </ButtonBase>
          );
        })}
      </Box>
    </Paper>
  );
}
