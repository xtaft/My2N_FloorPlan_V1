// Figma's raised-chrome shadow, shared by every piece of floor-plan-editor
// chrome that should read as "clearly raised above the recessed canvas"
// (ActionBarFloorPlan, DrawerFloorPlanNavigation, DrawerDropDownDrawer's
// header, and — Location / FloorPlan tab's Created state,
// FloorPlanCreatedContent.jsx — the Container previewing that same floor
// plan at the Location level). Layered (three shadows of increasing spread/
// decreasing opacity, mimicking Material's own umbra/penumbra/ambient
// layers) rather than a single flat one, which reads as a much more
// convincing "elevated" surface than one hard-edged shadow.
export const CHROME_SHADOW = [
  '6px 6px 6px rgba(0,0,0,0.25)',
  '12px 12px 12px rgba(0,0,0,0.15)',
  '18px 18px 18px rgba(0,0,0,0.08)',
].join(', ');
