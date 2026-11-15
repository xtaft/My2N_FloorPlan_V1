/**
 * The drawing grid behind a plan that can be edited.
 *
 * It is there to say which kind of screen this is. The view shows a
 * building; the editor and the segmentation review are a drawing board,
 * and a faint grid is how a drawing board has always looked — in Figma,
 * in AutoCAD — so the difference is read before any button is.
 *
 * The grid belongs to the plan, not to the window: it slides when the
 * plan is panned and grows when it is zoomed, or it would read as a
 * pattern on the glass. It is drawn as a CSS background on the
 * pan-and-zoom wrapper and moved by writing two style properties, with
 * no React render per frame of a drag.
 *
 * A grid that only scaled would close up into a grey wash zoomed out
 * and thin to nothing zoomed in. So the cell is re-divided by five
 * whenever it leaves a comfortable size on screen, the way a drawing
 * program's does; every fifth line is drawn a little stronger.
 */
import { useEffect } from "react";
import type { ReactZoomPanPinchContentRef } from "react-zoom-pan-pinch";

/** The cell at 100%, in screen pixels. */
const CELL = 24;
/** A cell is kept between these on screen, by fives. */
const SMALLEST = 12;
const LARGEST = SMALLEST * 5;
/** How many cells to a stronger line. */
const EVERY = 5;

/** Black at a few per cent, so it is faint on white and on grey alike. */
const MINOR = "rgba(0, 0, 0, 0.04)";
const MAJOR = "rgba(0, 0, 0, 0.075)";

/** The size of one cell on screen at this zoom. */
export function gridCell(scale: number): number {
  let cell = CELL * scale;
  if (!(cell > 0) || !Number.isFinite(cell)) return CELL;
  while (cell < SMALLEST) cell *= EVERY;
  while (cell >= LARGEST) cell /= EVERY;
  return cell;
}

const line = (direction: "right" | "bottom", color: string) =>
  `linear-gradient(to ${direction}, ${color} 1px, transparent 1px)`;

const IMAGE = [
  line("right", MAJOR),
  line("bottom", MAJOR),
  line("right", MINOR),
  line("bottom", MINOR),
].join(", ");

/** The two properties that change as the plan moves. */
export function gridStyle(view: {
  scale: number;
  positionX: number;
  positionY: number;
}): { backgroundSize: string; backgroundPosition: string } {
  const cell = gridCell(view.scale);
  const major = cell * EVERY;
  const at = `${view.positionX}px ${view.positionY}px`;
  return {
    backgroundSize: [major, major, cell, cell]
      .map((size) => `${size}px ${size}px`)
      .join(", "),
    // Every layer starts from the plan's own origin, so a strong line
    // always lies on a faint one.
    backgroundPosition: [at, at, at, at].join(", "),
  };
}

/**
 * Paints the grid on the library's wrapper and keeps it in step with
 * the view. Renders nothing. It goes after the TransformComponent, so
 * the wrapper exists by the time this looks for it.
 */
export function PlanGrid({ utils }: { utils: ReactZoomPanPinchContentRef }) {
  const { instance } = utils;
  useEffect(() => {
    const wrapper = instance.wrapperComponent;
    if (!wrapper) return;
    const place = (view: { scale: number; positionX: number; positionY: number }) => {
      const { backgroundSize, backgroundPosition } = gridStyle(view);
      wrapper.style.backgroundSize = backgroundSize;
      wrapper.style.backgroundPosition = backgroundPosition;
    };
    wrapper.style.backgroundImage = IMAGE;
    place(instance.state);
    const stop = instance.onTransform(place);
    return () => {
      stop();
      wrapper.style.backgroundImage = "";
      wrapper.style.backgroundSize = "";
      wrapper.style.backgroundPosition = "";
    };
  }, [instance]);
  return null;
}
