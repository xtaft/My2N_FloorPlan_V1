/**
 * The wheel and the touchpad, zooming the plan a little at a time.
 *
 * The pan-and-zoom library adds its step to the scale, and in its
 * smooth mode multiplies that step by the wheel's raw delta first. A
 * mouse sends about a hundred per notch, so one notch went straight to
 * a limit: all the way in, or all the way out. Its wheel is switched
 * off where this is used, and the scale is set from here instead.
 *
 * Zoom is a ratio, so the step is one too: a notch is about a tenth
 * whatever the scale already is, where an added step is a crawl when
 * zoomed in and a lurch when zoomed out. The point under the pointer
 * stays under it.
 */
import { useEffect } from "react";
import type { ReactZoomPanPinchContentRef } from "react-zoom-pan-pinch";

/** Per pixel of scroll: a mouse notch of 100 comes to about a tenth. */
const PER_PIXEL = 0.001;
/**
 * A pinch on a touchpad arrives as a wheel event with ctrl held and a
 * delta of a few units, so it needs ten times the weight to feel like
 * the same gesture.
 */
const PER_PINCH = 0.01;
/**
 * The most one event may change the scale by, as an exponent — about a
 * tenth. A free-spinning wheel and ctrl + wheel both send deltas far
 * larger than the gesture they stand for.
 */
const MOST = 0.1;

/** Firefox reports lines, and some mice pages; the rest report pixels. */
const LINE = 33;
const PAGE = 400;

/** What one wheel event multiplies the scale by. */
export function wheelFactor(e: {
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
}): number {
  const pixels =
    e.deltaMode === 1 ? e.deltaY * LINE : e.deltaMode === 2 ? e.deltaY * PAGE : e.deltaY;
  const by = -pixels * (e.ctrlKey ? PER_PINCH : PER_PIXEL);
  return Math.exp(Math.max(-MOST, Math.min(MOST, by)));
}

/**
 * Where the view ends up: the new scale, held inside its limits, and
 * the offset that keeps the pointer over the same point of the plan.
 */
export function zoomAbout(
  view: { scale: number; positionX: number; positionY: number },
  pointer: { x: number; y: number },
  factor: number,
  minScale: number,
  maxScale: number,
): { scale: number; positionX: number; positionY: number } {
  const scale = Math.max(minScale, Math.min(maxScale, view.scale * factor));
  const ratio = scale / view.scale;
  return {
    scale,
    positionX: pointer.x - (pointer.x - view.positionX) * ratio,
    positionY: pointer.y - (pointer.y - view.positionY) * ratio,
  };
}

/**
 * Listens on the library's wrapper and renders nothing. It goes after
 * the TransformComponent, so the wrapper exists by the time this looks
 * for it; the wrapper's own wheel has to be disabled alongside.
 */
export function WheelZoom({
  utils,
  minScale,
  maxScale,
}: {
  utils: ReactZoomPanPinchContentRef;
  minScale: number;
  maxScale: number;
}) {
  const { instance, setTransform } = utils;
  useEffect(() => {
    const wrapper = instance.wrapperComponent;
    if (!wrapper) return;
    const onWheel = (e: WheelEvent) => {
      // Not passive, for this: the page must not scroll under the plan,
      // and a pinch must not zoom the whole browser.
      e.preventDefault();
      const box = wrapper.getBoundingClientRect();
      const next = zoomAbout(
        instance.state,
        { x: e.clientX - box.left, y: e.clientY - box.top },
        wheelFactor(e),
        minScale,
        maxScale,
      );
      if (next.scale === instance.state.scale) return;
      setTransform(next.positionX, next.positionY, next.scale, 0);
    };
    wrapper.addEventListener("wheel", onWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", onWheel);
  }, [instance, setTransform, minScale, maxScale]);
  return null;
}
