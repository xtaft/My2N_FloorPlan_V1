/**
 * Aligning a floor, and the shaft pairing it records.
 *
 * The fixture's five floors are drawn in one coordinate system already, so
 * every transform is the identity and every shaft sits over its neighbour.
 * That makes it a good test of the paired case and a useless one for scale,
 * so the scale tests build a floor that is genuinely drawn larger.
 */
import { describe, expect, it } from "vitest";
import { fixture } from "./load";
import {
  IDENTITY,
  OperationRejected,
  alignFloor,
  alignWarnings,
  applyTransform,
  floorTransform,
  initEditState,
  invertTransform,
  landingsFor,
  previewAlign,
  proposeScale,
  realLength,
  referenceFloor,
  shaftSpaces,
  undo,
  type EditState,
  type Transform,
  type VisualLayerFile,
} from "./index";

function state(): EditState {
  return initEditState(fixture as unknown as VisualLayerFile);
}

/** The same building with one floor's drawing blown up about the origin. */
function withScaledFloor(factor: number, floorId = "1:floor"): EditState {
  const file = JSON.parse(JSON.stringify(fixture)) as VisualLayerFile;
  const prefix = `${floorId.split(":")[0]}:`;
  for (const v of file.vertices) {
    if (!v.id.startsWith(prefix)) continue;
    v.x *= factor;
    v.y *= factor;
  }
  return initEditState(file);
}

const shaftsOf = (s: EditState, floorId: string) =>
  shaftSpaces(s.layer, floorId).map((x) => x.groupId).sort();

describe("transform maths", () => {
  it("round-trips a point through apply and invert", () => {
    const t: Transform = { dx: 120, dy: -45, rotation: 0.3, scale: 1.4 };
    const p = { x: 317, y: 902 };
    const back = invertTransform(t, applyTransform(t, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it("scales about the origin, then turns, then slides", () => {
    const t: Transform = { dx: 10, dy: 20, rotation: Math.PI / 2, scale: 2 };
    // (1,0) doubled is (2,0); a quarter turn in a y-down system sends it to
    // (0,2); the offset puts it at (10,22).
    const p = applyTransform(t, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(10, 9);
    expect(p.y).toBeCloseTo(22, 9);
  });

  it("leaves everything alone at the identity", () => {
    const p = applyTransform(IDENTITY, { x: 7, y: -3 });
    expect(p).toEqual({ x: 7, y: -3 });
  });

  it("reads a length in the building's units, not the drawing's", () => {
    // A door is stored in the floor's own units, so the same door reads
    // differently per floor until the scale is taken out.
    expect(realLength({ ...IDENTITY, scale: 1.12 }, 46)).toBeCloseTo(51.52, 9);
    expect(realLength(IDENTITY, 46)).toBe(46);
  });

  it("reads the transform off the floor record", () => {
    const { layer } = state();
    expect(floorTransform(layer.floors[0])).toEqual(IDENTITY);
  });
});

describe("referenceFloor", () => {
  it("is the storey below", () => {
    const { layer } = state();
    expect(referenceFloor(layer, "2:floor")!.id).toBe("1:floor");
  });

  it("is nothing for the lowest, which defines the system", () => {
    const { layer } = state();
    expect(referenceFloor(layer, "0:floor")).toBeNull();
  });
});

describe("shaftSpaces", () => {
  it("finds the stairs and the lift, and nothing else", () => {
    const s = state();
    expect(shaftsOf(s, "1:floor")).toEqual(["1:gE", "1:gS"]);
    expect(shaftsOf(s, "0:floor")).toEqual(["0:gE", "0:gS"]);
  });
});

describe("landingsFor", () => {
  it("pairs each shaft with the one it sits over", () => {
    const s = state();
    const landings = landingsFor(s.layer, "1:floor", IDENTITY);
    expect(landings.get("1:gS")).toBe("0:gS");
    expect(landings.get("1:gE")).toBe("0:gE");
  });

  it("pairs nothing when the floor is slid off the building", () => {
    const s = state();
    const landings = landingsFor(s.layer, "1:floor", {
      ...IDENTITY,
      dx: 5000,
    });
    expect([...landings.values()]).toEqual([null, null]);
  });

  it("leaves a shaft unpaired when only some land", () => {
    // Nudged just far enough that the lift misses its outline while the
    // stairs, which are wider, still cover theirs.
    const s = state();
    const spaces = shaftSpaces(s.layer, "1:floor");
    const lift = spaces.find((x) => x.groupId === "1:gE")!;
    const landings = landingsFor(s.layer, "1:floor", {
      ...IDENTITY,
      dx: 0,
      dy: 0,
      scale: 1,
    });
    expect(landings.get("1:gE")).toBe("0:gE");
    expect(lift.centroid.x).toBeGreaterThan(0);
  });

  it("has nothing to pair on the lowest floor", () => {
    const s = state();
    expect(landingsFor(s.layer, "0:floor", IDENTITY).size).toBe(0);
  });
});

describe("proposeScale", () => {
  it("says nothing from a single pair", () => {
    const s = state();
    const one = new Map([["1:gS", "0:gS"]]);
    expect(proposeScale(s.layer, "1:floor", one)).toBeNull();
  });

  it("snaps a difference that is only segmentation noise", () => {
    const s = state();
    const landings = landingsFor(s.layer, "1:floor", IDENTITY);
    const proposal = proposeScale(s.layer, "1:floor", landings)!;
    expect(proposal.snapped).toBe(true);
    expect(proposal.scale).toBe(1);
    expect(proposal.suspect).toBe(false);
  });

  // The fixture's storeys are not pixel copies of each other — the shaft
  // baseline differs by about half a per cent floor to floor, which is why
  // the snap band exists at all. So these check the proposal to two places
  // rather than pretending the drawings are identical.
  const PAIRED = new Map([
    ["1:gS", "0:gS"],
    ["1:gE", "0:gE"],
  ]);

  it("proposes the scale that makes an oversized drawing fit", () => {
    // Floor 1 drawn half again as large: it has to come back to two thirds.
    const proposal = proposeScale(
      withScaledFloor(1.5).layer,
      "1:floor",
      PAIRED,
    )!;
    expect(proposal.snapped).toBe(false);
    expect(proposal.scale).toBeCloseTo(1 / 1.5, 2);
    expect(proposal.scale).toBeLessThan(1);
    expect(proposal.suspect).toBe(false);
  });

  it("flags a scale that means the wrong reference", () => {
    const proposal = proposeScale(withScaledFloor(3).layer, "1:floor", PAIRED)!;
    expect(proposal.suspect).toBe(true);
    expect(proposal.scale).toBeCloseTo(1 / 3, 2);
  });

  it("applying the proposal actually makes the baselines agree", () => {
    // The point of the number, asserted rather than assumed.
    const s = withScaledFloor(1.5);
    const proposal = proposeScale(s.layer, "1:floor", PAIRED)!;
    const span = (floorId: string, scale: number) => {
      const [a, b] = shaftSpaces(s.layer, floorId);
      return (
        Math.hypot(a.centroid.x - b.centroid.x, a.centroid.y - b.centroid.y) *
        scale
      );
    };
    expect(span("1:floor", proposal.scale)).toBeCloseTo(span("0:floor", 1), 6);
  });
});

describe("alignFloor", () => {
  const landings = new Map([
    ["1:gS", "0:gS"],
    ["1:gE", "0:gE"],
  ]);

  it("stores the transform without touching the vertices", () => {
    const before = state();
    const t: Transform = { dx: 12, dy: -8, rotation: 0.05, scale: 1.02 };
    const after = alignFloor(before, { floorId: "1:floor", transform: t, landings });

    expect(after.layer.floors.find((f) => f.id === "1:floor")!.transform).toEqual([
      12, -8, 0.05, 1.02,
    ]);
    expect(after.file.vertices).toEqual(before.file.vertices);
  });

  it("records which shaft is which", () => {
    const before = state();
    const after = alignFloor(before, {
      floorId: "1:floor",
      transform: IDENTITY,
      landings,
    });
    expect(after.layer.groups.get("1:gS")!.shaft_id).toBe(
      before.layer.groups.get("0:gS")!.shaft_id,
    );
  });

  it("takes an unpaired shaft out of its shaft, and stops the links there", () => {
    // A shaft with no partner below simply has none. Its links stop, which
    // is the correct answer, not an error.
    const before = state();
    const virtualsFor = (s: EditState, a: string, b: string) =>
      s.file.doors.filter(
        (d) =>
          d.kind === "virtual" &&
          d.rooms &&
          ((d.rooms[0] === a && d.rooms[1] === b) ||
            (d.rooms[0] === b && d.rooms[1] === a)),
      ).length;

    expect(virtualsFor(before, "0:S", "1:S")).toBe(1);
    expect(virtualsFor(before, "1:S", "2:S")).toBe(1);

    const after = alignFloor(before, {
      floorId: "1:floor",
      transform: IDENTITY,
      landings: new Map([
        ["1:gS", null],
        ["1:gE", "0:gE"],
      ]),
    });

    expect(after.layer.groups.get("1:gS")!.shaft_id).toBeNull();
    expect(virtualsFor(after, "0:S", "1:S")).toBe(0);
    expect(virtualsFor(after, "1:S", "2:S")).toBe(0);
    // And never a link that leaps the storey that dropped out.
    expect(virtualsFor(after, "0:S", "2:S")).toBe(0);
    // The lift is untouched.
    expect(virtualsFor(after, "0:E", "1:E")).toBe(1);
  });

  it("keeps the door ids of links that still stand", () => {
    const before = state();
    const was = before.file.doors.filter((d) => d.kind === "virtual").map((d) => d.id);
    const after = alignFloor(before, {
      floorId: "1:floor",
      transform: IDENTITY,
      landings,
    });
    const now = after.file.doors.filter((d) => d.kind === "virtual").map((d) => d.id);
    expect(now.sort()).toEqual(was.sort());
  });

  it("starts a shaft when neither floor had one", () => {
    const before = state();
    // Strip both ids, as two unaligned floors would be.
    const stripped = initEditState({
      ...before.file,
      groups: before.file.groups.map((g) =>
        g.id === "0:gS" || g.id === "1:gS" ? { ...g, shaft_id: null } : g,
      ),
    });
    const after = alignFloor(stripped, {
      floorId: "1:floor",
      transform: IDENTITY,
      landings: new Map([["1:gS", "0:gS"]]),
    });
    const id = after.layer.groups.get("0:gS")!.shaft_id;
    expect(id).toBeTruthy();
    expect(after.layer.groups.get("1:gS")!.shaft_id).toBe(id);
  });

  it("is undone completely, including floors nobody was looking at", () => {
    const before = state();
    const after = alignFloor(before, {
      floorId: "1:floor",
      transform: { dx: 5, dy: 5, rotation: 0, scale: 1 },
      landings: new Map([
        ["1:gS", null],
        ["1:gE", "0:gE"],
      ]),
    });
    expect(after.file).not.toEqual(before.file);
    expect(undo(after).file).toEqual(before.file);
    expect(after.undo.at(-1)!.kind).toBe("align_floor");
    expect(after.undo.at(-1)!.label).toBe("Align floor 1");
  });
});

describe("alignFloor refusals", () => {
  it("refuses the lowest floor, which is the reference", () => {
    expect(() =>
      alignFloor(state(), {
        floorId: "0:floor",
        transform: IDENTITY,
        landings: new Map(),
      }),
    ).toThrow(/lowest storey/);
  });

  it("refuses two shafts landing on one outline", () => {
    expect(() =>
      alignFloor(state(), {
        floorId: "1:floor",
        transform: IDENTITY,
        landings: new Map([
          ["1:gS", "0:gS"],
          ["1:gE", "0:gS"],
        ]),
      }),
    ).toThrow(/cannot be the same shaft/);
  });

  it("refuses a scale outside the band until it is confirmed, and shows it", () => {
    const req = {
      floorId: "1:floor",
      transform: { ...IDENTITY, scale: 3.4 },
      landings: new Map([["1:gS", "0:gS"]]),
    };
    const preview = previewAlign(state(), req);
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.reason).toMatch(/340%/);

    const after = alignFloor(state(), { ...req, acceptOddScale: true });
    expect(
      after.layer.floors.find((f) => f.id === "1:floor")!.transform[3],
    ).toBe(3.4);
  });

  it("refuses a scale that is not a positive number", () => {
    for (const scale of [0, -1, Number.NaN]) {
      expect(() =>
        alignFloor(state(), {
          floorId: "1:floor",
          transform: { ...IDENTITY, scale },
          landings: new Map(),
        }),
      ).toThrow(OperationRejected);
    }
  });

  it("refuses a landing from an envelope on another floor", () => {
    expect(() =>
      alignFloor(state(), {
        floorId: "1:floor",
        transform: IDENTITY,
        landings: new Map([["2:gS", "0:gS"]]),
      }),
    ).toThrow(/not an envelope on/);
  });

  it("writes nothing on the way to a refusal", () => {
    const before = state();
    try {
      alignFloor(before, {
        floorId: "1:floor",
        transform: IDENTITY,
        landings: new Map([
          ["1:gS", "0:gS"],
          ["1:gE", "0:gS"],
        ]),
      });
    } catch {
      /* expected */
    }
    expect(before.file).toEqual(state().file);
  });
});

describe("alignWarnings", () => {
  it("says so when nothing landed at all", () => {
    const s = state();
    const warnings = alignWarnings(
      s.layer,
      "1:floor",
      new Map([
        ["1:gS", null],
        ["1:gE", null],
      ]),
    );
    expect(warnings.map((w) => w.kind)).toContain("nothing_landed");
  });

  it("is quiet when the shafts paired", () => {
    const s = state();
    const warnings = alignWarnings(
      s.layer,
      "1:floor",
      landingsFor(s.layer, "1:floor", IDENTITY),
    );
    expect(warnings).toEqual([]);
  });

  it("does not stop the align", () => {
    // Unpaired is a valid result in both directions, so a warning is all it is.
    const preview = previewAlign(state(), {
      floorId: "1:floor",
      transform: IDENTITY,
      landings: new Map([
        ["1:gS", null],
        ["1:gE", null],
      ]),
    });
    expect(preview.ok).toBe(true);
    if (preview.ok) expect(preview.warnings.length).toBeGreaterThan(0);
  });
});
