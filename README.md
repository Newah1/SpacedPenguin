# Spaced Penguin HTML5 Rewrite

A browser-runnable 1:1 port of the classic Shockwave game "Spaced Penguin" into HTML5 Canvas with JavaScript.

## Overview

Spaced Penguin is a gravity slingshot game where players drag a penguin in a slingshot and attempt to collect special items for high scores while landing the penguin in the target. The game features obstacles and planets with gravitational pull that add challenge and strategic depth.

## Features

- **Physics-based Gameplay**: Realistic gravity simulation with planetary gravitational fields
- **Progressive Difficulty**: Multiple levels with increasing complexity
- **Bonus Collection System**: Collect bonuses for extra points
- **Audio System**: Sound effects and background music (when implemented)
- **Level Editor Support**: JSON-based level definitions
- **Tutorial System**: Interactive text and arrows for player guidance

## New Level Text and Arrow System

The game now supports interactive text objects and pointing arrows that can be placed in levels for tutorials and guidance.

### Text Objects

Text objects display HTML-formatted instructional content at specific positions:

```json
{
    "type": "text",
    "position": { "x": 100, "y": 100 },
    "properties": {
        "content": "<font color=\"#FFFFCC\">Click on Kevin and hold your mouse down.</font>",
        "width": 280,
        "fadeIn": true,
        "fadeInDuration": 2.0,
        "textAlign": "left",
        "showAfterDelay": 3.0
    }
}
```

**Properties:**
- `content`: HTML-formatted text content (supports `<font>`, `<b>`, `<br>`, etc.)
- `width/height`: Text box dimensions (auto-sized if not specified)
- `textAlign`: "left", "center", or "right"
- `fontSize`: Font size in pixels
- `color`: Text color (can also be set via HTML `<font color="">`)
- `backgroundColor`: Background color (default: semi-transparent black)
- `fadeIn`: Whether to fade in when shown
- `fadeInDuration`: Fade-in duration in seconds
- `showAfterDelay`: Delay before showing text (in seconds)
- `visible`: Initial visibility

### Pointing Arrows

Pointing arrows can point to specific locations and provide visual guidance:

```json
{
    "type": "arrow",
    "position": { "x": 80, "y": 250 },
    "properties": {
        "pointTo": { "x": 100, "y": 300 },
        "color": "#00FFFF",
        "scaleWithDistance": true,
        "pointAfterDelay": 4.0
    }
}
```

**Properties:**
- `pointTo`: Target position `{x, y}` to point at
- `color`: Arrow color (default: bright cyan)
- `glowColor`: Glow effect color
- `scaleWithDistance`: Whether arrow scales with distance to target
- `baseWidth/minWidth/maxWidth`: Arrow size controls
- `pulseSpeed`: Pulsing animation speed
- `pointAfterDelay`: Delay before arrow appears (in seconds)

### Usage in Level Files

Add text objects and arrows to any level definition:

```json
{
    "name": "Tutorial Level",
    "objects": [
        {
            "type": "text",
            "position": { "x": 200, "y": 50 },
            "properties": {
                "content": "<font color=\"#00FF00\"><b>Welcome!</b></font><br>Use the slingshot to launch Kevin.",
                "textAlign": "center",
                "fadeIn": true
            }
        },
        {
            "type": "arrow", 
            "position": { "x": 150, "y": 300 },
            "properties": {
                "pointTo": { "x": 700, "y": 300 },
                "color": "#FF0000"
            }
        }
    ]
}
```

## File Structure

```
SpacedPenguinRewrite/
├── js/
│   ├── main.js              # Entry point and game loop
│   ├── game.js              # Main game engine
│   ├── gameObjects.js       # Game object classes (including TextObject and PointingArrow)
│   ├── penguin.js           # Penguin character logic
│   ├── physics.js           # Physics simulation
│   ├── levelLoader.js       # Level loading and object factory
│   ├── assetLoader.js       # Asset management
│   ├── audioManager.js      # Audio system
│   └── utils.js             # Utility functions
├── assets/                  # Game assets (sprites, audio, etc.)
├── levels/                  # JSON level definitions
├── OldSource/               # Original decompiled source for reference
└── index.html               # Main game page
```

## Development

To run the game locally:

1. Start a local web server: `python -m http.server 8000`
2. Open `http://localhost:8000` in your browser
3. Click "Start Game" to begin

## Original Game Reference

The original source files have been decompiled and are available in the `OldSource` folder. These provide reference for game mechanics, asset mapping, and behavioral scripts.

See `SpacedPenguin_Documentation.md` for detailed information about the original game structure and implementation notes. 