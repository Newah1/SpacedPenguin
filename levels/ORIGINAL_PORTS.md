# Default original-level ports

These 25 generated files are the default campaign. Regenerate them from the extracted Director score with:

```powershell
python tools\convert_original_levels.py
```

Load one in the browser with `?level=NUMBER`, for example `http://localhost:8000/?level=22`. The archived hand-authored catalog uses `?level=manual:NUMBER`. There are no legacy selector aliases.

The conversion policy is intentionally explicit:

- The original 500 x 400 stage is uniformly scaled by 1.5 and centered in the current 800 x 600 world with a 25-pixel horizontal gutter.
- The slingshot anchor comes from Director channel 38. The reset point, rotation, stretch limit, snap distance, and quadratic launch speed use the original GPS behavior.
- Planet mass, collision padding, gravity reach, bonus value, target size, and per-level out-of-bounds border come from their source behaviors and sprites.
- Tutorial HTML fields are converted to centered `textobject` rectangles, preserving their authored markup and pale-yellow styling. The five `arrow_text` score sprites become `pointingarrow` objects aimed at the nearest equivalent ship, slingshot, bonus, or planet; the separate runtime flight indicator is excluded.
- `director-gravity` reproduces the old discrete 30 Hz Orbiting behavior, including alternate mass, collision-distance clamping, hierarchical motion, and multiple gravity sources. Level 14 exercises the two-source form.
- Current-runtime distances, velocities, and gravity constants are converted from Director units; source channels and the coordinate transform remain visible in IDs and `port` metadata.

Run the deterministic compatibility gate with:

```powershell
npm run test:original-levels
```

The gate validates each file and requires the shared headless runner to find at least one completion in a fixed 400-sample, 15-second sweep.
