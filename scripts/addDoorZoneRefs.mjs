// One-time (re-runnable) data migration: adds explicit zoneA/zoneB
// references to every door, and a dropPin slot to every zone, in
// src/data/*.json.
//
// Why: doors used to have no stored link to the zones they connect — that
// was inferred geometrically (findDoorConnectingZones) at render time,
// every render. Add Door already knows both zones the instant it creates a
// door; this backfills the same fields onto the legacy Figma-sourced doors,
// reusing the exact geometric inference already built and validated for the
// tooltip feature, so it only has to run once instead of on every render.
// zoneB is left null for a door with only one nearby zone (an exterior
// door, e.g. the "-ext" doors on floor_00).
//
// dropPin is a single nullable slot per zone (not an array — a zone can
// hold at most one pin) for the not-yet-implemented Add Pin tool; every
// zone gets it initialized to null here.
//
// Run with `node scripts/addDoorZoneRefs.mjs [--dry-run]` from the project
// root, after scripts/snapVertices.mjs. Re-run for any newly-imported floor
// data that hasn't been migrated yet — doors that already have zoneA are
// left untouched.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDoorConnectingZones, orderZonesForDoorName } from '../src/floorplan/geometry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

const dryRun = process.argv.includes('--dry-run');
const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));

for (const file of files) {
  const filePath = path.join(DATA_DIR, file);
  const data = JSON.parse(readFileSync(filePath, 'utf8'));

  const zones = data.zones.map((zone) => ('dropPin' in zone ? zone : { ...zone, dropPin: null }));

  let migratedCount = 0;
  const doors = data.doors.map((door) => {
    if (door.zoneA !== undefined) return door;

    const connected = findDoorConnectingZones(door, zones);
    if (connected.length === 0) {
      console.warn(`  ${file}: ${door.id} — no nearby zone found, leaving zoneA/zoneB unset`);
      return door;
    }
    migratedCount++;
    if (connected.length === 1) {
      return { ...door, zoneA: connected[0].id, zoneB: null };
    }
    const [zoneA, zoneB] = orderZonesForDoorName(connected[0], connected[1]);
    return { ...door, zoneA: zoneA.id, zoneB: zoneB.id };
  });

  console.log(`${file}: ${migratedCount} door(s) backfilled with zoneA/zoneB, ${zones.length} zone(s) got dropPin`);
  if (!dryRun) {
    writeFileSync(filePath, JSON.stringify({ ...data, zones, doors }, null, 2) + '\n');
  }
}

if (dryRun) {
  console.log('\n--dry-run: no files written.');
}
