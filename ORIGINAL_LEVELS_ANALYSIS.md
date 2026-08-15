# Spaced Penguin Original Level System Analysis

> **Historical scope:** This document analyzes the original Director/Shockwave movie and its estimated 25-level timeline. The current HTML5 rewrite ships 25 validated converted JSON levels, with a separate archived 20-level manual catalog. See [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`levels/README.md`](levels/README.md) for current behavior.

## Executive Summary

The original 25 levels are stored as **frame-based layouts** in the Director movie's `VWSC` score chunk. They are not external data files, but they are extractable: `tools/extract_original_levels.py` reconstructs the delta-compressed score frames, resolves cast members, and decodes attached Lingo behavior initializers into JSON. Generated intermediate data lives in `OldSource/extracted_levels/`.

## Level System Architecture

### Frame-Based Level Structure

The original game uses a **Director movie timeline approach** where each level is defined by sprite placement on individual movie frames:

- **Frame Range**: Levels occupy frames 11-49 (39 total frames)
- **Level Count**: Based on the "Level 3 of 25 Complete!" format, there are **25 total levels**
- **Frame Mapping**: Levels 1-25 map to frames 11-35 (frames 36-49 appear unused or reserved)

### Movie Structure Timeline

```
Frame 1:   "Load"       - Asset loading
Frame 3:   "Intro"      - Title screen
Frame 6:   "Tips"       - Instructions
Frame 11:  "Levels"     - LEVEL 1 START
Frame 12:              - Level 2
...
Frame 35:              - Level 25 (estimated)
Frame 50:  "End_Stats" - Game completion
Frame 55:  "HS FM"     - High score form
Frame 60:  "HS_Sending"- Score submission
```

## Object Behavior System

### Planet Configuration

Each planet sprite uses `BehaviorScript 4 - Planet` with configurable properties:

```lingo
property pMass, pGReach

// Registration in global array
gPlanets.add([spriteNum, pMass, collisionRadius, gravityReach])
```

**Planet Properties:**
- `pMass`: Gravitational strength (0-1000)
- `pGReach`: Gravity radius beyond sprite bounds (0=infinite, max 200px)
- **Collision Radius**: `(sprite.width / 2) + 8`
- **Gravity Reach**: `(sprite.width / 2) + pGReach` (or 5000 if `pGReach = 0`)

### Orbiting Objects

Complex orbital mechanics via `BehaviorScript 5 - Orbiting`:

```lingo
property pSun, pSun2, pSun3, pVX, pVY, pGravFactor, pAltMass
```

**Orbital Properties:**
- **Multiple Orbit Centers**: Can orbit up to 3 different sprites simultaneously
- **Initial Velocity**: `pVX`, `pVY` (-25.0 to 25.0)
- **Gravity Factor**: `pGravFactor` (1-50) - affects orbital speed
- **Mass Override**: `pAltMass` (0-1000) - alternative mass for special behaviors

### Bonus System

Collectible items managed by `BehaviorScript 13 - Bonus`:

```lingo
property pValue, pState, pRotationVel
```

**Bonus Mechanics:**
- **Value**: `pValue` (0-10000) - distance points awarded
- **States**: `#notHit` → `#Hit` (prevents re-collection)
- **Visual Feedback**: Sprite switches to "hit" frame, rotation speed increases to 30°
- **Sound**: Plays `"snd_bonus"` on collection
- **Integration**: Adds to distance calculation in scoring formula

### Level Control System

Each level's GPS controller (`BehaviorScript 2 - GPS`) has properties:

```lingo
property pTarget, pBorder, plastLevel, pStretchLimit
```

**Level Configuration:**
- `pTarget`: Target ship sprite number (default: 7)
- `pBorder`: Out-of-bounds grace distance (0-1000px)
- `plastLevel`: Boolean marking final level for game completion
- `pStretchLimit`: Slingshot maximum stretch (30-120px)

## Level Progression Logic

### Frame Navigation

```lingo
on exitFrame
  if pState = #next_level then
    if plastLevel then
      endGame()
    else
      go(the frame + 1)  // Advance to next level frame
    end if
  end if
end
```

### Level Completion Check

```lingo
// Active gameplay only occurs in frame range 11-49
if (the frame >= 11) and (the frame <= 49) then
  // Handle level-specific input and logic
end if
```

## Asset Management

### Sprite Allocation

Based on the GPS script sprite references:

- **Sprite 36**: GPS controller (penguin)
- **Sprite 33**: Arrow indicator (`pSArrow`)
- **Sprite 32-34**: Launch trajectory markers (`pSLS1-3`)
- **Sprite 37-38**: Slingshot hoop components (`pSHoopT/B`)
- **Sprite 35/37**: Rubber band components (`pSRubberT/B`)
- **Sprite 39**: Bonus popup display
- **Sprite 41-53**: Reserved for UI elements (set to invisible)

### Planet Sprites

Available planet types from asset analysis:
- `planet_saturn` - Ringed planet
- `planet_grey` - Standard grey planet
- `planet_red_gumball` - Red spherical planet
- `planet_sun` - Solar body (likely high mass)
- `planet_pink` - Pink variant planet

## Conversion Strategy for Modern JSON Format

### Automated Extraction

The repository now includes a standard-library Python extractor. It:

1. Reads the `VWSC-1806.bin` score header and sprite-detail index.
2. Reconstructs all 64 frames from Director's delta-compressed channel updates.
3. Selects the 25 GPS-controlled level frames (11–35), stopping at the frame whose GPS behavior has `plastLevel: 1`.
4. Resolves logical cast slots through the three `CAS_` association tables.
5. Decodes sprite coordinates, dimensions, appearance fields, and cross-channel references.
6. Resolves attached behaviors and parses their serialized property lists, including planet mass/reach, orbital velocity and parents, bonus value, target channel, border, gravitational constant, stretch limit, and final-level flag.

Run it from the repository root:

```powershell
python tools\extract_original_levels.py
```

The result is an intermediate preservation format rather than the modern runtime schema. A separate conversion step should decide how Director registration points, support sprites, and behavior semantics map into current objects.

### Historical proposed JSON schema

The following draft predates the current loader and is retained only as design history. It is **not** accepted by the current runtime. Current levels use the envelope and object definitions documented in [`levels/README.md`](levels/README.md).

```json
{
  "level": 1,
  "title": "Level 1",
  "isLastLevel": false,
  "config": {
    "targetSprite": 7,
    "borderGrace": 100,
    "slingshotStretchLimit": 100,
    "gravitationalConstant": 3.0
  },
  "slingshot": {
    "position": [100, 400],
    "rotation": 0
  },
  "target": {
    "position": [700, 400],
    "type": "ship"
  },
  "planets": [
    {
      "id": "planet1",
      "type": "planet_saturn",
      "position": [400, 300],
      "mass": 200,
      "gravityReach": 0,
      "behavior": "static"
    }
  ],
  "orbitingObjects": [
    {
      "id": "moon1",
      "type": "planet_grey",
      "orbitCenters": ["planet1"],
      "initialVelocity": [5.0, 0.0],
      "gravityFactor": 10,
      "mass": 50
    }
  ],
  "bonuses": [
    {
      "id": "bonus1",
      "type": "bonus",
      "position": [300, 350],
      "value": 100
    }
  ]
}
```

## Recommendations

### For Level Recreation

1. **Use the extracted JSON as provenance**: Keep Director frame, channel, cast, and raw sprite-info fields through conversion.
2. **Convert into the current schema separately**: Do not make the binary decoder responsible for modern gameplay design decisions.
3. **Render and compare**: Validate converted layouts against the original stage and account for cast registration points.
4. **Behavior testing**: Compare the modern physics against the extracted masses, velocities, gravity factors, and reach values.

### For Modern Implementation

1. **Preserve Original Mechanics**: Maintain exact physics constants and formulas
2. **Current JSON format**: Implemented with compatibility aliases; executable validation exists, but a generated JSON Schema artifact does not
3. **Validation System**: Implemented for structure, numeric constraints, identities, orbit references/cycles, composition, and rules
4. **Level editor**: Implemented for live editing, JSON download, and in-session undo/redo; import and persistent save remain future work

## Conclusion

The original Spaced Penguin's 25 levels are embedded in the Director movie timeline and are now automatically extracted into readable JSON. The level system uses frame-based progression with behavior-driven object properties rather than external configuration files.

The intermediate extraction preserves all active sprite identities and every attached initializer encountered on the level frames. Converting that data into the modern runtime format remains a distinct follow-up task because the two engines use different coordinate, rendering, and physics models.
