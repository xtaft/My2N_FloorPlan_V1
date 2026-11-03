# Visual Layer prototype

The round-two floor-plan prototype, built on the architecture in
[`docs/floor-plan-visual-layer.md`](docs/floor-plan-visual-layer.md).

It is a separate app from the round-one editor at the repository root. That one
stays as it is; this one starts from the new data model, where **access is
evaluated per room** rather than per apartment.

## Running it

```bash
npm install
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

## The one rule

**Store only what cannot be derived. Derive everything else.** Three facts are
stored — a wall holds the two rooms it separates, a door holds the wall it sits
in, a room holds the group it belongs to. Everything else is computed on demand.

So the fixture contains no room polygons, no room pair on a door, no list of a
room's doors, no adjacency graph. `src/model/` computes all of it:

| Module | What it derives |
|---|---|
| `rings.ts` | room shapes, by angular traversal of the wall set; ring counting by `E - V + C`; even-odd hit-testing; label points |
| `geometry.ts` | the wall normal and which side is `room_a`; door openings from `t`, `width`, `hinge` and `swing`; the solid spans of a wall with its doors removed |
| `access.ts` | a door's room pair, type inheritance, the adjacency index, the reachability search and the route that explains it |
| `derive.ts` | a room's doors and neighbours, an envelope's outer walls and entrances, a device's side of its door, which walls are drawn |

## The data

`src/fixtures/visual_layer.json` is imported statically, so Vite bundles it and
nothing is fetched at runtime. It is a five-storey building: 101 rooms, 407
walls, 105 doors, 63 devices and 32 distinct access profiles covering 59
residents and staff.

`data/` holds the same records split per entity plus the two Python scripts that
produced them, as provenance. `build_visual_layer.py` needs the upstream
SVG-extraction datasets, which are not in this repository; `verify_visual_layer.py`
runs against the fixture directly.

Two things in the fixture are worth knowing:

- Its `note` field says the ground floor was not supplied. That is **stale** —
  floor 0 is present and is where the building entrance is.
- Apartment 7 on every floor was segmented without an entrance door. The build
  script repaired it with the ordinary add-door operation and added the entrance
  reader the other flats have; `repairs` records all four.

## The tests

`npm test` runs the checks from `data/verify_visual_layer.py`, ported, so a
divergence between the Python reference and the TypeScript port fails the suite
rather than showing up as a wrong map. They cover referential integrity, the
orientation convention over all 407 walls, ring extraction, door placement,
device placement, type inheritance and reachability.

Two are worth singling out, because both failure modes look like rendering bugs:

- **`room_a` is on the left walking `v1 → v2`.** Plans come from SVG, where y
  grows downward, so left-of-travel is `(dy, -dx)` and not the `(-dy, dx)` of a
  y-up system. The test steps a short way along each wall's normal and asserts
  the point lands inside `room_a`'s extracted shape.
- **A reader is drawn inside the room it guards.** The side is derived from
  `guards` against the wall's room pair, never stored, and the test asserts the
  glyph lands inside the guarded room.

One detail the port had to settle: the angular walk traces *every* face of a
room's wall graph, so a simple room yields two rings — the bounded interior and
the unbounded exterior, the same curve walked in opposite senses. Handing both
to an even-odd fill cancels the room out, so `interiorRings()` keeps the bounded
one. The slit rooms pin down which sign that is: in `1:L6` the interior walk
runs down both sides of the slit wall (13 vertices for 12 walls) while the
exterior walk never touches it (11), and it is the 13 that comes out negative.

## What the app shows

- **Floor tabs** with the storey `level` spelled out, because drawer order and
  level are independent and an order of 3, 5, 4 is legal.
- **The containment tree** — floor ⊃ envelope ⊃ room, nesting to any depth.
- **The map**: rooms filled by their inherited space type, walls drawn only
  where the derived rule says to (the two rooms are in different envelopes, or
  either room is surfaced), swing arcs from `hinge` and `swing`, readers on the
  side they guard.
- **An access profile** picker. Choosing one runs the search from the lobby and
  paints three states — reachable, blocked at a named door, and never examined
  because something upstream was blocked. The last two are deliberately not the
  same grey: only one of them is actionable.
- **Show all rooms** — a view toggle that reveals the rooms the surfacing rule
  hides. It stores nothing.

## Not built

This is the model layer and a viewer. The editing operations the architecture
describes — `split_wall`, wall deletion and the room merge it implies, group
split and merge, the undo stack — are specified in the doc but not implemented
here.
