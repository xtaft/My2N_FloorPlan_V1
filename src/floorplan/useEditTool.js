import { useState, useEffect, useCallback } from 'react';

/**
 * Shared activation state machine for the four edit-mode tools (Merge,
 * Divide, Add Door, Add Pin) — see ActionBarFloorPlan.jsx for the full
 * behavior spec this implements. Only ever one tool active at a time:
 * activating a new one silently replaces whatever was active, and there's
 * exactly one path back to null (plain selection mode) whether that's a
 * re-click, switching tools, or Escape.
 *
 * This intentionally only owns *which tool is active* — not any per-tool
 * in-progress gesture (e.g. "first zone clicked for Merge"). That state
 * doesn't exist yet since the actions themselves aren't implemented; when
 * they are, each one's in-progress state should reset whenever activeTool
 * changes away from it, the same way this hook already resets on deactivate.
 */
export function useEditTool() {
  const [activeTool, setActiveTool] = useState(null);

  const toggleTool = useCallback((tool) => {
    setActiveTool((prev) => (prev === tool ? null : tool));
  }, []);

  const deactivate = useCallback(() => setActiveTool(null), []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') setActiveTool(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { activeTool, toggleTool, deactivate };
}
