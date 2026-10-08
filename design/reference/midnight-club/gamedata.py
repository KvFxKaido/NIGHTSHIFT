"""Derive the gamedata/ tables from Midnight Club 3's own tuning files.

    python design/reference/midnight-club/gamedata.py <ASSETS.DAT>

ASSETS.DAT is the file of that name on the MC3 DUB Edition Remix disc, copied
from your own copy (7-Zip opens the .iso). Everything is read straight out of
the archive with dave.py; nothing is extracted. The tables hold the values and
the structure the files give, not the designers' comments, which are theirs.
gamedata/README.md is written by hand and is not touched.
"""

import csv
import re
import sys
from pathlib import Path

from dave import Archive

HERE = Path(__file__).resolve().parent
OUT = HERE / "gamedata"
CITIES = ["sd", "atlanta", "detroit", "tokyo"]

# Small key/value tuning files exported whole into the parameters table.
PARAMETER_FILES = [
    "tune/progress/tune.knowledgebase",
    "tune/progress/tune.rewards",
    "tune/progress/flow.progress",
    "tune/progress/dynamicdifficulty.progress",
    "tune/progress/tune.sidequests",
    "tune/progress/tune.fillerraces",
    "tune/progress/tune.racesetup",
    "tune/progress/tune.conditions",
    "tune/progress/vehilcesetup.progress",
    "tune/progress/raceselect.progress",
    "tune/progress/hookmen.mediator",
    "tune/progress/checkpoint.mediator",
    "tune/progress/autocross.mediator",
]

# Designer comments on career-order rows, reduced to flags. A comment that
# matches none of these is reported as "note" so nothing is silently dropped.
ORDER_FLAGS = [
    ("career start", "career-start"),
    ("hookman only", "rival-only"),
    ("locked for hookman", "rival-locked"),
    ("locked for tournament", "tournament"),
    ("sq_filler", "side-quest-filler"),
    ("sidequest_filler", "side-quest-filler"),
    ("filler_only", "filler-only"),
    ("closed track", "closed-track"),
]


def parse(text):
    """The brace format: `key args...` lines, `{`/`}` nest under the last key."""
    root = {"key": "", "args": [], "children": []}
    stack = [root]
    for line in text.splitlines():
        tokens = line.split(";", 1)[0].split()
        if not tokens or tokens[0] == "type:":
            continue
        parts = re.findall(r"[{}]|[^\s{}]+", " ".join(tokens))
        while parts:
            if parts[0] == "{":
                parent = stack[-1]["children"][-1]
                parent["children"] = []
                stack.append(parent)
                parts = parts[1:]
            elif parts[0] == "}":
                stack.pop()
                parts = parts[1:]
            else:
                end = next((i for i, p in enumerate(parts) if p in "{}"), len(parts))
                stack[-1]["children"].append({"key": parts[0], "args": parts[1:end], "children": None})
                parts = parts[end:]
    if len(stack) != 1:
        raise ValueError("unbalanced braces")
    return root["children"]


def blocks(nodes, key):
    return [n for n in nodes if n["key"] == key and n["children"] is not None]


def one(nodes, key):
    found = blocks(nodes, key)
    if len(found) != 1:
        raise ValueError(f"expected one {key} block, found {len(found)}")
    return found[0]["children"]


def values(nodes):
    return {n["key"]: " ".join(n["args"]) for n in nodes if n["children"] is None}


def write(name, header, rows):
    OUT.mkdir(exist_ok=True)
    with open(OUT / f"{name}.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)
    print(f"{name}.csv: {len(rows)} rows")


def rivals(archive):
    names = {}
    for line in archive.text("tune/hud/hookmanimagemap.txt").splitlines():
        parts = line.split()
        if parts[:1] == ["ImageEntry"]:
            portrait = parts[1].removeprefix("navsys_illustration_race_hookman_")
            # The championship series reuses each rival with a second portrait.
            name = portrait.rstrip("2").capitalize()
            if portrait.endswith("2"):
                name += " (championship)"
            for hookman in parts[3:]:
                names[hookman.lower()] = name
    rows = []
    for city in CITIES:
        for node in blocks(parse(archive.text(f"tune/race/{city}.loc")), "Hookman"):
            fields = values(node["children"])
            forced = [" ".join(n["args"]).replace("\\", "/") for n in node["children"] if n["key"] == "forcedRace"]
            hookman = fields["name"]
            # One Atlanta block spells it numRace; whether the game reads that is unknown.
            races = fields.get("numRaces") or f"{fields['numRace']} (written numRace)"
            rows.append([hookman, names.get(hookman.lower(), ""), city, fields["VehicleType"],
                         races, "; ".join(forced)])
    write("mc3-gd-rivals", ["Rival id", "Rival", "City", "Vehicle", "Races", "Forced races (index race)"], rows)
    return {row[0].lower(): row[1] for row in rows}, names


def unlock_rules(archive, rival_names):
    lines = list(csv.reader(archive.text("tune/progress/unlockingrules.csv").splitlines()))
    start = next(i for i, row in enumerate(lines) if row and row[0] == "reward item type") + 2
    rows = []
    for number, row in enumerate(lines[start:], start + 1):
        cells = [c.strip() for c in row]
        while cells and not cells[-1]:
            cells.pop()
        if not cells:
            continue
        conditions = [(cells[i], cells[i + 1] if i + 1 < len(cells) else "")
                      for i in range(2, len(cells), 2)]
        named = []
        for kind, item in conditions:
            if kind == "H":
                hookman, *race = item.split()
                who = rival_names.get(hookman.lower(), "?")
                what = "unlocked" if race == ["0"] else f"race {race[0]} beaten" if race else "beaten"
                named.append(f"{who} ({hookman}) {what}")
            else:
                named.append(f"{kind} {item}")
        rows.append([number, cells[0], cells[1],
                     "; ".join(f"{k} {v}" for k, v in conditions), "; ".join(named)])
    write("mc3-gd-unlock-rules", ["Source row", "Reward type", "Reward id", "Conditions", "Conditions, rivals named"], rows)


def career_order(archive):
    rows = []
    for city in CITIES:
        text = archive.text(f"tune/race/{city}.loc")
        body = text[text.index("CareerOrder"):]
        body = body[body.index("{") + 1:body.index("}")]
        for line in body.splitlines():
            code, _, comment = line.partition(";")
            parts = code.split()
            if len(parts) != 2:
                if parts:
                    raise ValueError(f"{city}: career order line {line!r}")
                continue
            path = parts[1].replace("\\", "/")
            kind, difficulty = (path.split("/") + ["", ""])[:2]
            comment = comment.lower()
            flags = [flag for phrase, flag in ORDER_FLAGS if phrase in comment]
            if comment.strip() and not flags:
                flags = ["note"]
            rows.append([city, int(parts[0]), path, kind, difficulty, " ".join(flags)])
    write("mc3-gd-career-order", ["City", "Career order", "Race", "Type", "Difficulty", "Flags"], rows)


def rewards(archive):
    tree = parse(archive.text("tune/progress/definitions.rewards"))
    money = []
    for node in one(tree, "MoneyRewards"):
        if node["key"] == "Set":
            for row in node["children"]:
                money.append([node["args"][0], row["key"], *row["args"]])
    write("mc3-gd-money", ["Money set", "Career order", "Prize lower", "Prize upper"], money)

    rounding = [[n["key"], *n["args"]] for n in one(tree, "Rounding")]
    write("mc3-gd-money-rounding", ["Prize from", "Rounded to a multiple of"], rounding)

    items = []
    for node in one(tree, "IndividualRewards"):
        fields = values(node["children"])
        sub = blocks(node["children"], "SubType")
        detail = values(sub[0]["children"]) if sub else {}
        subtype = next((n["args"][0] for n in node["children"] if n["key"] == "SubType" and n["args"]), "")
        items.append([" ".join(node["args"]), fields.get("UnlockingId", ""), subtype,
                      detail.get("CashValue", ""), detail.get("ConfigFile", "")])
    write("mc3-gd-prizes", ["Item", "Unlocking id", "Subtype", "Cash value", "Config file"], items)


def rubber_banding(archive):
    rows = []
    for flow in parse(archive.text("tune/progress/definitions.rubberbanding")):
        for node in flow["children"] or []:
            order = values(node["children"])["CareerOrder"]
            for field in one(node["children"], "RubberBand"):
                if field["children"] is None:
                    value = " ".join(field["args"])
                else:
                    value = " ".join(n["key"] for n in field["children"])
                rows.append([flow["key"], order, field["key"], value])
    write("mc3-gd-rubber-banding", ["Flow", "Career order", "Field", "Value"], rows)


def races_available(archive):
    rows = []
    for city in CITIES:
        for node in one(parse(archive.text(f"tune/progress/{city}.progress")), "RacesAvailable"):
            rows.append([city, node["key"], *node["args"]])
    write("mc3-gd-races-available", ["City", "Career order", "Races available"], rows)


def parameters(archive):
    rows = []
    for path in PARAMETER_FILES:
        for block in parse(archive.text(path)):
            for key, value in values(block["children"]).items():
                rows.append([path.removeprefix("tune/progress/"), block["key"], key, value])
    write("mc3-gd-parameters", ["File", "Block", "Key", "Value"], rows)


def main(path):
    archive = Archive(path)
    rival_ids, _ = rivals(archive)
    unlock_rules(archive, rival_ids)
    career_order(archive)
    rewards(archive)
    rubber_banding(archive)
    races_available(archive)
    parameters(archive)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
