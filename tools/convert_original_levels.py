#!/usr/bin/env python3
"""Convert extracted Director levels into the modern runtime's default catalog."""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from typing import Any


SOURCE_WIDTH = 500
SOURCE_HEIGHT = 400
TARGET_WIDTH = 800
TARGET_HEIGHT = 600
SCALE = TARGET_HEIGHT / SOURCE_HEIGHT
OFFSET_X = (TARGET_WIDTH - SOURCE_WIDTH * SCALE) / 2
SOURCE_FPS = 30
SOURCE_GRAVITY = 0.9
PENGUIN_RADIUS = 16
TUTORIAL_TEXT_PREFIX = "txt_"
TUTORIAL_ARROW_NAME = "arrow_text"


def point(value: dict[str, Any]) -> dict[str, float]:
    return {"x": round(OFFSET_X + value["x"] * SCALE, 6), "y": round(value["y"] * SCALE, 6)}


def centered_rect(sprite: dict[str, Any]) -> dict[str, float]:
    """Translate a Director top-left-registered field to our center-registered object."""
    return point({
        "x": sprite["position"]["x"] + sprite["size"]["width"] / 2,
        "y": sprite["position"]["y"] + sprite["size"]["height"] / 2,
    })


def tutorial_html(sprite: dict[str, Any], asset_root: Path) -> str:
    member = sprite["cast"]["memberNumber"]
    matches = sorted(asset_root.glob(f"Text_{member}_*.htm"))
    if len(matches) != 1:
        raise ValueError(
            f"expected one HTML asset for text cast member {member}, found {len(matches)}"
        )
    document = matches[0].read_text(encoding="utf-8")
    body = re.search(r"<body\b[^>]*>(.*?)</body>", document, flags=re.IGNORECASE | re.DOTALL)
    if body is None:
        raise ValueError(f"missing HTML body in {matches[0]}")
    return body.group(1).strip()


def behavior(sprite: dict[str, Any], name: str) -> dict[str, Any] | None:
    for attachment in sprite.get("behaviors", []):
        if attachment.get("script", {}).get("name") == name:
            return attachment.get("properties", {})
    return None


def rotation_degrees(sprite: dict[str, Any]) -> float:
    raw = sprite.get("appearance", {}).get("rotationRaw", 0)
    if raw >= 2**31:
        raw -= 2**32
    return raw / 100.0


def object_id(sprite: dict[str, Any]) -> str:
    if sprite["target"]:
        return "target"
    prefix = "bonus" if behavior(sprite, "Bonus") is not None else "planet"
    return f"{prefix}-ch{sprite['channel']}"


def director_orbit(
    sprite: dict[str, Any],
    sprites_by_channel: dict[int, dict[str, Any]],
    converted_ids: dict[int, str],
) -> dict[str, Any] | None:
    source = behavior(sprite, "Orbiting")
    if source is None:
        return None
    sources: list[dict[str, Any]] = []
    for key in ("pSun", "pSun2", "pSun3"):
        channel = int(source.get(key, 0) or 0)
        if channel == 0:
            continue
        original = sprites_by_channel[channel]
        entry: dict[str, Any] = {
            "mass": source.get("pAltMass", 1) or 1,
            "collisionRadius": round(original["size"]["width"] * SCALE / 2, 6),
        }
        if channel in converted_ids:
            entry["targetId"] = converted_ids[channel]
        else:
            entry["position"] = point(original["position"])
        sources.append(entry)
    first = sources[0]
    divisor = source.get("pGravFactor", 1) or 1
    params = {
        "sourceFrameRate": SOURCE_FPS,
        "gravityStrength": round(SOURCE_GRAVITY * SCALE * SCALE / divisor, 9),
        "initialVelocity": {
            "x": round((source.get("pVX", 0) or 0) * SCALE, 9),
            "y": round((source.get("pVY", 0) or 0) * SCALE, 9),
        },
        "gravitySources": sources,
    }
    orbit: dict[str, Any] = {"orbitType": "director-gravity", "orbitParams": params}
    if "targetId" in first:
        orbit["orbitTargetId"] = first["targetId"]
    else:
        orbit["orbitCenter"] = first["position"]
    return orbit


def convert_level(source: dict[str, Any], asset_root: Path = Path("OldSource/Assets/spaced_penguin")) -> dict[str, Any]:
    sprites = source["sprites"]
    sprites_by_channel = {sprite["channel"]: sprite for sprite in sprites}
    gameplay = [
        sprite for sprite in sprites
        if behavior(sprite, "Planet") is not None
        or behavior(sprite, "Bonus") is not None
        or sprite["target"]
    ]
    converted_ids = {sprite["channel"]: object_id(sprite) for sprite in gameplay}
    controller = source["controllerProperties"]
    hoop = sprites_by_channel[38]
    hoop_position = point(hoop["position"])
    rotation = math.radians(rotation_degrees(hoop))
    reset_position = {
        "x": round(hoop_position["x"] + math.cos(rotation) * 30 * SCALE, 6),
        "y": round(hoop_position["y"] + math.sin(rotation) * 30 * SCALE, 6),
    }

    objects: list[dict[str, Any]] = [{
        "type": "slingshot",
        "position": reset_position,
        "properties": {
            "id": "slingshot",
            "anchorPosition": hoop_position,
            "launchModel": "director",
            "sourceFrameRate": SOURCE_FPS,
            "coordinateScale": SCALE,
            "maxPullback": controller.get("pStretchLimit", 100),
            "minPullback": 10,
        },
    }]

    for sprite in gameplay:
        orbit = director_orbit(sprite, sprites_by_channel, converted_ids)
        if sprite["target"]:
            width = sprite["size"]["width"] * SCALE
            height = sprite["size"]["height"] * SCALE
            properties: dict[str, Any] = {
                "id": "target",
                "width": round(width, 6),
                "height": round(height, 6),
                "collisionRadius": round(max(width, height) / 2 + PENGUIN_RADIUS, 6),
            }
            object_type = "target"
        elif (planet := behavior(sprite, "Planet")) is not None:
            radius = sprite["size"]["width"] * SCALE / 2
            reach = planet.get("pGReach", 0) or 0
            properties = {
                "id": converted_ids[sprite["channel"]],
                "radius": round(radius, 6),
                "mass": planet.get("pMass", 0),
                "collisionRadius": round(max(0, radius + 8 * SCALE - PENGUIN_RADIUS), 6),
                "gravitationalReach": round((5000 if reach == 0 else sprite["size"]["width"] / 2 + reach) * SCALE, 6),
                "planetType": sprite["cast"]["name"],
            }
            object_type = "planet"
        else:
            bonus = behavior(sprite, "Bonus") or {}
            properties = {
                "id": converted_ids[sprite["channel"]],
                "value": bonus.get("pValue", 250),
                "width": round(sprite["size"]["width"] * SCALE, 6),
                "height": round(sprite["size"]["height"] * SCALE, 6),
            }
            object_type = "bonus"
        if orbit is not None:
            properties["orbit"] = orbit
        objects.append({"type": object_type, "position": point(sprite["position"]), "properties": properties})

    tutorial_text = [
        sprite for sprite in sprites
        if sprite["cast"]["library"] == "Text"
        and sprite["cast"]["name"].startswith(TUTORIAL_TEXT_PREFIX)
    ]
    for sprite in tutorial_text:
        width = round(sprite["size"]["width"] * SCALE, 6)
        height = round(sprite["size"]["height"] * SCALE, 6)
        objects.append({
            "type": "textobject",
            "position": centered_rect(sprite),
            "properties": {
                "id": f"tutorial-text-ch{sprite['channel']}",
                "name": sprite["cast"]["name"],
                "content": tutorial_html(sprite, asset_root),
                "width": width,
                "height": height,
                "fontSize": 18,
                "color": "#FFFFCC",
                "backgroundColor": "rgba(0, 0, 0, 0)",
                "padding": 0,
                "maxWidth": width,
                "autoSize": False,
                "fadeIn": False,
                "sourceChannel": sprite["channel"],
            },
        })

    tutorial_arrows = [
        sprite for sprite in sprites if sprite["cast"]["name"] == TUTORIAL_ARROW_NAME
    ]
    arrow_targets = [item for item in objects if item["type"] in {"slingshot", "target", "planet", "bonus"}]
    for sprite in tutorial_arrows:
        position = point(sprite["position"])
        target = min(
            arrow_targets,
            key=lambda item: math.hypot(
                item["position"]["x"] - position["x"],
                item["position"]["y"] - position["y"],
            ),
        )
        length = round(max(sprite["size"]["width"], sprite["size"]["height"]) * SCALE, 6)
        objects.append({
            "type": "pointingarrow",
            "position": position,
            "properties": {
                "id": f"tutorial-arrow-ch{sprite['channel']}",
                "name": f"Arrow to {target['properties']['id']}",
                "pointingAt": target["position"],
                "color": "#FFFFCC",
                "glowColor": "rgba(255, 255, 204, 0.65)",
                "scaleWithDistance": True,
                "maxDistance": 1,
                "minWidth": length,
                "maxWidth": length,
                "pulseSpeed": 0,
                "minAlpha": 1,
                "maxAlpha": 1,
                "sourceChannel": sprite["channel"],
                "sourceRotation": rotation_degrees(sprite),
                "targetId": target["properties"]["id"],
            },
        })

    border = controller.get("pBorder", 100) * SCALE
    target = next(item for item in objects if item["type"] == "target")
    return {
        "level": source["levelNumber"],
        "name": f"Original Level {source['levelNumber']:02d}",
        "description": "Generated runtime port from the extracted Director score.",
        "startPosition": reset_position,
        "targetPosition": target["position"],
        "bounds": {
            "stage": {"x": OFFSET_X, "y": 0, "width": SOURCE_WIDTH * SCALE, "height": TARGET_HEIGHT},
            "flight": {
                "x": OFFSET_X - border,
                "y": -border,
                "width": SOURCE_WIDTH * SCALE + border * 2,
                "height": TARGET_HEIGHT + border * 2,
            },
        },
        "objects": objects,
        "rules": {
            "gravitationalConstant": SOURCE_GRAVITY * SCALE * SCALE * SOURCE_FPS / 2,
            "scoreMultiplier": 1,
        },
        "port": {
            "status": "default",
            "sourceFrame": source["directorFrame"],
            "sourceStage": {"width": SOURCE_WIDTH, "height": SOURCE_HEIGHT, "fps": SOURCE_FPS},
            "coordinateTransform": {"scale": SCALE, "offsetX": OFFSET_X, "offsetY": 0},
            "isLastLevel": source["isLastLevel"],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("OldSource/extracted_levels/levels"))
    parser.add_argument("--output", type=Path, default=Path("levels"))
    parser.add_argument("--asset-root", type=Path, default=Path("OldSource/Assets/spaced_penguin"))
    parser.add_argument("--verify", action="store_true", help="fail if generated output differs from disk")
    args = parser.parse_args()
    generated: dict[Path, str] = {}
    for path in sorted(args.input.glob("level*.json")):
        level = convert_level(json.loads(path.read_text(encoding="utf-8")), args.asset_root)
        destination = args.output / f"level{level['level']:02d}.json"
        generated[destination] = json.dumps(level, indent=2) + "\n"
    if args.verify:
        mismatches = [str(path) for path, content in generated.items() if not path.exists() or path.read_text(encoding="utf-8") != content]
        if mismatches:
            raise SystemExit("generated candidates differ: " + ", ".join(mismatches))
    else:
        args.output.mkdir(parents=True, exist_ok=True)
        for path, content in generated.items():
            path.write_text(content, encoding="utf-8")
    print(f"{'Verified' if args.verify else 'Wrote'} {len(generated)} default levels in {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
