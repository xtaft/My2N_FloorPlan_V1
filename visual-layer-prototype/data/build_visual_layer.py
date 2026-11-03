"""Convert the SVG-extraction output into the visual-layer datasets.

Input   : floor_typical_dataset.json, building.json, devices.json, people.json,
          access_groups.json
Output  : visual_layer/{floors,vertices,walls,rooms,groups,doors,devices,
          space_types,profiles}.json  +  visual_layer.json (everything in one)

Applies the architecture in floor-plan-visual-layer.md:
  - vertex ids namespaced per floor
  - walls hold the room pair; room_a is LEFT walking v1 -> v2; exterior is room_b
    (SVG's y axis grows DOWNWARD, so left-of-travel is the normal (dy, -dx))
  - doors hold wall_id + t + width + hinge + swing; the room pair is NOT stored
  - rooms hold an unordered wall set and a group_id; polygons are not stored
  - groups are envelopes with parent_group_id; they carry no access meaning
  - devices are hosted on a room or a door; guards holds room ids
Derived data (polygons, neighbours, a room's doors, adjacency) is deliberately
absent -- it is computed at runtime.
"""
import json, sys, os
from collections import defaultdict

SRC = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = sys.argv[2] if len(sys.argv) > 2 else "visual_layer"
os.makedirs(OUT, exist_ok=True)

load = lambda n: json.load(open(os.path.join(SRC, n), encoding="utf-8"))
typical  = load("floor_typical_dataset.json")
ground   = load("floor_ground_dataset.json")
building = load("building.json")
devices_in = load("devices.json")
people_in  = load("people.json")
groups_in  = load("access_groups.json")

EXTERIOR = "exterior"

# ---------------------------------------------------------------- space types
# colour belongs to the type, never to a room or envelope
SPACE_TYPES = [
    {"id": "apartment",  "name": "Apartment",       "color": "#6B8FD4"},
    {"id": "room",       "name": "Room",            "color": "#8FA8CC"},
    {"id": "circulation","name": "Circulation",     "color": "#C9CFD6"},
    {"id": "elevator",   "name": "Elevator",        "color": "#A8B4C4"},
    {"id": "stairs",     "name": "Stairs",          "color": "#A8B4C4"},
    {"id": "commercial", "name": "Commercial unit", "color": "#D4A96B"},
    {"id": "gym",        "name": "Gym",             "color": "#7FC4A8"},
    {"id": "locker_room","name": "Locker room",     "color": "#5FA88C"},
    {"id": "technical",  "name": "Technical",       "color": "#B0A8A0"},
]

# space-id prefix -> type, for the shared spaces that appear on every floor
SHARED_TYPE = {"H": "circulation", "L": "circulation", "S": "stairs",
               "E": "elevator", "TECH": "technical"}

# the ground floor's spaces carry a category rather than an apartment
CATEGORY_TYPE = {"lobby": "circulation", "stairs": "stairs", "elevator": "elevator",
                 "technical": "technical", "commercial_main": "commercial",
                 "commercial_storage": "commercial", "gym_main": "gym",
                 "gym_locker_room": "locker_room", "gym_bathroom": "room"}
UNIT_TYPE = {"commercial": "commercial", "gym": "gym"}

# ------------------------------------------------------------------ id helper
def gid(floor, local):
    """Floor-namespaced id. Vertex dedupe MUST be per floor or two floors both
    containing (0,0) fuse geometry across storeys."""
    return f"{floor}:{local}"

# ------------------------------------------------------- per-floor room naming
def rename(local_id, floor):
    """Floor 1 keeps the typical names (A1..A7, B1, L1, T1); floors 2-4 insert
    the floor digit, per building.json's note."""
    if floor == 1 or local_id in SHARED_TYPE:
        return local_id
    if local_id[0] in "TBL" and local_id[1:].isdigit():
        return f"{local_id[0]}{floor}{local_id[1:]}"
    if local_id.startswith("A") and local_id[1:].isdigit():
        return f"A{floor}{local_id[1:]}"
    return local_id

ROOM_LABEL = {"B": "Bedroom", "L": "Living room", "T": "Bathroom",
              "H": "Hallway", "S": "Stairs", "E": "Elevator",
              "TECH": "Technical room"}
GROUND_LABEL = {"L": "Lobby", "S": "Stairs", "E": "Elevator",
                "TECH": "Technical room", "GM": "Gym floor",
                "GL1": "Locker room M", "GL2": "Locker room W",
                "GB1": "Showers M", "GB2": "Showers W",
                "CM1": "Shop floor", "CS1": "Storage",
                "CM2": "Shop floor", "CS2": "Storage"}

def room_name(local_id):
    if local_id in ROOM_LABEL:
        return ROOM_LABEL[local_id]
    return ROOM_LABEL.get(local_id[0], local_id)

# =============================================================== build a floor
vertices, walls, rooms, groups, doors = [], [], [], [], []
room_walls = defaultdict(set)          # room id -> wall ids

def build_floor(ds, floor, sort_index, ground=False):
    """One floor from an extraction dataset. The typical floor is reused for
    1-4 with renamed rooms, exactly as the SVG generation does."""
    local_room = {}                    # local space id -> global room id

    for v in ds["vertices"]:
        vertices.append({"id": gid(floor, v["id"]), "x": v["x"], "y": v["y"]})

    # ---- rooms (envelope assignment filled in below)
    for s in ds["spaces"]:
        rid = gid(floor, rename(s["id"], floor))
        local_room[s["id"]] = rid
        # a room's own type is set only where it differs from its envelope's;
        # otherwise it inherits via access_type()
        if ground:
            t = CATEGORY_TYPE.get(s["category"])
            _ul = ds["units"] if isinstance(ds.get("units"), list) else []
            unit_t = UNIT_TYPE.get(
                next((u["type"] for u in _ul if s["id"] in u["spaces"]), None))
            own_type = t if t != unit_t else None     # set only where it differs
        else:
            own_type = SHARED_TYPE.get(s["id"]) if s["category"] != "room" else None
        rooms.append({
            "id": rid,
            "name": (GROUND_LABEL.get(s["id"], s["id"]) if ground
                     else room_name(s["id"])),
            "walls": [],                       # filled from the wall pass
            "group_id": None,
            "space_type": own_type,
            "floor_id": gid(floor, "floor"),
            "surfaced": False,
        })

    # ---- walls: room_a is LEFT walking v1 -> v2, exterior is always room_b
    for w in ds["walls"]:
        left  = local_room.get(w["left"][0],  EXTERIOR) if w["left"]  else EXTERIOR
        right = local_room.get(w["right"][0], EXTERIOR) if w["right"] else EXTERIOR
        v1, v2 = gid(floor, w["start"]), gid(floor, w["end"])
        if left == EXTERIOR and right != EXTERIOR:
            left, right, v1, v2 = right, left, v2, v1      # flip; pair follows
        wid = gid(floor, w["id"])
        walls.append({"id": wid, "v1": v1, "v2": v2,
                      "room_a": left, "room_b": right, "state": "solid"})
        for r in (left, right):
            if r != EXTERIOR:
                room_walls[r].add(wid)

    # ---- doors: wall + t + width + hinge + swing. No room pair stored.
    wall_len = {w["id"]: w["length_px"] for w in ds["walls"]}
    wall_by_id = {w["id"]: w for w in walls[-len(ds["walls"]):]}
    for d in ds["doors"]:
        L = wall_len[d["wall"]]
        wid = gid(floor, d["wall"])
        w = wall_by_id[wid]
        # offset_px runs from the ORIGINAL start; flip it if the wall was flipped
        flipped = w["v1"] != gid(floor, [x for x in ds["walls"]
                                        if x["id"] == d["wall"]][0]["start"])
        off = d["offset_px"] if not flipped else d["offset_from_end_px"]
        hinge_at = d["hinge_at"]
        if flipped:
            hinge_at = "start" if hinge_at == "end" else "end"
        opens = local_room.get(d["opens_into"], EXTERIOR)
        opening = d.get("virtual") and d.get("hinge_at") is None
        doors.append({
            "id": gid(floor, d["id"]),
            "name": f"{d['connects'][0]}–{d['connects'][1]}",
            "kind": "opening" if opening else "physical",
            "wall_id": wid,
            "t": round((off + d["width_px"] / 2) / L, 5),
            "width": d["width_px"],
            "hinge": None if opening else ("v1" if hinge_at == "start" else "v2"),
            "swing": None if opening else ("a" if opens == w["room_a"] else "b"),
            "rooms": None,                     # derived from the wall
        })

    # ---- envelopes: one group per apartment, one per shared space
    floor_group = {
        "id": gid(floor, "floorgroup"), "name": f"Floor {floor}",
        "space_type": None, "parent_group_id": None,
        "floor_id": gid(floor, "floor"), "sort_index": float(sort_index),
        "domain_ref": None, "shaft_id": None,
    }
    groups.append(floor_group)

    for i, a in enumerate(ds.get("apartments", [])):
        aid = gid(floor, rename(a["id"], floor))
        groups.append({
            "id": aid, "name": rename(a["id"], floor),
            "space_type": "apartment", "parent_group_id": floor_group["id"],
            "floor_id": gid(floor, "floor"), "sort_index": float(i + 10),
            "domain_ref": f"unit:{rename(a['id'], floor)}", "shaft_id": None,
        })
        for s in a["spaces"]:
            next(r for r in rooms if r["id"] == local_room[s])["group_id"] = aid

    # ground-floor units: one envelope per unit; sub_spaces nest one level
    unit_list = ds["units"] if isinstance(ds.get("units"), list) else []
    for i, u in enumerate(unit_list):
        uid = gid(floor, u["id"])
        groups.append({
            "id": uid, "name": u["id"], "space_type": UNIT_TYPE.get(u["type"]),
            "parent_group_id": floor_group["id"],
            "floor_id": gid(floor, "floor"), "sort_index": float(i + 50),
            "domain_ref": f"unit:{u['id']}", "shaft_id": None,
        })
        nested = {child: parent for parent, kids in u.get("sub_spaces", {}).items()
                  for child in kids}
        sub_env = {}
        for parent in u.get("sub_spaces", {}):
            # a locker room with its own reader AND its own shower room is an
            # envelope inside the unit's envelope
            sid = gid(floor, f"g{parent}")
            groups.append({
                "id": sid, "name": GROUND_LABEL.get(parent, parent),
                "space_type": None,               # inherits from the unit
                "parent_group_id": uid,
                "floor_id": gid(floor, "floor"), "sort_index": float(i + 60),
                "domain_ref": None, "shaft_id": None,
            })
            sub_env[parent] = sid
        for sp in u["spaces"]:
            env = sub_env.get(sp) or sub_env.get(nested.get(sp)) or uid
            next(r for r in rooms if r["id"] == local_room[sp])["group_id"] = env

    # shared spaces each become their own single-room envelope
    for j, s in enumerate(ds["spaces"]):
        if s["id"] not in SHARED_TYPE:
            continue
        g_id = gid(floor, f"g{s['id']}")
        groups.append({
            "id": g_id,
            "name": (GROUND_LABEL.get(s["id"], s["id"]) if ground
                     else room_name(s["id"])),
            "space_type": SHARED_TYPE[s["id"]],
            "parent_group_id": floor_group["id"],
            "floor_id": gid(floor, "floor"), "sort_index": float(j + 100),
            "domain_ref": None,
            "shaft_id": {"S": "shaft_stairs", "E": "shaft_lift"}.get(s["id"]),
        })
        next(r for r in rooms if r["id"] == local_room[s["id"]])["group_id"] = g_id

    return local_room

# ----------------------------------------------------------- floors 1-4
floors = []
room_of = {}
for meta in building["floors"]:
    f = meta["floor"]
    floors.append({"id": gid(f, "floor"), "name": meta["name"], "level": f,
                   "sort_index": float(f), "transform": [0, 0, 0, 1]})
    room_of[f] = build_floor(ground if f == 0 else typical, f, f, ground=(f == 0))

for r in rooms:
    r["walls"] = sorted(room_walls[r["id"]])

# --------------------------------------------------- vertical (virtual) doors
for vd in building["vertical_doors"]:
    a, b = vd["connects"]
    ra = room_of[a["floor"]].get(a["space"])
    rb = room_of[b["floor"]].get(b["space"])
    if not (ra and rb):
        continue
    doors.append({
        "id": vd["id"], "name": f"{vd['type']} {a['floor']}\u2192{b['floor']}",
        "kind": "virtual", "wall_id": None, "t": None, "width": None,
        "hinge": None, "swing": None,
        "rooms": [ra, rb],                 # virtual: no wall, so it IS stored
    })

# ------------------------------------------------------------- add_door op
# Apartment 7 on every floor was segmented without an entrance door, which the
# source data flags ("A7: apartment has no entrance door") and the stranded
# check confirms: its rooms are unreachable from the hallway. Repair it with
# the ordinary add-door operation, validated exactly as the editor would.
import math
_V = {v["id"]: v for v in vertices}
_W = {w["id"]: w for w in walls}

def wall_length(wid):
    a, b = _V[_W[wid]["v1"]], _V[_W[wid]["v2"]]
    return math.dist((a["x"], a["y"]), (b["x"], b["y"]))

def add_door(wid, t, width, opens_into, name, hinge="v1", door_id=None):
    w = _W[wid]
    if w["room_a"] == w["room_b"]:
        raise ValueError(f"{wid}: slit wall has no two sides")
    L = wall_length(wid)
    half = width / (2 * L)
    if not (0 <= t - half and t + half <= 1):
        raise ValueError(f"{wid}: door does not fit ({width}px on {L:.1f}px)")
    for d in doors:                                   # no overlap on one wall
        if d["kind"] == "physical" and d["wall_id"] == wid:
            oh = d["width"] / (2 * L)
            if abs(d["t"] - t) < half + oh:
                raise ValueError(f"{wid}: overlaps {d['id']}")
    if opens_into not in (w["room_a"], w["room_b"]):
        raise ValueError(f"{wid}: {opens_into} is not a side of this wall")
    rec = {"id": door_id or f"{wid}:door", "name": name, "kind": "physical",
           "wall_id": wid, "t": round(t, 5), "width": width, "hinge": hinge,
           "swing": "a" if opens_into == w["room_a"] else "b", "rooms": None}
    doors.append(rec)
    return rec

repairs = []
for f in room_of:
    a7 = room_of[f].get("L7")                         # apartment 7's living room
    hall = room_of[f].get("H")
    wid = next((w["id"] for w in walls
                if {w["room_a"], w["room_b"]} == {a7, hall}), None)
    if not (a7 and hall and wid):
        continue
    apt = rename("A7", f)
    d = add_door(wid, 0.5, typical["standard_door_width_px"],
                 opens_into=a7, name=f"H\u2013{rename('L7', f)}",
                 door_id=gid(f, "dA7"))
    # and the entrance reader the other apartments on this floor have
    out_extra = {"id": f"AC-{f}-dA7", "name": f"{apt} Entrance",
                 "device_type": "access_unit", "host_kind": "door",
                 "host_id": d["id"], "position": None,
                 "guards": [a7], "floor_id": gid(f, "floor"), "status": "ok"}
    repairs.append((apt, d["id"], out_extra))

# ----------------------------------------------------------------- devices
room_index = {r["id"]: r for r in rooms}
door_index = {d["id"]: d for d in doors}
wall_index = {w["id"]: w for w in walls}

# devices.json refers to rooms by their RENAMED id (L27), the dataset by its
# local one (L7); accept either
alias = {}
for f, m in room_of.items():
    for local, rid in m.items():
        alias[(f, local)] = rid
        alias[(f, rename(local, f))] = rid

def resolve_room(floor, space):
    return alias.get((floor, space))

out_devices, unplaced = [], []
for dv in devices_in["devices"]:
    f = dv["floor"]
    rec = {"id": dv["id"], "name": dv["name"], "device_type": dv["type"],
           "host_kind": None, "host_id": None, "position": None,
           "guards": [], "floor_id": gid(f, "floor"), "status": "ok"}
    door_hosted = dv["type"] in ("access_unit", "intercom")
    if door_hosted and dv.get("door"):
        did = gid(f, dv["door"])
        if did in door_index:
            rec["host_kind"] = "door"
            rec["host_id"] = did
            target = resolve_room(f, dv.get("access_to"))
            # guards holds ROOM ids, and every one must be a side of this door
            w = wall_index[door_index[did]["wall_id"]]
            if target in (w["room_a"], w["room_b"]):
                rec["guards"] = [target]
    elif dv.get("space"):
        rid = resolve_room(f, dv["space"])
        if rid:
            rec["host_kind"] = "room"
            rec["host_id"] = rid
            rec["position"] = dv.get("xy")
    if rec["host_id"] is None:
        unplaced.append(rec["id"])        # orphaned, not dropped
    out_devices.append(rec)

for apt, did, dev in repairs:
    out_devices.append(dev)

# AC-U1 / AC-U2 arrived unplaced ("placed": false). The gym's locker rooms each
# have a door to the gym floor, which is where a locker-room reader sits.
LOCKER_READER = {"AC-U2": ("0:d1", "GL1"),      # Locker Room M
                 "AC-U1": ("0:d6", "GL2")}      # Locker Room W
for dv in out_devices:
    if dv["id"] in LOCKER_READER and dv["host_id"] is None:
        did, space = LOCKER_READER[dv["id"]]
        rid = resolve_room(0, space)
        if did in door_index and rid:
            dv.update(host_kind="door", host_id=did, guards=[rid],
                      floor_id=gid(0, "floor"))
            if dv["id"] in unplaced:
                unplaced.remove(dv["id"])

# surfacing follows device placement: a room whose door carries a device shows
for dv in out_devices:
    if dv["host_kind"] == "door" and dv["guards"]:
        w = wall_index[door_index[dv["host_id"]]["wall_id"]]
        for r in (w["room_a"], w["room_b"]):
            if r in room_index and room_index[r]["group_id"]:
                g = next(g for g in groups if g["id"] == room_index[r]["group_id"])
                if g["space_type"] != "apartment":
                    room_index[r]["surfaced"] = True

# ------------------------------------------------- access profiles (grouped)
# residents are not in the visual layer; a profile is a permission set, and a
# building has a handful of distinct ones, not one per person
by_set = defaultdict(list)
dev_guard = {d["id"]: d["guards"] for d in out_devices}
apt_reader = {apt: dev["id"] for apt, _, dev in repairs}
for p in people_in["people"]:
    pts = list(p.get("access_points") or [])
    if p.get("apartment") in apt_reader:          # entrance door now exists
        pts.append(apt_reader[p["apartment"]])
    by_set[tuple(sorted(pts))].append(p["id"])
for ag in groups_in["access_groups"]:
    for pid in ag["people"]:
        pass   # access-group devices are merged by the platform, not here

profiles = [{"id": f"P{i+1}",
             "devices": list(k),
             "rooms": sorted({r for d in k for r in dev_guard.get(d, [])}),
             "people": v, "people_count": len(v)}
            for i, (k, v) in enumerate(sorted(by_set.items()))]

# ------------------------------------------------------------------- write
data = {
    "note": ("Visual layer for the floor plan feature. Derived data (room "
             "polygons, neighbours, a room's doors, the adjacency graph) is "
             "deliberately absent and computed at runtime. Ground floor (0) "
             "is not included: its extraction dataset was not supplied."),
    "space_types": SPACE_TYPES,
    "floors": floors,
    "vertices": vertices,
    "walls": walls,
    "rooms": rooms,
    "groups": groups,
    "doors": doors,
    "devices": out_devices,
    "profiles": profiles,
    "unplaced_devices": unplaced,
    "repairs": [{"apartment": a, "door": d, "device": dv["id"],
                 "reason": "segmented without an entrance door"}
                for a, d, dv in repairs],
    "counts": {"floors": len(floors), "vertices": len(vertices),
               "walls": len(walls), "rooms": len(rooms), "groups": len(groups),
               "doors": len(doors), "devices": len(out_devices),
               "profiles": len(profiles)},
}
json.dump(data, open(os.path.join(OUT, "visual_layer.json"), "w"),
          indent=2, ensure_ascii=False)
for k in ("space_types", "floors", "vertices", "walls", "rooms", "groups",
          "doors", "devices", "profiles"):
    json.dump(data[k], open(os.path.join(OUT, f"{k}.json"), "w"),
              indent=2, ensure_ascii=False)

print(json.dumps(data["counts"], indent=2))
print("unplaced devices:", unplaced or "none")
for a, d, dv in repairs:
    print(f"repaired {a}: added door {d} + reader {dv['id']}")
