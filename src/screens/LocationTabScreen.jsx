import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LocationShell from '../location/LocationShell.jsx';
import EmptyStateCard from '../location/EmptyStateCard.jsx';
import CreateFloorPlanWizard from '../location/CreateFloorPlanWizard.jsx';
import FloorPlanCreatedContent from '../location/FloorPlanCreatedContent.jsx';
import DevicesCreatedContent from '../location/DevicesCreatedContent.jsx';
import StructureCreatedContent from '../location/StructureCreatedContent.jsx';
import { markFloorPlanCreated, hasFloorPlanBeenCreated } from '../location/floorPlanSession.js';

// Every tab's empty state shares one presentation (see EmptyStateCard.jsx) —
// only this copy differs per tab.
const TAB_CONTENT = {
  structure: {
    title: 'No structure items',
    body: 'Create new structure items or upload PDFs in Floor Plan for automated creation',
  },
  residents: {
    title: 'No residents yet',
    body: 'Create residents manually or by uploading CSV',
  },
  devices: {
    title: 'No devices yet',
    body: 'Connect devices to manage the building',
  },
  floorPlan: {
    title: 'No floor plans yet',
    body: 'Upload a PDF plan of each floor to map its spaces, devices and residents.',
  },
};

// Once a floor plan has been created (CreateFloorPlanWizard, this session —
// see floorPlanSession.js), Structure/Devices/Floor Plan swap from their
// empty state to real content built off this app's actual data model
// (StructureCreatedContent/DevicesCreatedContent/FloorPlanCreatedContent).
// Residents has no such content yet, so it stays empty regardless — there's
// nothing in this prototype's data model to show there.
const CREATED_CONTENT = {
  structure: StructureCreatedContent,
  devices: DevicesCreatedContent,
  floorPlan: FloorPlanCreatedContent,
};

/**
 * One screen renders all four built Location tabs (Structure/Residents/
 * Devices/Floor Plan — see App.jsx's routes and location/tabs.js) since they
 * share the exact same shell, differing only in which content they show:
 * an empty state (copy from TAB_CONTENT) before a floor plan exists, or
 * (Structure/Devices/Floor Plan only) real content once one does.
 *
 * Floor Plan's "Create Floor Plan" action lives on the header's "New"
 * button (LocationShell's onPrimaryAction), not a button inside the empty
 * state itself — one primary entry point rather than two. It opens
 * CreateFloorPlanWizard, which — once that flow finishes — marks the floor
 * plan created for this session and navigates to the already-built editor
 * at /floor-plan with seedDevices:false (see useDevices.js): that flow only
 * ever uploads floor plans/structure, never device data, so the editor
 * should start with zero devices rather than the building's full
 * pre-existing roster. Saving or closing out of that editor
 * (AppBarNgFloorPlan.jsx) returns here, now showing FloorPlanCreatedContent
 * instead of the empty state; that content's own "Edit" action re-enters
 * /floor-plan with no such state, so the full device roster is available
 * there from then on.
 */
export default function LocationTabScreen({ tab }) {
  const navigate = useNavigate();
  const [wizardOpen, setWizardOpen] = useState(false);
  const { title, body } = TAB_CONTENT[tab];
  const CreatedContent = CREATED_CONTENT[tab];
  const showCreatedContent = !!CreatedContent && hasFloorPlanBeenCreated();

  return (
    <LocationShell activeTabKey={tab} onPrimaryAction={tab === 'floorPlan' ? () => setWizardOpen(true) : undefined}>
      {showCreatedContent ? <CreatedContent /> : <EmptyStateCard title={title} body={body} />}

      {tab === 'floorPlan' && (
        <CreateFloorPlanWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onCreateFloorPlan={() => {
            setWizardOpen(false);
            markFloorPlanCreated();
            navigate('/floor-plan', { state: { seedDevices: false } });
          }}
        />
      )}
    </LocationShell>
  );
}
