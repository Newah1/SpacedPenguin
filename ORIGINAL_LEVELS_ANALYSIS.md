# Spaced Penguin Original Level System Analysis

## Executive Summary

After comprehensive analysis of the original Shockwave source code, **the original 25 levels are not stored as extractable data files**. Instead, they exist as **frame-based layouts** within the Director movie file (`spaced_penguin.dir`), making automated extraction impossible without the original Director project file.

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

### Impossible Automated Conversion

**The original level data cannot be programmatically extracted** because:

1. **No External Data Files**: Levels exist only as sprite arrangements in the Director movie
2. **Binary Format**: The `.dir` file is a proprietary binary format
3. **Embedded Layout**: Sprite positions are stored in the movie's internal frame data

### Required Manual Recreation Process

To recreate the 25 original levels, you must:

#### Option 1: Play-Through Documentation
1. **Run Original Game**: Play through all 25 levels
2. **Screenshot Each Level**: Capture level layouts at start
3. **Document Coordinates**: Manually measure sprite positions
4. **Record Properties**: Note planet masses and behaviors through gameplay observation

#### Option 2: Director File Analysis (If Available)
1. **Source Director Project**: Obtain original `.dir` working files
2. **Export Frame Data**: Use Director to export sprite coordinates per frame
3. **Behavior Property Export**: Extract behavior script properties
4. **Automated Conversion**: Write script to transform Director data to JSON

### Modern JSON Level Schema

Based on the behavior analysis, here's the recommended JSON structure:

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

1. **Manual Documentation Approach**: Most practical given source limitations
2. **Community Effort**: Engage players to help document levels
3. **Progressive Recreation**: Start with simple levels, build complexity
4. **Behavior Testing**: Use existing modern physics to match original feel

### For Modern Implementation

1. **Preserve Original Mechanics**: Maintain exact physics constants and formulas
2. **Enhance JSON Schema**: Add modern features while keeping backward compatibility
3. **Validation System**: Ensure converted levels match original difficulty progression
4. **Community Tools**: Create level editor for new content creation

## Conclusion

The original Spaced Penguin's 25 levels are **embedded in the Director movie timeline** and cannot be extracted automatically. The level system uses a sophisticated **frame-based progression** with **behavior-driven object properties** rather than external configuration files.

**To recreate the original levels**, manual documentation through gameplay is the most viable approach, requiring systematic capture of sprite positions, masses, and behavioral configurations for all 25 levels.

The analysis has provided complete understanding of the object behavior system, enabling accurate recreation of the original game mechanics in the modern JSON-based level format.