# Original Director Level Extraction

This directory contains a deterministic intermediate JSON extraction of the
original Spaced Penguin levels. It preserves the Director score's channel
numbers, cast identities, positions, dimensions, and attached Lingo behavior
properties. It is **not** the JSON schema consumed by the HTML5 runtime.

## Regenerating the files

From the repository root:

```powershell
python tools\extract_original_levels.py
```

Decode and validate the source without writing files:

```powershell
python tools\extract_original_levels.py --verify-only
```

The extractor uses only Python's standard library.

## Output layout

- `index.json` is a compact inventory with frame mappings and object counts.
- `original_levels.json` contains the complete combined extraction.
- `levels/level01.json` through `levels/level25.json` contain individual levels.

## Important fields

- `directorFrame` records the source timeline frame. Levels 1–25 are frames
  11–35.
- `channel` is the original Director sprite channel and is significant because
  behaviors such as GPS and Orbiting refer to other objects by channel number.
- `position` and `size` are the raw decoded Director score values. They have not
  been transformed into the HTML5 canvas coordinate model.
- `cast` resolves a score-local cast member number to its library, original cast
  chunk ID, name, asset metadata, and registration point.
- `behaviors` lists attached Lingo behaviors. `initializer` retains the original
  serialized property list, while `properties` exposes its values as JSON.
- `target` follows the GPS behavior's `pTarget` channel. This matters for levels
  where the ship also has an Orbiting behavior.
- `spriteInfo.rawHex` retains the still-uninterpreted Director sprite-info record
  so later analysis does not require another extraction pass.

The source chunk hashes in each generated index make it possible to confirm
which binary data produced the JSON.
