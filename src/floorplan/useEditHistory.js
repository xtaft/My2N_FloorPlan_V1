import { useCallback, useEffect, useReducer, useRef } from 'react';

/**
 * Undo/redo over a snapshot of "the edits" — floorsData (every floor's
 * zones/doors), categories, and devices (see FloorPlanScreen.jsx, which
 * builds `current` from those three and supplies `applyRestoredState` to
 * write a snapshot back into useFloorPlanEditor's/useDevices' own state).
 * UI-only state (which floor/tool is active, drawer expanded, ...) isn't
 * part of `current` and so is never touched by undo/redo.
 *
 * Rather than have every mutator (performMerge, renameCategory, unpinDevice,
 * ...) explicitly call a "record this" function — which would mean finding
 * and touching every edit site across three files — this watches `current`
 * itself: whenever it changes to a new value the app didn't just restore
 * via undo/redo, the *previous* value is what gets pushed onto the past
 * stack. That relies on every one of those mutators already replacing
 * (never mutating) floorsData/categories/devices, which they all do.
 *
 * currentRef (not the `current` argument itself) is what undo/redo actually
 * read and write, kept in sync synchronously rather than only on the next
 * render: `current` only updates when React re-renders this hook, so two
 * undo() calls fired back-to-back before a render lands in between (e.g.
 * scripted clicks with no yield to the event loop) would otherwise both
 * read the *same* stale `current` and push it onto the future stack twice,
 * corrupting redo. currentRef sidesteps that by being the one source of
 * truth for "what's currently applied", updated immediately inside undo/
 * redo themselves as well as by the change-detection effect.
 *
 * History is capped at `maxHistory` (5 per the ask) states past *and*
 * future — an older entry is simply dropped, the same way floorsData
 * itself has no server to persist to across a page reload.
 */
export function useEditHistory(current, applyRestoredState, maxHistory = 5) {
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const currentRef = useRef(current);
  // Set right before applyRestoredState triggers the state updates that
  // change `current` — the effect below checks it to tell "the app just
  // undid/redid" apart from "the user made a new edit", since both look
  // identical from the outside (current changed to a new reference).
  const isRestoringRef = useRef(false);
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      currentRef.current = current;
      return;
    }
    if (currentRef.current === current) return; // already applied via undo/redo itself; nothing new to record
    pastRef.current = [...pastRef.current, currentRef.current].slice(-maxHistory);
    futureRef.current = []; // a fresh edit invalidates whatever redo timeline existed
    currentRef.current = current;
    forceUpdate();
  }, [current, maxHistory]);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const restored = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, currentRef.current].slice(-maxHistory);
    currentRef.current = restored;
    isRestoringRef.current = true;
    applyRestoredState(restored);
    forceUpdate();
  }, [applyRestoredState, maxHistory]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const restored = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, currentRef.current].slice(-maxHistory);
    currentRef.current = restored;
    isRestoringRef.current = true;
    applyRestoredState(restored);
    forceUpdate();
  }, [applyRestoredState, maxHistory]);

  return {
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
