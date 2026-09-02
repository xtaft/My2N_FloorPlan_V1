// Deterministic pseudo-randomness for the Created tables' mockup columns
// (StructureCreatedContent/DevicesCreatedContent) that have no real data
// model behind them in this prototype — Figma's own columns (Status/State/
// My2N ID/Integrations/Alerts/...) are UI chrome, not backed by anything.
// Hashing a row's stable id rather than calling Math.random() means the
// fabricated values stay put across re-renders, search filtering, and
// pagination instead of reshuffling on every keystroke.
export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function pick(hash, salt, options) {
  return options[(hash + salt) % options.length];
}
