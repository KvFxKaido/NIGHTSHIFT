"""Derive the mcla-gd tables in gamedata/ from Midnight Club: Los Angeles's own files.

    python design/reference/midnight-club/mcla_gamedata.py <disc.iso|xarchive_cache.rpf> <keyfile>

The disc is the Complete Edition (360) image of your own copy; the key file
holds the RPF3 key (rpf3.py says where it comes from; it is checked against a
SHA-1 and never stored here). Everything is read from tune/career in the
archive; nothing is extracted. Writes only mcla-gd-*.csv; the MC3 tables are
mc3_gamedata.py's.
"""

import sys
import xml.etree.ElementTree as ET

from mc3_gamedata import parse, values, write
from rpf3 import Archive, read_key

# The base game's career, then South Central's (the Complete Edition's DLC).
EXPERIENCE = [("base", "tune/career/experiencesystem_0.lst"), ("south central", "tune/career/experiencesystem_1.lst")]
EVENT_REWARDS = [("base", "tune/career/rewards_0.lst"), ("south central", "tune/career/rewards_1.lst")]
RUBBER_BANDING = [f"tune/career/rubberbandtune{n:02d}.xml" for n in range(11)]
SKIPPED_FIELDS = {"szDescriptionId", "szEventId"}


def experience(archive):
    rows = []
    for career, path in EXPERIENCE:
        for system in parse(archive.read(archive.find(path)).decode("cp1252")):
            header = values(system["children"])
            top = float(header["MaxAmount"])
            for threshold in system["children"]:
                if threshold["key"] != "Threshold":
                    continue
                fields = values(threshold["children"])
                percent = fields["Percent"]
                rewards = [values(r["children"]) for r in threshold["children"] if r["key"] == "Reward"]
                for reward in rewards or [{}]:
                    kind = reward.pop("Type", "")
                    detail = ", ".join(f"{k} {v}" for k, v in reward.items() if k not in ("Hidden", "GiveImmediately"))
                    rows.append([career, header["Type"], header["MaxAmount"], header["IncrementValue"], fields["Id"],
                                 percent, round(float(percent) * top), kind, detail])
    write("mcla-gd-experience",
          ["Career", "System", "Max amount", "Increment", "Threshold", "Percent", "Amount (percent x max)",
           "Reward type", "Reward"], rows)


def event_rewards(archive):
    rows = []
    for career, path in EVENT_REWARDS:
        for event in parse(archive.read(archive.find(path)).decode("cp1252")):
            name = values(event["children"])["Name"]
            for difficulty in event["children"]:
                if difficulty["key"] != "Difficulty":
                    continue
                level = values(difficulty["children"])["Name"]
                for reward in difficulty["children"]:
                    if reward["key"] == "Reward":
                        fields = values(reward["children"])
                        kind = fields.pop("Type")
                        detail = ", ".join(f"{k} {v}" for k, v in fields.items()
                                           if k not in ("Hidden", "GiveImmediately", "TextureName"))
                        rows.append([career, name, level, kind, detail])
    write("mcla-gd-event-rewards", ["Career", "Event", "Difficulty", "Reward type", "Reward"], rows)


def leaves(item):
    """`Type(field=value, ...)` for an <Item>, Hungarian prefixes off, ids kept."""
    kind = item.get("type", "").removeprefix("mcCondition").removeprefix("mcReward")
    fields = []
    for child in item:
        if len(child) or child.tag in SKIPPED_FIELDS:
            continue
        value = child.get("value", child.text or "")
        fields.append(f"{child.tag.lstrip('szbnf') or child.tag}={value}")
    return f"{kind}({', '.join(fields)})"


def children(node, tag=None):
    found = node if tag is None or node is None else node.find(tag)
    return list(found) if found is not None else []


def conditions(node):
    return [leaves(c) for req in children(node) for c in children(req, "aConditions")]


def missions(archive):
    rows = []
    folder = archive.find("tune/career/missions")
    south_central = {i for _, i in archive.files(archive.find("tune/career/missions/sc"))}
    for path, index in sorted(archive.files(folder)):
        root = ET.fromstring(archive.read(index))
        text = lambda tag: (root.findtext(tag) or "").strip()
        rewards = children(root, "aRewards")
        unlocks = [r.findtext("szMissionId") for r in rewards if r.get("type") == "mcRewardMission"]
        cars = [r.findtext("szCarName") for r in rewards if r.get("type") == "mcRewardCar"]
        other = [leaves(r) for r in rewards if r.get("type") not in ("mcRewardMission", "mcRewardCar")]
        rows.append([text("szId"), "south central" if index in south_central else "base", text("szDistrictName"),
                     text("szHookmanNameId"),
                     "; ".join(conditions(root.find("aPrerequisites"))),
                     "; ".join(conditions(root.find("aObjectives"))),
                     "; ".join(unlocks), "; ".join(cars), "; ".join(other),
                     root.find("bRepeatable").get("value") if root.find("bRepeatable") is not None else ""])
    write("mcla-gd-missions",
          ["Mission", "Career", "District", "Rival id", "Prerequisites", "Objectives", "Starts missions",
           "Reward cars", "Other rewards", "Repeatable"], rows)


def rubber_banding(archive):
    rows = []
    for path in RUBBER_BANDING:
        root = ET.fromstring(archive.read(archive.find(path)))
        for field in root:
            value = field.get("value") if field.get("value") is not None else " ".join((field.text or "").split())
            rows.append([path.rsplit("/", 1)[1], field.tag, value])
    write("mcla-gd-rubber-banding", ["File", "Field", "Value"], rows)


def main(path, keyfile):
    archive = Archive(path, read_key(keyfile))
    experience(archive)
    event_rewards(archive)
    missions(archive)
    rubber_banding(archive)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
