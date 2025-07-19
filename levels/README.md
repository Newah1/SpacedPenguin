# Spaced Penguin Level System

This directory contains JSON level definitions for the Spaced Penguin game. The new level loading system supports dynamic object creation, custom rules, and extensible gameplay mechanics.

## Level JSON Schema

```json
{
    "name": "Level Name",
    "description": "Level description",
    "startPosition": { "x": 100, "y": 300 },
    "targetPosition": { "x": 700, "y": 300 },
    "objects": [
        {
            "type": "object_type",
            "position": { "x": 400, "y": 200 },
            "properties": {
                // Object-specific properties
            }
        }
    ],
    "rules": {
        // Level-specific rules and conditions
    }
}
```

## Supported Object Types

### Planet
```json
{
    "type": "planet",
    "position": { "x": 400, "y": 200 },
    "properties": {
        "radius": 30,
        "mass": 500,
        "gravitationalReach": 5000,
        "orbit": {
            "center": { "x": 350, "y": 250 },
            "radius": 100,
            "speed": 1.0
        }
    }
}
```

### Bonus
```json
{
    "type": "bonus",
    "position": { "x": 300, "y": 150 },
    "properties": {
        "value": 100
    }
}
```

### Target
```json
{
    "type": "target",
    "position": { "x": 700, "y": 300 },
    "properties": {
        "width": 60,
        "height": 60
    }
}
```

### Slingshot
```json
{
    "type": "slingshot",
    "position": { "x": 100, "y": 300 },
    "properties": {
        "anchorX": 100,
        "anchorY": 300,
        "stretchLimit": 100,
        "velocityMultiplier": 15
    }
}
```

## Level Rules

The `rules` section supports various gameplay modifiers:

```json
{
    "rules": {
        "maxTries": 5,                    // Maximum attempts allowed (null = unlimited)
        "timeLimit": 60,                  // Time limit in seconds (null = no limit)
        "scoreMultiplier": 1.5,           // Score multiplier for this level
        "requiredBonuses": 3,             // Must collect this many bonuses to win
        "allowedMisses": 1,               // Maximum planet collisions allowed
        "gravitationalConstant": 400,     // Custom gravity strength
        "customBehaviors": [              // Future extension point
            "orbital_mechanics",
            "enhanced_gravity"
        ]
    }
}
```

## Adding New Levels

1. Create a new JSON file in this directory (e.g., `level6.json`)
2. Update the `tryLoadLevelFile()` calls in `levelLoader.js` to include your new level
3. The system will automatically load and validate your level

## Example Levels

- `level4.json` - Complex gravitational maze with orbital mechanics
- `level5.json` - Precision challenge with strict requirements

## Extending the System

To add new object types:

1. Add a new case to `GameObjectFactory.create()`
2. Implement the creation method (e.g., `createObstacle()`)
3. Create the corresponding game object class
4. Update the documentation

The system is designed to be extensible and supports future additions like obstacles, power-ups, moving platforms, and more complex interactive elements. 