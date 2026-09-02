// One-time (re-runnable) data migration: welds near-coincident zone-ring
// vertices in src/data/*.json to identical coordinates.
//
// Why: each zone's boundary was extracted from Figma independently, so a
// wall shared by two zones is actually two slightly different polylines —
// off by anywhere from ~0 to ~2 units (door-jamb notches, wall-face vs.
// centerline extraction differences). That forces every adjacency/edge
// check elsewhere in the app (geometry.js) to use an epsilon instead of
// exact equality. Welding once, here, lets those checks - and a future
// vertex-sharing-based adjacency graph - use exact equality instead.
//
// EPSILON was chosen empirically, not guessed: a full pairwise-distance scan
// of every real floor file's vertices showed a clean gap between "the same
// physical corner, split by extraction noise" (all pairs <= ~2.0 units) and
// "genuinely distinct corners" (nothing closer than ~6.3 units). 2.5 sits
// in the middle of that gap. Verified after clustering that no merged
// cluster has a diameter (max internal pairwise distance) anywhere near
// that boundary - see the maxDist values logged by --dry-run.
//
// Run with `node scripts/snapVertices.mjs [--dry-run]` from the project
// root. Re-run any time new Figma-exported floor data lands in src/data/.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const EPSILON = 2.5;

function unionFind(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  return { find, union };
}

function snapZones(zones, epsilon) {
  const refs = [];
  zones.forEach((zone, zoneIdx) => {
    zone.rings.forEach((ring, ringIdx) => {
      ring.forEach((p, pointIdx) => {
        refs.push({ zoneIdx, ringIdx, pointIdx, x: p[0], y: p[1] });
      });
    });
  });

  const uf = unionFind(refs.length);
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      const d = Math.hypot(refs[i].x - refs[j].x, refs[i].y - refs[j].y);
      if (d <= epsilon) uf.union(i, j);
    }
  }

  const clusters = new Map();
  for (let i = 0; i < refs.length; i++) {
    const root = uf.find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(refs[i]);
  }

  const diagnostics = [];
  const snapped = zones.map((z) => ({ ...z, rings: z.rings.map((r) => r.map((p) => [...p])) }));
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    let maxDist = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        maxDist = Math.max(maxDist, Math.hypot(members[i].x - members[j].x, members[i].y - members[j].y));
      }
    }
    diagnostics.push({ size: members.length, maxDist });

    const cx = Math.round((members.reduce((s, m) => s + m.x, 0) / members.length) * 1000) / 1000;
    const cy = Math.round((members.reduce((s, m) => s + m.y, 0) / members.length) * 1000) / 1000;
    for (const m of members) {
      snapped[m.zoneIdx].rings[m.ringIdx][m.pointIdx] = [cx, cy];
    }
  }

  return { zones: snapped, diagnostics };
}

const dryRun = process.argv.includes('--dry-run');
const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));

for (const file of files) {
  const filePath = path.join(DATA_DIR, file);
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const { zones, diagnostics } = snapZones(data.zones, EPSILON);
  const worstDiameter = diagnostics.reduce((max, d) => Math.max(max, d.maxDist), 0);
  console.log(
    `${file}: ${diagnostics.length} vertex clusters welded, worst cluster diameter ${worstDiameter.toFixed(4)} units`,
  );
  if (!dryRun) {
    writeFileSync(filePath, JSON.stringify({ ...data, zones }, null, 2) + '\n');
  }
}

if (dryRun) {
  console.log('\n--dry-run: no files written.');
}
