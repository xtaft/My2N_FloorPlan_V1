import ThemeProvider from '@mui/material/styles/ThemeProvider';
import CssBaseline from '@mui/material/CssBaseline';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import theme from './theme.js';
import FloorPlanScreen from './screens/FloorPlanScreen.jsx';
import LocationTabScreen from './screens/LocationTabScreen.jsx';
import { FloorPlanDataProvider } from './floorplan/FloorPlanDataContext.jsx';
import { hasFloorPlanBeenCreated } from './location/floorPlanSession.js';

// Direct/bookmarked/reloaded access to /floor-plan without having gone
// through CreateFloorPlanWizard (LocationTabScreen.jsx calls
// markFloorPlanCreated() right before navigating there) bounces back to "/" —
// otherwise the prototype's real entry point (the empty Structure screen)
// is trivially skippable just by reloading the tab on /floor-plan, which is
// exactly the confusion this guard exists to prevent.
function RequireFloorPlanCreated({ children }) {
  return hasFloorPlanBeenCreated() ? children : <Navigate to="/" replace />;
}

// "/" is the Location detail page's Structure tab (Figma node 18:48644) —
// the real entry point now that the upload flow exists. Its Tabs box (see
// location/tabs.js) is how a user reaches Residents/Devices/Floor Plan;
// Floor Plan's "Create Floor Plan" action (LocationTabScreen.jsx) is the
// only way into /floor-plan, the pre-existing editor, which stays a
// separate route/screen rather than folding into this one.
//
// FloorPlanDataProvider sits ABOVE the router on purpose: the editor and the
// screens that display its results are different routes, so the floor plan's
// state has to outlive any one of them being unmounted — see
// FloorPlanDataContext.jsx.
//
// HashRouter, not BrowserRouter: this is deployed to GitHub Pages, a plain
// static file host with no rewrite rules, so a request for /floor-plans
// would 404 (there's no such file — only index.html exists). Routing after
// the "#" means every request is for index.html and the path is resolved
// client-side. URLs read localhost:5173/#/floor-plans as a result.
export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <FloorPlanDataProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<LocationTabScreen tab="structure" />} />
            <Route path="/residents" element={<LocationTabScreen tab="residents" />} />
            <Route path="/devices" element={<LocationTabScreen tab="devices" />} />
            <Route path="/floor-plans" element={<LocationTabScreen tab="floorPlan" />} />
            <Route
              path="/floor-plan"
              element={
                <RequireFloorPlanCreated>
                  <FloorPlanScreen />
                </RequireFloorPlanCreated>
              }
            />
          </Routes>
        </HashRouter>
      </FloorPlanDataProvider>
    </ThemeProvider>
  );
}
