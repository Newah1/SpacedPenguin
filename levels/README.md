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
        "planetType": "planet_sun",
        "orbit": {
            "type": "circular",
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
        "value": 100,
        "orbit": {
            "type": "elliptical",
            "center": { "x": 400, "y": 200 },
            "semiMajorAxis": 120,
            "semiMinorAxis": 80,
            "speed": 0.8,
            "rotation": 0.5
        }
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

## Orbit System

The new consolidated orbit system supports multiple orbit types for both planets and bonuses:

### Circular Orbit (Legacy)
```json
{
    "orbit": {
        "type": "circular",
        "center": { "x": 400, "y": 200 },
        "radius": 100,
        "speed": 1.0
    }
}
```

### Elliptical Orbit
```json
{
    "orbit": {
        "type": "elliptical",
        "center": { "x": 400, "y": 200 },
        "semiMajorAxis": 120,
        "semiMinorAxis": 80,
        "speed": 0.8,
        "rotation": 0.5
    }
}
```

**Parameters:**
- `semiMajorAxis`: Length of the major axis (longest radius)
- `semiMinorAxis`: Length of the minor axis (shortest radius)
- `rotation`: Rotation of the ellipse in radians (optional, default: 0)

### Figure-8 Orbit (Lemniscate)
```json
{
    "orbit": {
        "type": "figure8",
        "center": { "x": 400, "y": 200 },
        "size": 100,
        "speed": 0.6
    }
}
```

**Parameters:**
- `size`: Controls the overall size of the figure-8 pattern

### Custom Orbit
```json
{
    "orbit": {
        "type": "custom",
        "center": { "x": 400, "y": 200 },
        "speed": 1.0
        // Note: Custom functions require programmatic setup
    }
}
```

**Note:** Custom orbits with parametric functions require programmatic setup and cannot be fully configured via JSON.

## Level Rules

The `rules` section supports various gameplay modifiers:

```json
{
    "rules": {
        "maxTries": 5,
        "timeLimit": 120,
        "scoreMultiplier": 2.0,
        "requiredBonuses": 3,
        "allowedMisses": 2,
        "gravitationalConstant": 2.5,
        "customBehaviors": [
            "orbital_mechanics",
            "enhanced_gravity"
        ]
    }
}
```

### Rule Parameters

- **maxTries**: Maximum number of attempts allowed (null = unlimited)
- **timeLimit**: Time limit in seconds (null = no limit)
- **scoreMultiplier**: Multiplier applied to all scores
- **requiredBonuses**: Number of bonuses that must be collected to complete level
- **allowedMisses**: Maximum planet collisions allowed
- **gravitationalConstant**: Custom gravitational constant for the level
- **customBehaviors**: Array of special behaviors to enable

## Examples

### Simple Level with Circular Orbits
```json
{
    "name": "Basic Orbital",
    "startPosition": { "x": 100, "y": 300 },
    "targetPosition": { "x": 700, "y": 300 },
    "objects": [
        {
            "type": "planet",
            "position": { "x": 400, "y": 200 },
            "properties": {
                "radius": 30,
                "mass": 200,
                "planetType": "planet_sun"
            }
        },
        {
            "type": "bonus",
            "position": { "x": 300, "y": 150 },
            "properties": {
                "value": 100,
                "orbit": {
                    "type": "circular",
                    "center": { "x": 400, "y": 200 },
                    "radius": 80,
                    "speed": 1.0
                }
            }
        }
    ]
}
```

### Complex Level with Mixed Orbits
```json
{
    "name": "Orbital Challenge",
    "startPosition": { "x": 100, "y": 300 },
    "targetPosition": { "x": 750, "y": 300 },
    "objects": [
        {
            "type": "planet",
            "position": { "x": 400, "y": 200 },
            "properties": {
                "radius": 40,
                "mass": 300,
                "planetType": "planet_sun"
            }
        },
        {
            "type": "bonus",
            "position": { "x": 300, "y": 150 },
            "properties": {
                "value": 200,
                "orbit": {
                    "type": "circular",
                    "center": { "x": 400, "y": 200 },
                    "radius": 80,
                    "speed": 1.2
                }
            }
        },
        {
            "type": "bonus",
            "position": { "x": 350, "y": 350 },
            "properties": {
                "value": 400,
                "orbit": {
                    "type": "elliptical",
                    "center": { "x": 400, "y": 200 },
                    "semiMajorAxis": 150,
                    "semiMinorAxis": 80,
                    "speed": 0.7,
                    "rotation": 1.2
                }
            }
        },
        {
            "type": "bonus",
            "position": { "x": 200, "y": 400 },
            "properties": {
                "value": 500,
                "orbit": {
                    "type": "figure8",
                    "center": { "x": 400, "y": 200 },
                    "size": 100,
                    "speed": 0.6
                }
            }
        }
    ],
    "rules": {
        "requiredBonuses": 3,
        "scoreMultiplier": 1.5
    }
}
```

## Testing

Use `test_orbits.html` to visualize and test different orbit types:
- Circular orbits (original behavior)
- Elliptical orbits with rotation
- Figure-8 orbits (lemniscate)
- Mixed orbit combinations

The test page demonstrates the consolidated orbit system and shows how different orbit types can be combined to create complex level dynamics. 