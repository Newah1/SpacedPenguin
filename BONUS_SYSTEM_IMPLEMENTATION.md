# Bonus System Implementation

## Overview

The bonus system has been updated to use the decompiled SVG files and implement the exact behavior from the original Spaced Penguin game. This implementation faithfully recreates the original bonus mechanics including visual states, rotation behavior, and collection logic.

## Key Features

### 1. SVG-Based Visual Assets
- **bonus.svg**: Normal state bonus sprite with blue/green gradient
- **bonus_hit.svg**: Hit state bonus sprite with orange/red gradient
- Automatic loading and rendering of SVG files
- Fallback to programmatically drawn star shape if SVG loading fails

### 2. State Management (Matching Original)
- **notHit**: Initial state, bonus can be collected
- **Hit**: Collected state, bonus shows hit animation
- State transitions match the original game's member switching system

### 3. Rotation Behavior (Matching Original)
- **Normal rotation speed**: 3.0 (matching original `pRotationVel = 3.0`)
- **Hit rotation speed**: 30.0 (matching original `pRotationVel = 30.0`)
- **Decay rate**: 0.1 per frame (matching original `pRotationVel = pRotationVel - 0.1`)
- Rotation speed gradually returns to 3.0 after being hit

### 4. Collection Logic (Matching Original)
- **collect()** method returns the bonus value (matching original `return pValue`)
- Returns 0 if already collected (matching original behavior)
- Triggers state change and rotation speed increase
- Switches to hit sprite (equivalent to original's member switching)

### 5. Reset Functionality (Matching Original)
- **reset()** method restores bonus to notHit state
- Resets rotation speed to 3.0
- Switches back to normal sprite
- Used when level is reset or penguin is reset

## Implementation Details

### Class Structure
```javascript
class Bonus extends GameObject {
    constructor(x, y, value, assetLoader = null)
    async initializeSprites()
    async loadSVGSprite(spriteName)
    update(deltaTime)
    drawSprite(ctx)
    drawFallbackStar(ctx)
    collect()
    reset()
    setOrbit(center, radius, speed)
}
```

### SVG Loading Process
1. Fetch SVG file as text
2. Create canvas element for rendering
3. Convert SVG to image using Blob URL
4. Draw image to canvas
5. Create PIXI texture from canvas
6. Clean up Blob URL

### Integration Points
- **GameObjectFactory**: Creates bonuses with asset loader
- **Physics System**: Checks for collection using state-based logic
- **Game Engine**: Handles collection and scoring
- **Level Rules**: Counts collected bonuses using state checking

## Original Game Behavior Analysis

### From BehaviorScript 13 - Bonus.ls:
```lingo
property pSprite, pValue, pState, pRotationVel

on beginSprite me
  pState = #notHit
  pRotationVel = 3.0
end

on collectBonus me
  if pState = #notHit then
    pRotationVel = 30.0
    pState = #Hit
    pSprite.member = member(pSprite.memberNum + 1)
    return pValue
  else
    return 0
  end if
end

on resetBonus me
  if pState = #Hit then
    pRotationVel = 3.0
    pState = #notHit
    pSprite.member = member(pSprite.memberNum - 1)
  end if
end

on prepareFrame me
  if pRotationVel > 3.0 then
    pRotationVel = pRotationVel - 0.1
  else
    pRotationVel = 3.0
  end if
  pSprite.rotation = pSprite.rotation + pRotationVel
end
```

### Key Behaviors Implemented:
1. **State Management**: `#notHit` and `#Hit` states
2. **Rotation Speed**: 3.0 normal, 30.0 when hit, decays by 0.1
3. **Member Switching**: Changes sprite when hit (implemented as SVG switching)
4. **Collection Logic**: Returns value only if not already collected
5. **Reset Logic**: Restores original state and sprite

## Testing

A test page (`test_bonus.html`) has been created to verify:
- SVG loading functionality
- Bonus behavior and rotation
- Collection mechanics
- Reset functionality

## Usage

### Creating a Bonus
```javascript
const bonus = new Bonus(x, y, value, assetLoader);
```

### Collecting a Bonus
```javascript
const collectedValue = bonus.collect();
if (collectedValue > 0) {
    // Bonus was successfully collected
    score += collectedValue;
}
```

### Resetting a Bonus
```javascript
bonus.reset(); // Restores to notHit state
```

### Checking Bonus State
```javascript
if (bonus.state === 'Hit') {
    // Bonus has been collected
}
```

## File Structure
- `js/gameObjects.js`: Updated Bonus class implementation
- `js/levelLoader.js`: Updated GameObjectFactory to pass assetLoader
- `js/physics.js`: Updated collection detection logic
- `js/game.js`: Updated collection and reset handling
- `assets/sprites/bonus.svg`: Normal state sprite
- `assets/sprites/bonus_hit.svg`: Hit state sprite
- `test_bonus.html`: Test page for verification

## Future Enhancements
- Add sound effects for collection
- Implement bonus popup animations
- Add particle effects for collection
- Support for different bonus types/values 