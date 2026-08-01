# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Spaced Penguin** is a 1:1 HTML5/JavaScript port of a classic Shockwave gravity-based slingshot game. Players launch a penguin character through gravitational fields created by planets, collecting bonuses and landing in targets.

## Development Commands

### Running the Game
```bash
# Start a local web server
python -m http.server 8000
# Then open http://localhost:8000 in browser
```

### Testing Components
- `test_audio.html` - Audio system testing
- `test_bonus.html` - Bonus collection mechanics
- `test_orbits.html` - Orbital mechanics visualization
- `test_planets.html` - Planet physics testing  
- `test_text_arrows.html` - Text/arrow system testing

**Note:** No build system, linting, or testing framework is currently configured. The project runs directly in the browser with ES6 modules.

## Architecture Overview

### Core Architecture Pattern
The game follows a **modular ES6 class-based architecture** with these key systems:

1. **Game Engine** (`js/game.js`) - Central game state and loop management
2. **Physics System** (`js/physics.js`) - Gravitational calculations and collision detection
3. **Asset Management** (`js/assetLoader.js` + `js/audioManager.js`) - Loading and caching of visual/audio assets
4. **Level System** (`js/levelLoader.js` + `levels/*.json`) - Dynamic level loading with JSON definitions
5. **Game Objects** (`js/gameObjects.js`) - Polymorphic game entities (planets, bonuses, etc.)

### Entry Point Flow
```
main.js → AssetLoader → Game → LevelLoader → GameObjects
```

**Key Flow:**
1. `main.js` initializes `AssetLoader` and loads assets
2. Once loaded, creates `Game` instance with canvas and assets
3. `Game` creates `LevelLoader` and loads first level
4. `LevelLoader` parses JSON and creates game objects via factory pattern
5. Game loop runs physics updates and rendering

### Physics Architecture
- **Centralized Physics** (`Physics` class) handles all gravitational calculations
- **Component-based Objects** each have `update()` and `render()` methods
- **State-based Penguin** follows original game's state machine (idle, pullback, soaring, etc.)

### Asset System Architecture
- **Manifest-driven Loading** (`assets/manifest.json`) defines all assets
- **Multi-format Support** - SVG sprites, WAV audio, PNG images
- **Fallback Rendering** - programmatic drawing if SVG loading fails
- **Web Audio API** - modern audio with volume control and mixing

## Key Architectural Decisions

### Original Game Fidelity
The codebase prioritizes **exact behavioral replication** of the original Shockwave game:
- Physics constants match original values (`GRAVITATIONAL_CONSTANT = 3.0`)
- Object behaviors preserve original state machines and timing
- Asset loading recreates original sprites from decompiled sources

### Level System Design
- **JSON-based Levels** allow for easy level creation without code changes
- **Factory Pattern** (`GameObjectFactory`) creates objects from JSON definitions
- **Extensible Rules** system supports custom gameplay modifiers per level
- **Advanced Orbit System** supports circular, elliptical, and figure-8 orbits

### Modern Web Standards
- **ES6 Modules** for clean dependency management
- **Canvas 2D API** for rendering (no WebGL complexity)
- **Web Audio API** for sound (with graceful degradation)
- **Responsive Design** with fixed 800x600 game canvas

## Critical Implementation Details

### Physics Integration Points
- All objects register with `Physics` class for gravitational calculations
- Planet collision detection uses separate collision and gravitational radii
- Penguin trajectory updates occur in `updatePenguinPhysics()` in `game.js:429`

### State Management
- Game state tracked in `Game.state` (menu, playing, paused, gameOver, scoring)
- Penguin state tracked in `Penguin.state` (idle, pullback, snapping, soaring, crashed, hitTarget)
- Bonus collection uses state-based logic (`notHit` vs `Hit` states)

### Asset Loading Dependencies
- Game cannot start until `AssetLoader.loadAssets()` completes
- Audio system requires user interaction for autoplay policy compliance  
- SVG sprites converted to canvas textures for rendering performance

### Level Rules System
The `rules` section in level JSON supports:
- `maxTries`, `timeLimit`, `scoreMultiplier` 
- `requiredBonuses`, `allowedMisses`
- Custom `gravitationalConstant` per level

## Original Source Integration

The `OldSource/` directory contains decompiled Shockwave source files that inform the implementation:
- **Lingo Scripts** (`.ls` files) provide original behavior logic
- **Asset Chunks** (`chunks/*.json`) contain original asset metadata
- **Documentation files** explain original game mechanics

## Common Development Patterns

### Adding New Game Objects
1. Extend `GameObject` class in `gameObjects.js`
2. Add factory case in `GameObjectFactory.createObject()`
3. Update level JSON schema documentation
4. Create test page if complex behavior

### Modifying Physics
- All physics constants defined in `globalConstants.js`
- Gravitational calculations centralized in `Physics.updateGravity()`
- Collision detection in `Physics.checkCollisions()`

### Adding Audio
1. Add files to `assets/audio/` directory
2. Update `assets/manifest.json` 
3. Use `audioManager.playSound(name)` for playback
4. Test with `test_audio.html`

## Project Structure Context

```
js/
├── main.js              # Entry point and game initialization
├── game.js              # Core game engine and state management  
├── gameObjects.js       # All game entity classes
├── penguin.js           # Penguin character with state machine
├── physics.js           # Gravitational physics and collisions
├── levelLoader.js       # JSON level parsing and object factory
├── assetLoader.js       # Asset management and loading
├── audioManager.js      # Web Audio API integration
├── utils.js             # Mathematical and utility functions
└── globalConstants.js   # Game physics constants

assets/
├── manifest.json        # Asset loading configuration
├── audio/              # Sound effects (WAV format)
├── sprites/            # Game sprites (SVG/PNG format)
├── planets/            # Planet sprites
└── animations/         # Sprite sheet animations

levels/
├── README.md           # Level system documentation
└── *.json              # Level definitions

OldSource/              # Original decompiled Shockwave source
```

This modular architecture enables easy modification of individual systems while maintaining the original game's behavior and feel.