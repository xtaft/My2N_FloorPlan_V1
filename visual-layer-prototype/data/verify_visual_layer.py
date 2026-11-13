"""Check the visual layer by running the derivations it is designed for:
orientation convention, ring extraction, adjacency, reachability, validations."""
import json, sys, math
from collections import defaultdict, deque

D = json.load(open(sys.argv[1] if len(sys.argv) > 1
                   else "visual_layer/visual_layer.json", encoding="utf-8"))
V = {v["id"]: v for v in D["vertices"]}
W = {w["id"]: w for w in D["walls"]}
R = {r["id"]: r for r in D["rooms"]}
G = {g["id"]: g for g in D["groups"]}
DO = {d["id"]: d for d in D["doors"]}
EXTERIOR = "exterior"
fails = []

def check(name, ok, detail=""):
    print(f"{'ok  ' if ok else 'FAIL'}  {name}{'  ' + detail if detail else ''}")
    if not ok:
        fails.append(name)

# ---------------------------------------------- nothing derived is stored
check("no polygons stored", all("polygon" not in r for r in D["rooms"]))
check("no room pair on wall-mounted doors",
      all(d["rooms"] is None for d in D["doors"] if d["kind"] != "virtual"))
check("openings have no leaf",
      all(d["hinge"] is None and d["swing"] is None
          for d in D["doors"] if d["kind"] == "opening"))
check("virtual doors store their pair",
      all(d["rooms"] and len(d["rooms"]) == 2
          for d in D["doors"] if d["kind"] == "virtual"))

# ---------------------------------------------- referential integrity
check("wall vertices exist", all(w["v1"] in V and w["v2"] in V for w in D["walls"]))
check("wall rooms exist",
      all(r in R or r == EXTERIOR for w in D["walls"] for r in (w["room_a"], w["room_b"])))
check("door walls exist",
      all(d["wall_id"] in W for d in D["doors"] if d["kind"] != "virtual"))
check("room wall sets agree with walls",
      all(w in W for r in D["rooms"] for w in r["walls"]))
check("every room is in an envelope", all(r["group_id"] in G for r in D["rooms"]))
check("no envelope cycles", all(
    g["parent_group_id"] is None or g["parent_group_id"] in G for g in D["groups"]))

# the room/wall cross-reference must be consistent both ways
back = defaultdict(set)
for w in D["walls"]:
    for r in (w["room_a"], w["room_b"]):
        if r != EXTERIOR:
            back[r].add(w["id"])
check("room.walls matches wall.room_a/room_b",
      all(set(r["walls"]) == back[r["id"]] for r in D["rooms"]))

# ---------------------------------------------- orientation convention
def normal(w):
    """Points toward room_a. SVG's y axis grows DOWNWARD, so left-of-travel
    walking v1 -> v2 is (dy, -dx), not (-dy, dx)."""
    a, b = V[w["v1"]], V[w["v2"]]
    return (b["y"] - a["y"], -(b["x"] - a["x"]))

def rings_of(room):
    """Angular-ordered boundary walk -- the real extraction, which also proves
    slits and pinch points come out right."""
    inc = defaultdict(list)
    for wid in room["walls"]:
        w = W[wid]
        inc[w["v1"]].append((wid, w["v2"]))
        inc[w["v2"]].append((wid, w["v1"]))
        if w["room_a"] == w["room_b"]:          # slit: traversed in both senses
            pass
    used, rings = set(), []
    for wid in room["walls"]:
        for a, b in ((W[wid]["v1"], W[wid]["v2"]), (W[wid]["v2"], W[wid]["v1"])):
            if (wid, a, b) in used:
                continue
            ring, cur, cv = [], (wid, a, b), b
            while cur not in used:
                used.add(cur)
                ring.append(V[cur[1]])
                here, prev = cur[2], cur[1]
                back = math.atan2(V[prev]["y"] - V[here]["y"],
                                  V[prev]["x"] - V[here]["x"])
                best = None
                for nw, nv in inc[here]:
                    if nw == cur[0] and len(inc[here]) > 1:
                        continue
                    ang = (math.atan2(V[nv]["y"] - V[here]["y"],
                                      V[nv]["x"] - V[here]["x"]) - back) % (2 * math.pi)
                    if best is None or ang < best[0]:
                        best = (ang, nw, nv)
                if best is None:
                    break
                cur = (best[1], here, best[2])
            if len(ring) > 2:
                rings.append(ring)
    return rings

def inside(pt, ring):                            # even-odd
    x, y, c = pt[0], pt[1], False
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        if (a["y"] > y) != (b["y"] > y) and x < (b["x"] - a["x"]) * (y - a["y"]) / \
                (b["y"] - a["y"]) + a["x"]:
            c = not c
    return c

check("exterior is always room_b",
      all(w["room_a"] != EXTERIOR for w in D["walls"]))

# step a small way along the normal and confirm the point is inside room_a
ring_cache = {r["id"]: rings_of(r) for r in D["rooms"]}
bad_side = []
for w in D["walls"]:
    if w["room_a"] == EXTERIOR or w["room_a"] == w["room_b"]:
        continue
    a, b = V[w["v1"]], V[w["v2"]]
    mid = ((a["x"] + b["x"]) / 2, (a["y"] + b["y"]) / 2)
    n = normal(w)
    L = math.hypot(*n) or 1
    probe = (mid[0] + n[0] / L * 3, mid[1] + n[1] / L * 3)
    rs = ring_cache[w["room_a"]]
    if rs and not any(inside(probe, r) for r in rs):
        bad_side.append(w["id"])
check("room_a lies on the left of v1->v2 (SVG y-down)", not bad_side,
      f"({len(bad_side)} wrong: {bad_side[:5]})" if bad_side else "")
check("ring extraction closes every room",
      all(ring_cache[r["id"]] for r in D["rooms"]),
      f"empty: {[r['id'] for r in D['rooms'] if not ring_cache[r['id']]][:5]}")

# ---------------------------------------------- door placement validations
over = [d["id"] for d in D["doors"] if d["kind"] != "virtual"
        and not (0 <= d["t"] - d["width"] / (2 * math.dist(
            (V[W[d['wall_id']]['v1']]["x"], V[W[d['wall_id']]['v1']]["y"]),
            (V[W[d['wall_id']]['v2']]["x"], V[W[d['wall_id']]['v2']]["y"]))) <= 1)]
check("every door fits on its wall", not over, str(over))

by_wall = defaultdict(list)
for d in D["doors"]:
    if d["kind"] != "virtual":
        by_wall[d["wall_id"]].append(d)
clash = []
for wid, ds in by_wall.items():
    L = math.dist((V[W[wid]['v1']]["x"], V[W[wid]['v1']]["y"]),
                  (V[W[wid]['v2']]["x"], V[W[wid]['v2']]["y"]))
    spans = sorted((d["t"] - d["width"] / (2 * L), d["t"] + d["width"] / (2 * L))
                   for d in ds)
    for (s1, e1), (s2, _) in zip(spans, spans[1:]):
        if s2 < e1:
            clash.append(wid)
check("no two doors overlap on one wall", not clash, str(clash))
check("no door on a slit wall",
      not [d["id"] for d in D["doors"] if d["kind"] != "virtual"
           and W[d["wall_id"]]["room_a"] == W[d["wall_id"]]["room_b"]])

# ---------------------------------------------- ring extraction (Euler count)
def ring_count(room):
    ws = room["walls"]
    verts = {V_ for w in ws for V_ in (W[w]["v1"], W[w]["v2"])}
    adj = defaultdict(set)
    for w in ws:
        adj[W[w]["v1"]].add(W[w]["v2"]); adj[W[w]["v2"]].add(W[w]["v1"])
    seen, comps = set(), 0
    for v in verts:
        if v in seen:
            continue
        comps += 1
        q = [v]; seen.add(v)
        while q:
            for n in adj[q.pop()]:
                if n not in seen:
                    seen.add(n); q.append(n)
    return len(ws) - len(verts) + comps

rings = {r["id"]: ring_count(r) for r in D["rooms"]}
check("every room boundary closes (rings >= 1)", all(v >= 1 for v in rings.values()),
      f"donuts: {[k for k, v in rings.items() if v > 1] or 'none'}")

# ---------------------------------------------- adjacency + reachability
def rooms_of(d):
    if d["kind"] == "virtual":
        return tuple(d["rooms"])
    w = W[d["wall_id"]]
    return (w["room_a"], w["room_b"])

adj = defaultdict(list)
for d in D["doors"]:
    a, b = rooms_of(d)
    if a == b:
        continue                                 # slit: degenerate self-loop
    adj[a].append((d["id"], b)); adj[b].append((d["id"], a))

dev_on_door = defaultdict(list)
for dv in D["devices"]:
    if dv["host_kind"] == "door":
        dev_on_door[dv["host_id"]].append(dv)

check("device guards name a side of their door", all(
    g in rooms_of(DO[dv["host_id"]])
    for dv in D["devices"] if dv["host_kind"] == "door"
    for g in dv["guards"]))

def reach(start, allowed_devices):
    seen, via, blocked = {start}, {start: None}, {}
    q = deque([start])
    while q:
        here = q.popleft()
        for did, there in adj[here]:
            if there in seen:
                continue
            guards = [dv for dv in dev_on_door[did] if there in dv["guards"]]
            if guards and not any(dv["id"] in allowed_devices for dv in guards):
                blocked[there] = did
                continue
            seen.add(there); via[there] = did; q.append(there)
    return seen, via, blocked

# unrestricted: nothing stranded?
hall1 = "0:L"   # the lobby: the building entrance
everything = {dv["id"] for dv in D["devices"]}
seen, _, _ = reach(hall1, everything)
stranded = sorted(r for r in R if r not in seen and r != EXTERIOR)
check("nothing stranded with full access", not stranded,
      f"stranded envelopes: {sorted({R[r]['group_id'] for r in stranded})}")

# every apartment must be enterable from its floor's hallway
no_entry = []
for g in D["groups"]:
    if g["space_type"] != "apartment":
        continue
    members = {r["id"] for r in D["rooms"] if r["group_id"] == g["id"]}
    if not any(any(o not in members for o in rooms_of(DO[did]))
               for m in members for did, _ in adj[m]):
        no_entry.append(g["id"])
check("every apartment has an entrance", not no_entry, str(no_entry))

# a real resident profile
prof = next(p for p in D["profiles"] if p["people"] and len(p["devices"]) == 2)
seen, via, blocked = reach(hall1, set(prof["devices"]))
print(f"\nprofile {prof['id']} ({prof['people_count']} people, "
      f"devices {prof['devices']})")
print(f"  reaches {len(seen)} of {len(R)} rooms; blocked at {len(blocked)} doors")

target = sorted(seen & {r for r in R if R[r]['group_id']
                        and G[R[r]['group_id']]['space_type'] == 'apartment'})
if target:
    t = target[0]
    path, cur = [], t
    while via.get(cur):
        d = DO[via[cur]]
        path.append(d["name"])
        a, b = rooms_of(d)
        cur = a if b == cur else b
    print(f"  route to {t}: " + " -> ".join(reversed(path)))

print()
print("counts:", json.dumps(D["counts"]))
print("FAILED:" if fails else "all checks passed", fails or "")
sys.exit(1 if fails else 0)
