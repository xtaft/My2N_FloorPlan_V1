// 2N device icons, taken from the '2NDS Device icons' Figma library
// (file f31kD0k2QAJR1TQFobhlCK). Each entry is the 'outline' variant of that
// device's icon, at the largest icon size the library ships (the bigger
// assets in those frames are detailed product illustrations, not icons).
//
// The path data is transcribed verbatim from Figma's own SVG export rather
// than redrawn, and is stored as data — not as a ready-made <svg> element —
// so the same icon can render two ways: as a normal <svg> in the drawer
// (DeviceIcon.jsx) and as bare <path> elements inside the floor plan's own
// SVG (DeviceItemMarker in FloorPlanCanvas.jsx). That second case is why
// this isn't just a set of MUI-style icon components: nesting an <svg>
// inside the plan's <svg> without explicit width/height attributes makes it
// default to 100% x 100% of the viewport, which silently scaled a white
// glyph across the whole floor plan.
//
// viewBoxes are NOT square and differ per device (an IP Style is tall and
// narrow, an Indoor View is wide) — renderers must letterbox rather than
// assume 24x24.
export const DEVICE_ICONS = {
  indoorView: {
    figmaName: "2-30-0-0 Indoor View outline",
    nodeId: "2510:48321",
    width: 32,
    height: 24,
    paths: [
      { d: "M28 18H4V3H28V18ZM5 17H27V4H5V17Z", evenOdd: true },
      { d: "M31.4834 0C31.7684 0 31.9999 0.233453 32 0.521484V23.4785L31.9893 23.583C31.9413 23.8209 31.7329 24 31.4834 24H0.516602L0.412109 23.9893C0.21042 23.9475 0.0518855 23.7869 0.0107422 23.583L0 23.4785V0.521484C0.00011912 0.269478 0.177012 0.0593876 0.412109 0.0107422L0.516602 0H31.4834ZM1 23H31V21H1V23ZM1 20H31V1H1V20Z", evenOdd: true },
    ],
  },
  indoorTouch: {
    figmaName: "3-1-0-0 Indoor Touch outline",
    nodeId: "2510:48603",
    width: 32,
    height: 23,
    paths: [
      { d: "M10.5 20C10.7761 20 11 20.2239 11 20.5C11 20.7761 10.7761 21 10.5 21H5.5C5.22386 21 5 20.7761 5 20.5C5 20.2239 5.22386 20 5.5 20H10.5Z" },
      { d: "M18.5 20C18.7761 20 19 20.2239 19 20.5C19 20.7761 18.7761 21 18.5 21H13.5C13.2239 21 13 20.7761 13 20.5C13 20.2239 13.2239 20 13.5 20H18.5Z" },
      { d: "M26.5 20C26.7761 20 27 20.2239 27 20.5C27 20.7761 26.7761 21 26.5 21H21.5C21.2239 21 21 20.7761 21 20.5C21 20.2239 21.2239 20 21.5 20H26.5Z" },
      { d: "M27 16H5V3H27V16ZM6 15H26V4H6V15Z", evenOdd: true },
      { d: "M31.4834 0C31.7683 0 31.9998 0.23606 32 0.527344V18.4727L31.9893 18.5781C31.9413 18.8188 31.733 19 31.4834 19H29.8086L27.9473 22.7236L27.8086 23H4.19141L4.05273 22.7236L2.19141 19H0.516602L0.412109 18.9893C0.21039 18.947 0.0518692 18.7845 0.0107422 18.5781L0 18.4727V0.527344C0.000200587 0.27249 0.177054 0.0599297 0.412109 0.0107422L0.516602 0H31.4834ZM4.80859 22H27.1914L28.6914 19H3.30859L4.80859 22ZM1 18H31V1H1V18Z", evenOdd: true },
    ],
  },
  indoorClip: {
    figmaName: "2-34-0-0 IP Clip outline",
    nodeId: "2510:48639",
    width: 16,
    height: 18,
    paths: [
      { d: "M5 11.5C5.27614 11.5 5.5 11.7239 5.5 12C5.5 12.2761 5.27614 12.5 5 12.5C4.72386 12.5 4.5 12.2761 4.5 12C4.5 11.7239 4.72386 11.5 5 11.5Z" },
      { d: "M8 11.5C8.27614 11.5 8.5 11.7239 8.5 12C8.5 12.2761 8.27614 12.5 8 12.5C7.72386 12.5 7.5 12.2761 7.5 12C7.5 11.7239 7.72386 11.5 8 11.5Z" },
      { d: "M11 11.5C11.2761 11.5 11.5 11.7239 11.5 12C11.5 12.2761 11.2761 12.5 11 12.5C10.7239 12.5 10.5 12.2761 10.5 12C10.5 11.7239 10.7239 11.5 11 11.5Z" },
      { d: "M14 16H2V2H14V16ZM3 15H13V10H3V15ZM3 9H13V3H3V9Z", evenOdd: true },
      { d: "M16 18H0V0H16V18ZM1 17H15V1H1V17Z", evenOdd: true },
    ],
  },
  ipStyle: {
    figmaName: "2-31-0-0 IP Style outline",
    // Confirmed against Figma node 53:85398 (Floor-Plan-Feature file) — the
    // previous path data here was a leftover extraction-script bug (the
    // literal string "icon", not real path data), which rendered nothing at
    // all. This is the correct outline, transcribed the same way as every
    // other entry in this file.
    nodeId: "53:85398",
    width: 16,
    height: 32,
    paths: [
      {
        d: "M16 32H0V0H16V32ZM1 31H15V7H1V31ZM14 27H2V8H14V27ZM3 26H13V9H3V26ZM1 6H15V1H1V6ZM3.60059 2.00977C3.6321 2.0162 3.66236 2.02602 3.69141 2.03809C3.69787 2.04077 3.70364 2.04491 3.70996 2.04785C3.72952 2.05696 3.74852 2.06665 3.7666 2.07812C3.77848 2.08565 3.78961 2.09407 3.80078 2.10254C3.81446 2.11293 3.82732 2.12403 3.83984 2.13574C3.84863 2.14394 3.85706 2.15233 3.86523 2.16113C3.87768 2.17457 3.88946 2.18838 3.90039 2.20312C3.90821 2.21365 3.91586 2.22421 3.92285 2.23535C3.93206 2.25006 3.9396 2.26557 3.94727 2.28125C3.95297 2.29289 3.95906 2.30428 3.96387 2.31641C3.97075 2.3338 3.97554 2.35183 3.98047 2.37012C3.98371 2.38214 3.98788 2.39389 3.99023 2.40625C3.99601 2.43668 4 2.4679 4 2.5C4 2.77614 3.77614 3 3.5 3H2.5C2.22386 3 2 2.77614 2 2.5C2 2.22386 2.22386 2 2.5 2H3.5C3.53443 2 3.56811 2.00314 3.60059 2.00977Z",
        evenOdd: true,
      },
    ],
  },
  ipVerso: {
    figmaName: "2-14-0-0 IP Verso outline",
    nodeId: "2503:18505",
    width: 16,
    height: 32,
    paths: [
      { d: "M13 29H3V17H13V29ZM4 28H12V18H4V28Z", evenOdd: true },
      { d: "M10 6H6V5H10V6Z" },
      { d: "M13 15H3V3H13V15ZM4 14H12V12H4V14ZM4 8V11H12V8H11V9H5V8H4ZM10 7H12V4H4V7H6V8H10V7Z", evenOdd: true },
      { d: "M16 32H0V0H16V32ZM1 31H15V1H1V31Z", evenOdd: true },
    ],
  },
  accessUnit: {
    figmaName: "2-16-0-0 IP Access Unit, 2.0 outline",
    nodeId: "2513:54867",
    width: 24,
    height: 28,
    paths: [
      { d: "M12 25C12.2761 25 12.5 25.2239 12.5 25.5C12.5 25.7761 12.2761 26 12 26C11.7239 26 11.5 25.7761 11.5 25.5C11.5 25.2239 11.7239 25 12 25Z" },
      { d: "M9.75684 11.5547L9.66504 11.6455C9.12021 12.1879 8.78223 12.9407 8.78223 13.7676C8.78223 14.5936 9.11972 15.3399 9.66504 15.8828L9.75684 15.9746L9.2041 16.5283L9.11328 16.4375C8.42771 15.755 8 14.8119 8 13.7676C8.00001 12.724 8.42713 11.7739 9.11328 11.0908L9.2041 11L9.75684 11.5547Z" },
      { d: "M14.8867 11.0977C15.5723 11.7801 16 12.7232 16 13.7676C16 14.8119 15.5723 15.755 14.8867 16.4375L14.7959 16.5283L14.2432 15.9746L14.335 15.8828C14.8803 15.3399 15.2178 14.5936 15.2178 13.7676C15.2178 12.9416 14.8803 12.1953 14.335 11.6523L14.2432 11.5605L14.7959 11.0068L14.8867 11.0977Z" },
      { d: "M11.0137 12.8057L10.9219 12.8965C10.7017 13.1157 10.5646 13.4234 10.5645 13.7607C10.5645 14.0983 10.7016 14.4067 10.9219 14.626L11.0137 14.7168L10.4609 15.2715L10.3701 15.1797C10.0073 14.8185 9.78125 14.3133 9.78125 13.7607C9.78136 13.2084 10.0074 12.7029 10.3701 12.3418L10.4609 12.251L11.0137 12.8057Z" },
      { d: "M13.6299 12.3418C13.9926 12.7029 14.2186 13.2084 14.2188 13.7607C14.2188 14.3133 13.9927 14.8185 13.6299 15.1797L13.5391 15.2715L12.9863 14.7168L13.0781 14.626C13.2984 14.4067 13.4355 14.0983 13.4355 13.7607C13.4354 13.4234 13.2983 13.1157 13.0781 12.8965L12.9863 12.8057L13.5391 12.251L13.6299 12.3418Z" },
      { d: "M12 13.123C12.3578 13.123 12.6475 13.4114 12.6475 13.7676C12.6475 14.1238 12.3578 14.4121 12 14.4121C11.6422 14.4121 11.3525 14.1238 11.3525 13.7676C11.3525 13.4114 11.6422 13.123 12 13.123Z" },
      { d: "M20 23H4V4H20V23ZM5 22H19V5H5V22Z", evenOdd: true },
      { d: "M24 28H0V0H24V28ZM1 27H23V1H1V27Z", evenOdd: true },
    ],
  },
};
