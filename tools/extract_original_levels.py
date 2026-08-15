#!/usr/bin/env python3
"""Extract the original Director score frames into readable JSON.

This is intentionally an intermediate-format extractor.  It preserves the
Director sprite/channel identities and behavior initializer values without
trying to translate them into the HTML5 runtime's level schema.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any


MAIN_CHANNEL_BYTES = 288

SPRITE_TYPES = {
    0: "inactive",
    1: "bitmap",
    2: "rectangle",
    3: "roundedRectangle",
    4: "oval",
    5: "lineTopBottom",
    6: "lineBottomTop",
    7: "text",
    8: "button",
    9: "checkbox",
    10: "radioButton",
    11: "picture",
    12: "outlinedRectangle",
    13: "outlinedRoundedRectangle",
    14: "outlinedOval",
    15: "thickLine",
    16: "castMember",
    17: "filmLoop",
    18: "directorMovie",
}

CAST_TYPES = {
    0: "empty",
    1: "bitmap",
    2: "filmLoop",
    3: "text",
    4: "palette",
    5: "picture",
    6: "sound",
    7: "button",
    8: "shape",
    9: "movie",
    10: "digitalVideo",
    11: "script",
    12: "richText",
    13: "ole",
    14: "transition",
    15: "xtra",
}

INK_TYPES = {
    0: "copy",
    1: "transparent",
    2: "reverse",
    3: "ghost",
    4: "notCopy",
    5: "notTransparent",
    6: "notReverse",
    7: "notGhost",
    8: "matte",
    9: "mask",
    32: "blend",
    33: "addPin",
    34: "add",
    35: "subtractPin",
    36: "backgroundTransparent",
    37: "light",
    38: "subtract",
    39: "dark",
}


class ExtractionError(RuntimeError):
    """Raised when a source chunk is inconsistent or unsupported."""


def uint16(data: bytes | bytearray, offset: int) -> int:
    return struct.unpack_from(">H", data, offset)[0]


def sint16(data: bytes | bytearray, offset: int) -> int:
    return struct.unpack_from(">h", data, offset)[0]


def uint32(data: bytes | bytearray, offset: int) -> int:
    return struct.unpack_from(">I", data, offset)[0]


def sint32(data: bytes | bytearray, offset: int) -> int:
    return struct.unpack_from(">i", data, offset)[0]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_csv_members(path: Path) -> dict[int, dict[str, Any]]:
    if not path.exists():
        return {}
    result: dict[int, dict[str, Any]] = {}
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            if not row.get("Number"):
                continue
            number = int(row["Number"])
            point = row.get("Registration Point", "")
            match = re.fullmatch(r"\((-?\d+),\s*(-?\d+)\)", point)
            result[number] = {
                "name": row.get("Name") or None,
                "type": row.get("Type") or None,
                "registrationPoint": (
                    {"x": int(match.group(1)), "y": int(match.group(2))}
                    if match
                    else None
                ),
                "filename": row.get("Filename") or None,
            }
    return result


def source_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decode_c_string(data: bytes) -> str:
    return data.split(b"\0", 1)[0].decode("mac_roman", errors="replace")


def parse_lingo_value(value: str) -> Any:
    value = value.strip()
    if re.fullmatch(r"[-+]?\d+", value):
        return int(value)
    if re.fullmatch(r"[-+]?(?:\d+\.\d*|\d*\.\d+)", value):
        return float(value)
    if value.startswith("#"):
        return {"symbol": value[1:]}
    if len(value) >= 2 and value[0] == value[-1] == '"':
        return value[1:-1].replace('\\"', '"')
    return value


def parse_lingo_property_list(text: str) -> dict[str, Any] | None:
    """Parse the simple numeric property lists used by this movie.

    Unknown or structurally richer Lingo values remain available in the raw
    initializer string, so returning None is lossless for the JSON export.
    """

    text = text.strip()
    if not (text.startswith("[") and text.endswith("]")):
        return None
    body = text[1:-1].strip()
    if not body:
        return {}

    result: dict[str, Any] = {}
    for item in body.split(","):
        match = re.fullmatch(r"\s*#([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*?)\s*", item)
        if not match:
            return None
        result[match.group(1)] = parse_lingo_value(match.group(2))
    return result


@dataclass(frozen=True)
class CastLibrarySource:
    number: int
    name: str
    association_file: str
    member_file: str


CAST_LIBRARY_SOURCES = (
    CastLibrarySource(1, "Internal", "CAS_-1404.json", "Internal_Members.csv"),
    CastLibrarySource(2, "scripts", "CAS_-1303.json", "scripts_Members.csv"),
    CastLibrarySource(3, "Text", "CAS_-1267.json", "Text_Members.csv"),
)


class CastCatalog:
    def __init__(self, extracted_root: Path, assets_root: Path) -> None:
        self._chunks = extracted_root / "chunks"
        self._assets_root = assets_root
        self._libraries: dict[int, dict[str, Any]] = {}
        self._cast_chunks: dict[int, dict[str, Any]] = {}
        self._asset_metadata: dict[int, dict[str, Any]] = {}

        for path in self._chunks.glob("CASt-*.json"):
            match = re.fullmatch(r"CASt-(\d+)\.json", path.name)
            if match:
                self._cast_chunks[int(match.group(1))] = read_json(path)

        asset_mapping_path = assets_root / "asset_mapping.json"
        if asset_mapping_path.exists():
            for item in read_json(asset_mapping_path):
                match = re.match(r"Internal_(\d+)_", item.get("filename", ""))
                if match:
                    self._asset_metadata[int(match.group(1))] = item

        for source in CAST_LIBRARY_SOURCES:
            association_path = self._chunks / source.association_file
            if not association_path.exists():
                raise ExtractionError(f"Missing cast association: {association_path}")
            members = read_json(association_path)["memberIDs"]
            supplemental = read_csv_members(assets_root / source.member_file)
            self._libraries[source.number] = {
                "name": source.name,
                "members": members,
                "supplemental": supplemental,
                "associationFile": association_path.name,
            }

    def library_summary(self) -> list[dict[str, Any]]:
        return [
            {
                "number": number,
                "name": library["name"],
                "associationFile": library["associationFile"],
                "logicalMemberCount": len(library["members"]),
            }
            for number, library in sorted(self._libraries.items())
        ]

    def resolve(self, library_number: int, member_number: int) -> dict[str, Any]:
        base = {
            "libraryNumber": library_number,
            "memberNumber": member_number,
        }
        library = self._libraries.get(library_number)
        if not library:
            return {**base, "library": None, "name": None, "resolved": False}
        base["library"] = library["name"]
        if member_number <= 0 or member_number > len(library["members"]):
            return {**base, "name": None, "resolved": False}

        source_member_id = library["members"][member_number - 1]
        cast_chunk = self._cast_chunks.get(source_member_id, {}) if source_member_id else {}
        info = cast_chunk.get("info", {})
        supplemental = library["supplemental"].get(member_number, {})
        result = {
            **base,
            "sourceMemberId": source_member_id or None,
            "name": info.get("name") or supplemental.get("name"),
            "type": CAST_TYPES.get(cast_chunk.get("type"), supplemental.get("type")),
            "registrationPoint": supplemental.get("registrationPoint"),
            "resolved": bool(source_member_id),
        }

        if library_number == 1:
            asset = self._asset_metadata.get(member_number)
            if asset:
                result["asset"] = {
                    "filename": asset.get("filename"),
                    "category": asset.get("category"),
                    "usage": asset.get("usage"),
                    "notes": asset.get("notes"),
                }
                if result["registrationPoint"] is None:
                    point = asset.get("registration_point")
                    if isinstance(point, list) and len(point) == 2:
                        result["registrationPoint"] = {"x": point[0], "y": point[1]}
        return result


class DirectorScore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.data = path.read_bytes()
        if len(self.data) < 24:
            raise ExtractionError("VWSC chunk is too small")

        self.declared_chunk_size = uint32(self.data, 0)
        self.chunk_version = sint32(self.data, 4)
        self.list_start = uint32(self.data, 8)
        self.detail_count = uint32(self.data, self.list_start)
        self.detail_list_size = uint32(self.data, self.list_start + 4)
        self.max_detail_data_length = uint32(self.data, self.list_start + 8)
        self.index_start = self.list_start + 12
        self.detail_data_start = self.index_start + self.detail_list_size * 4
        self.detail_offsets = [
            uint32(self.data, self.index_start + index * 4)
            for index in range(self.detail_count)
        ]
        if self.declared_chunk_size != len(self.data):
            raise ExtractionError(
                f"VWSC length mismatch: header={self.declared_chunk_size}, file={len(self.data)}"
            )

        self.header_offset = self.detail_data_start + self.detail_offsets[0]
        self.score_data_size = uint32(self.data, self.header_offset)
        self.first_frame_offset = uint32(self.data, self.header_offset + 4)
        self.declared_frame_count = uint32(self.data, self.header_offset + 8)
        self.frames_version = uint16(self.data, self.header_offset + 12)
        self.sprite_record_size = uint16(self.data, self.header_offset + 14)
        self.channel_data_bytes = uint16(self.data, self.header_offset + 16)
        self.displayed_channel_count = uint16(self.data, self.header_offset + 18)
        self.first_frame_position = self.header_offset + 20

        if self.sprite_record_size != 48:
            raise ExtractionError(
                f"Unsupported sprite record size {self.sprite_record_size}; expected Director 7/8 size 48"
            )
        self.frames = self._decode_frames()

    def detail(self, index: int) -> bytes:
        if index < 0 or index + 1 >= len(self.detail_offsets):
            return b""
        start = self.detail_data_start + self.detail_offsets[index]
        end = self.detail_data_start + self.detail_offsets[index + 1]
        return self.data[start:end]

    def _decode_frames(self) -> list[bytes]:
        state_size = MAIN_CHANNEL_BYTES + self.displayed_channel_count * self.sprite_record_size
        state = bytearray(state_size)
        position = self.first_frame_position
        score_end = self.detail_data_start + self.score_data_size
        frames: list[bytes] = []

        while position < score_end:
            if position + 2 > len(self.data):
                raise ExtractionError("Truncated frame-size field")
            frame_size = uint16(self.data, position)
            position += 2
            if frame_size == 0:
                break
            remaining = frame_size - 2
            while remaining:
                if remaining < 4:
                    raise ExtractionError(f"Invalid delta header size in frame {len(frames) + 1}")
                data_size = uint16(self.data, position)
                channel_offset = uint16(self.data, position + 2)
                position += 4
                remaining -= 4
                if data_size > remaining:
                    raise ExtractionError(f"Delta overruns frame {len(frames) + 1}")
                if channel_offset + data_size > len(state):
                    raise ExtractionError(f"Delta overruns channel state in frame {len(frames) + 1}")
                state[channel_offset : channel_offset + data_size] = self.data[
                    position : position + data_size
                ]
                position += data_size
                remaining -= data_size
            frames.append(bytes(state))

        if position != score_end:
            raise ExtractionError(
                f"Score decoding ended at 0x{position:x}; expected 0x{score_end:x}"
            )
        return frames

    def behavior_list(self, sprite_list_index: int, catalog: CastCatalog) -> list[dict[str, Any]]:
        if not sprite_list_index:
            return []
        raw = self.detail(sprite_list_index + 1)
        if len(raw) % 8:
            raise ExtractionError(
                f"Behavior list {sprite_list_index + 1} has non-record length {len(raw)}"
            )
        behaviors: list[dict[str, Any]] = []
        for offset in range(0, len(raw), 8):
            library_number, member_number, initializer_index = struct.unpack_from(">HHI", raw, offset)
            initializer = decode_c_string(self.detail(initializer_index)) if initializer_index else ""
            behavior = {
                "script": catalog.resolve(library_number, member_number),
                "initializerDetailIndex": initializer_index or None,
                "initializer": initializer or None,
                "properties": parse_lingo_property_list(initializer) if initializer else {},
            }
            behaviors.append(behavior)
        return behaviors

    def sprite_info(self, sprite_list_index: int) -> dict[str, Any] | None:
        if not sprite_list_index:
            return None
        raw = self.detail(sprite_list_index)
        name = decode_c_string(self.detail(sprite_list_index + 2))
        return {
            "detailIndex": sprite_list_index,
            "name": name or None,
            "rawHex": raw.hex(" "),
        }


def parse_labels(path: Path) -> list[dict[str, Any]]:
    data = path.read_bytes()
    if len(data) < 10:
        raise ExtractionError("VWLB chunk is too small")
    count_with_sentinel = uint16(data, 0) + 1
    string_base = count_with_sentinel * 4 + 2
    frame = uint16(data, 2)
    string_position = uint16(data, 4) + string_base
    labels: list[dict[str, Any]] = []
    for index in range(1, count_with_sentinel):
        pair_offset = 2 + index * 4
        next_frame = uint16(data, pair_offset)
        next_string_position = uint16(data, pair_offset + 2) + string_base
        text = data[string_position:next_string_position].decode("mac_roman", errors="replace")
        label, _, comment = text.partition("\r")
        labels.append(
            {
                "frame": frame,
                "name": label,
                "comment": comment.replace("\r", "\n") or None,
            }
        )
        frame = next_frame
        string_position = next_string_position
    return labels


def role_for_sprite(cast: dict[str, Any], behaviors: list[dict[str, Any]]) -> str:
    behavior_names = {
        behavior["script"].get("name")
        for behavior in behaviors
        if behavior["script"].get("name")
    }
    cast_name = (cast.get("name") or "").lower()
    if "GPS" in behavior_names:
        return "playerController"
    if "Orbiting" in behavior_names and "Planet" in behavior_names:
        return "orbitingPlanet"
    if "Orbiting" in behavior_names:
        return "orbitingObject"
    if "Planet" in behavior_names:
        return "planet"
    if "Bonus" in behavior_names:
        return "bonus"
    if cast_name in {"ship", "ship_open"}:
        return "target"
    if cast_name in {"hoop", "rubber_band"}:
        return "slingshotComponent"
    if cast.get("asset", {}).get("category") == "ui":
        return "ui"
    if cast.get("asset", {}).get("category") == "background":
        return "background"
    return "support"


def extract_sprite(
    score: DirectorScore,
    catalog: CastCatalog,
    frame_data: bytes,
    channel_index: int,
) -> dict[str, Any] | None:
    offset = MAIN_CHANNEL_BYTES + channel_index * score.sprite_record_size
    record = frame_data[offset : offset + score.sprite_record_size]
    sprite_type = record[0]
    ink_data = record[1]
    library_number = sint16(record, 4)
    member_number = uint16(record, 6)
    if member_number == 0:
        return None

    sprite_list_index = uint32(record, 8)
    y = sint16(record, 12)
    x = sint16(record, 14)
    height = sint16(record, 16)
    width = sint16(record, 18)
    cast = catalog.resolve(library_number, member_number)
    behaviors = score.behavior_list(sprite_list_index, catalog)
    role = role_for_sprite(cast, behaviors)
    return {
        "channel": channel_index + 1,
        "role": role,
        "target": role == "target",
        "gameplayObject": role
        in {"playerController", "orbitingPlanet", "orbitingObject", "planet", "bonus", "target"},
        "visible": sprite_type != 0 and width > 0 and height > 0,
        "cast": cast,
        "position": {"x": x, "y": y},
        "size": {"width": width, "height": height},
        "bounds": {"left": x, "top": y, "right": x + width, "bottom": y + height},
        "spriteType": {"code": sprite_type, "name": SPRITE_TYPES.get(sprite_type, "unknown")},
        "ink": {
            "code": ink_data & 0x3F,
            "name": INK_TYPES.get(ink_data & 0x3F, "unknown"),
            "trails": bool(ink_data & 0x40),
            "stretch": bool(ink_data & 0x80),
        },
        "appearance": {
            "foregroundColorIndex": record[2],
            "backgroundColorIndex": record[3],
            "colorCode": record[20],
            "blendAmount": record[21],
            "thickness": record[22],
            "flags": record[23],
            "foregroundGreen": record[24],
            "backgroundGreen": record[25],
            "foregroundBlue": record[26],
            "backgroundBlue": record[27],
            "rotationRaw": uint32(record, 28),
            "skewRaw": uint32(record, 32),
        },
        "spriteInfo": score.sprite_info(sprite_list_index),
        "behaviors": behaviors,
    }


def extract_main_channels(
    score: DirectorScore, catalog: CastCatalog, frame_data: bytes
) -> dict[str, Any]:
    script_list_index = uint32(frame_data, 4)
    return {
        "script": {
            "cast": catalog.resolve(uint16(frame_data, 0), uint16(frame_data, 2)),
            "spriteInfo": score.sprite_info(script_list_index),
            "behaviors": score.behavior_list(script_list_index, catalog),
        },
        "tempo": {
            "cuePoint": uint16(frame_data, 52),
            "value": frame_data[54],
        },
        "transition": {
            "cast": catalog.resolve(uint16(frame_data, 96), uint16(frame_data, 98)),
        },
        "sound2": {
            "cast": catalog.resolve(uint16(frame_data, 144), uint16(frame_data, 146)),
        },
        "sound1": {
            "cast": catalog.resolve(uint16(frame_data, 192), uint16(frame_data, 194)),
        },
    }


def behavior_properties(sprite: dict[str, Any], behavior_name: str) -> dict[str, Any] | None:
    for behavior in sprite["behaviors"]:
        if behavior["script"].get("name") == behavior_name:
            return behavior["properties"]
    return None


def make_level(
    score: DirectorScore,
    catalog: CastCatalog,
    level_number: int,
    frame_number: int,
) -> dict[str, Any]:
    frame_data = score.frames[frame_number - 1]
    sprites = [
        sprite
        for channel_index in range(score.displayed_channel_count)
        if (
            sprite := extract_sprite(score, catalog, frame_data, channel_index)
        )
        is not None
    ]
    controller = next((sprite for sprite in sprites if sprite["role"] == "playerController"), None)
    controller_properties = behavior_properties(controller, "GPS") if controller else None
    target_channel = controller_properties.get("pTarget") if controller_properties else None
    if isinstance(target_channel, int):
        target = next((sprite for sprite in sprites if sprite["channel"] == target_channel), None)
        if target:
            target["target"] = True
            if target["role"] in {"orbitingObject", "orbitingPlanet"}:
                target["role"] = "orbitingTarget"

    role_counts: dict[str, int] = {}
    for sprite in sprites:
        role_counts[sprite["role"]] = role_counts.get(sprite["role"], 0) + 1

    return {
        "levelNumber": level_number,
        "directorFrame": frame_number,
        "isLastLevel": bool(controller_properties and controller_properties.get("plastLevel")),
        "summary": {
            "spriteCount": len(sprites),
            "visibleSpriteCount": sum(sprite["visible"] for sprite in sprites),
            "gameplayObjectCount": sum(sprite["gameplayObject"] for sprite in sprites),
            "roles": dict(sorted(role_counts.items())),
        },
        "controllerProperties": controller_properties,
        "mainChannels": extract_main_channels(score, catalog, frame_data),
        "sprites": sprites,
    }


def find_level_frames(
    score: DirectorScore, catalog: CastCatalog, labels: list[dict[str, Any]]
) -> list[int]:
    level_label = next((label for label in labels if label["name"] == "Levels"), None)
    if not level_label:
        raise ExtractionError("Could not find the Director 'Levels' frame label")

    result: list[int] = []
    for frame_number in range(level_label["frame"], len(score.frames) + 1):
        frame_data = score.frames[frame_number - 1]
        is_level = False
        is_last = False
        for channel_index in range(score.displayed_channel_count):
            sprite = extract_sprite(score, catalog, frame_data, channel_index)
            if not sprite:
                continue
            properties = behavior_properties(sprite, "GPS")
            if properties is not None:
                is_level = True
                is_last = bool(properties.get("plastLevel"))
                break
        if is_level:
            result.append(frame_number)
        if is_last:
            break
    if not result:
        raise ExtractionError("No level frames with a GPS behavior were found")
    return result


def validate_extraction(levels: list[dict[str, Any]], level_frames: list[int]) -> None:
    if len(levels) != 25:
        raise ExtractionError(f"Expected 25 original levels, extracted {len(levels)}")
    if level_frames != list(range(11, 36)):
        raise ExtractionError(f"Expected contiguous frames 11-35, got {level_frames}")
    if sum(level["isLastLevel"] for level in levels) != 1 or not levels[-1]["isLastLevel"]:
        raise ExtractionError("The final-level flag was not found exclusively on level 25")

    for level in levels:
        roles = {sprite["role"] for sprite in level["sprites"]}
        missing = {"playerController"} - roles
        if missing:
            raise ExtractionError(
                f"Level {level['levelNumber']} is missing required roles: {sorted(missing)}"
            )
        if not any(sprite["target"] for sprite in level["sprites"]):
            raise ExtractionError(f"Level {level['levelNumber']} has no GPS target sprite")

    property_examples = [
        behavior["properties"]
        for level in levels
        for sprite in level["sprites"]
        for behavior in sprite["behaviors"]
    ]
    if not any(properties.get("pMass") == 159 for properties in property_examples):
        raise ExtractionError("Representative planet mass 159 was not recovered")
    if not any(properties.get("pValue") == 250 for properties in property_examples):
        raise ExtractionError("Representative bonus value 250 was not recovered")


def write_outputs(output_root: Path, document: dict[str, Any]) -> None:
    levels_root = output_root / "levels"
    levels_root.mkdir(parents=True, exist_ok=True)

    combined_path = output_root / "original_levels.json"
    combined_path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")

    index = {
        "format": document["format"],
        "source": document["source"],
        "movie": document["movie"],
        "levelCount": len(document["levels"]),
        "levels": [
            {
                "levelNumber": level["levelNumber"],
                "directorFrame": level["directorFrame"],
                "isLastLevel": level["isLastLevel"],
                "summary": level["summary"],
                "file": f"levels/level{level['levelNumber']:02d}.json",
            }
            for level in document["levels"]
        ],
    }
    (output_root / "index.json").write_text(
        json.dumps(index, indent=2) + "\n", encoding="utf-8"
    )
    for level in document["levels"]:
        (levels_root / f"level{level['levelNumber']:02d}.json").write_text(
            json.dumps(level, indent=2) + "\n", encoding="utf-8"
        )


def extract(repository_root: Path) -> dict[str, Any]:
    old_source = repository_root / "OldSource"
    extracted_root = old_source / "spaced_penguin"
    chunks_root = extracted_root / "chunks"
    assets_root = old_source / "Assets" / "spaced_penguin"
    score_path = chunks_root / "VWSC-1806.bin"
    labels_path = chunks_root / "VWLB-1808.bin"
    config_path = chunks_root / "DRCF-1801.json"

    for path in (score_path, labels_path, config_path):
        if not path.exists():
            raise ExtractionError(f"Required source file is missing: {path}")

    score = DirectorScore(score_path)
    catalog = CastCatalog(extracted_root, assets_root)
    labels = parse_labels(labels_path)
    config = read_json(config_path)
    level_frames = find_level_frames(score, catalog, labels)
    levels = [
        make_level(score, catalog, level_number, frame_number)
        for level_number, frame_number in enumerate(level_frames, start=1)
    ]
    validate_extraction(levels, level_frames)

    return {
        "format": "spaced-penguin-director-levels-v1",
        "description": (
            "Intermediate extraction of the original Director score. Coordinates, channel "
            "numbers, cast identities, and Lingo behavior properties are preserved; this is "
            "not the HTML5 runtime level schema."
        ),
        "source": {
            "scoreChunk": str(score_path.relative_to(repository_root)).replace("\\", "/"),
            "scoreChunkSha256": source_digest(score_path),
            "labelsChunk": str(labels_path.relative_to(repository_root)).replace("\\", "/"),
            "labelsChunkSha256": source_digest(labels_path),
        },
        "movie": {
            "stage": {
                "width": config["movieRight"] - config["movieLeft"],
                "height": config["movieBottom"] - config["movieTop"],
            },
            "directorVersion": config.get("directorVersion"),
            "frameRate": config.get("frameRate"),
            "decodedFrameCount": len(score.frames),
            "declaredFrameCount": score.declared_frame_count,
            "displayedChannelCount": score.displayed_channel_count,
            "spriteRecordSize": score.sprite_record_size,
            "labels": labels,
            "castLibraries": catalog.library_summary(),
        },
        "levels": levels,
    }


def parse_args() -> argparse.Namespace:
    script_path = Path(__file__).resolve()
    default_repository = script_path.parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repository-root",
        type=Path,
        default=default_repository,
        help="Repository root containing OldSource (default: inferred from this script)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output directory (default: OldSource/extracted_levels)",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Decode and validate without writing JSON files",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repository_root = args.repository_root.resolve()
    document = extract(repository_root)
    if not args.verify_only:
        output_root = (
            args.output.resolve()
            if args.output
            else repository_root / "OldSource" / "extracted_levels"
        )
        write_outputs(output_root, document)
        print(f"Extracted {len(document['levels'])} levels to {output_root}")
    else:
        print(
            f"Verified {len(document['levels'])} levels across frames "
            f"{document['levels'][0]['directorFrame']}-{document['levels'][-1]['directorFrame']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
