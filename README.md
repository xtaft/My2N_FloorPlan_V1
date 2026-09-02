# Floor Plan Editor — thesis prototype

An interactive prototype of a building floor-plan editor, built for user-interview
sessions as part of a master's thesis.

## Running locally

```bash
npm install
npm run dev
```

Then open the printed URL (default <http://localhost:5173>).

## What it does

The prototype starts on an empty **Structure** screen — the intended entry point.
From there:

1. **Floor Plan** tab → **New** → upload floor plans in the first step and a
   room-table CSV in the second → **Create Floor Plan**.

   **Any PDF works in the first step and any CSV in the second.** The prototype
   does not implement PDF segmentation, so nothing is read out of the uploaded
   files — only their names are shown back in the dialog. The floor plan that
   opens afterwards is always the same built-in demo building, whichever files
   you pick.

2. That opens the **editor**, where zones can be merged and divided, doors added,
   zone categories renamed and recoloured, and devices dragged onto zones or doors.
3. **Save** returns to the read-only **view mode**, which shows the same plan with
   the edit tools removed. Edits carry across both ways.
4. The **Structure** and **Devices** tabs list the same live data as tables.

## Notes for running a session

- **Don't reload the page mid-session.** All state is held in memory — there is no
  backend — so a browser refresh resets everything back to the empty Structure
  screen. Navigating between tabs and in and out of the editor is safe.
- `/floor-plan` can't be opened directly; it redirects back to the start, so the
  setup flow can't be skipped by accident.
- The upload step opens the real system file dialog. Browsers can't preselect a
  folder, so run through it once beforehand to point the dialog at your test files
  (`uploads_for_prototype_testing/` has a set).

## Tech

React 18 + Vite + MUI v6, with `@turf/turf` for the zone geometry (merge, divide,
adjacency) and `react-zoom-pan-pinch` for canvas pan/zoom. The floor plans render
as native SVG built from the data in `src/data/`.
