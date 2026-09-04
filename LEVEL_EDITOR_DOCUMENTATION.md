# Spaced Penguin Level Editor Documentation

## Table of Contents
1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Interface Components](#interface-components)
4. [Creating Objects](#creating-objects)
5. [Editing Objects](#editing-objects)
6. [Object Types and Properties](#object-types-and-properties)
7. [Visual Indicators](#visual-indicators)
8. [Export and Persistence](#export-and-persistence)
9. [Advanced Features](#advanced-features)
10. [Troubleshooting](#troubleshooting)
11. [Technical Implementation](#technical-implementation)

## Overview

The Spaced Penguin Level Editor is an in-game tool for creating, modifying, previewing, saving, and exporting levels in the browser. A canonical `LevelDocument` owns authored JSON while the visible game objects are a disposable runtime projection. It provides in-session undo/redo for structural edits, canvas moves, object properties, and level settings. Saves are local to the current browser; file import and server-side persistence are not implemented.

### Key Features
- **Desktop Editing**: Mouse and keyboard editing through the centralized input router
- **Visual Object Placement**: Toolbar creation and drag-to-position
- **Real-time Property Editing**: Modify object properties with instant visual feedback
- **Mobile Toolbar**: Responsive add/select controls with Pointer Events for touch dragging and long-press actions
- **Property Discovery**: Discovers many editable properties, with explicit per-class handling for important fields
- **JSON Export**: Downloads a level definition for review and manual promotion into `levels/`
- **Local Save and Browse**: Stores editable drafts in browser storage and discovers them through a searchable, paginated level browser
- **Robust Object Management**: Advanced deletion system with automatic cleanup from all game systems
- **Sprite Selection**: Real-time sprite changing with dropdown menus for planets and targets
- **Play Mode Testing**: Switch between edit and play modes to test levels immediately
- **Editor-native Completion**: Completing a play-test stays in the editor, reports success in the toolbar, and unlocks publishing when a community server is configured
- **Publish Confirmation**: Publishing opens a compact form to confirm the public level name and description before upload
- **Visual Indicators**: Shows orbit centers, waypoint paths and handles, arrow targets, and selection highlights

## Getting Started

### Accessing the Level Editor

1. **Launch the Game**: Start Spaced Penguin in your browser
2. **Start Editor**: Choose **Level Editor** from the main menu. The `/level_editor` console command remains available for debugging.

The level editor will now be active, indicated by the green "EDIT MODE" text in the top-right corner.

### Basic Workflow

#### Desktop (Mouse)
1. **Create Objects**: Use an **Add Type** button in the editor toolbar
2. **Select Objects**: Left-click on any object to select it (highlighted in green)
3. **Edit Properties**: Use the properties panel on the right to modify object settings
4. **Move Objects**: Drag selected objects to reposition them
5. **Delete Objects**: Select object and press **Delete** key or use Delete button
6. **Change Sprites**: Use dropdown menus in properties panel for visual appearance

### Expanded playfields and camera

Select **Level Settings** to edit Playfield Width, Playfield Height, Gameplay Camera, and Follow Zoom. Changing either playfield dimension enables a fit camera for a legacy level and derives a natural loss boundary 200 world units beyond each playfield edge. Choose `fit` to show the complete level or `follow` for a smoothly tracking gameplay camera. `legacy` preserves the original fixed 800 x 600 framing.

The editor has an independent, non-exported camera:

- Mouse wheel zooms around the pointer.
- Hold Space and drag, or use the middle mouse button, to pan.
- Drag empty space on touch devices to pan.
- Press `F` to fit the complete playfield.
- Press `Home` to return to the slingshot.

The cyan border marks the playable stage, the amber dashed border marks the loss boundary, and the grid covers the authored playfield. Selecting an off-screen object from the object list reveals it automatically.
7. **Test Level**: Use the editor mode toggle button
8. **Open or Export**: Use **Open Level…** to open a saved level or editable copy, and **Export Level** to download JSON.

#### Mobile (Touch)
1. **Create Objects**: Use the **+** button in the mobile toolbar
2. **Select Objects**: Use the object list/toolbar or the canvas. A single Pointer Events input stream supports mouse, pen, touch-drag, right-click, and touch long-press.
3. **Edit Properties**: Use the properties panel (automatically repositioned for mobile screens)
4. **Move Objects**: Edit coordinates through the properties panel. Canvas touch-drag is not currently connected by the centralized input router.
5. **Delete Objects**: Select object and use the Delete button in the toolbar
6. **Clear Selection**: Use the **✕** button in the mobile toolbar
7. **Test Level**: Use the mode toggle button in the main toolbar
8. **Export Level**: Use the Export button in the main toolbar

## Interface Components

### Console System
- **Activation**: Backtick key (`)
- **Commands**:
  - `/level_editor` - Start/stop the level editor
  - `/export [filename]` - Download the current level as JSON
  - `/help` - Show available commands
- **Command History**: Use Up/Down arrow keys to navigate previous commands

### Properties Panel
Located on the right side of the screen when an object is selected:
- **Object Type**: Shows the selected object's class name
- **Position Controls**: X and Y coordinate inputs
- **Object-Specific Properties**: Dynamically generated based on object type
- **Sprite Selection**: Dropdown menus for visual appearance (planets, targets)
- **Real-time Updates**: Changes apply immediately as you type

### Visual Indicators
- **Green Selection Highlight**: Shows which object is currently selected
- **Orbit Center Dots**: Red dots indicate orbit centers for gravity bodies and bonuses
- **Arrow Target Lines**: Cyan lines show what PointingArrows are pointing at
- **Mode Indicator**: "EDIT MODE" or "PLAY MODE" text in top-right corner

### Object Creation Controls
The desktop add-button row and mobile **+** menu expose these types:
- Planet
- BlackHole
- RepulsorStar
- Bonus
- Target
- Slingshot
- TextObject
- PointingArrow
- Portal (creates a complete red/blue pair)
- SpeedBooster
- DeflectorBumper

## Creating Objects

### Object Creation Process

1. **Choose an object type** from the add-button row or mobile **+** menu
2. **Object appears** at its type-specific default position
3. **Drag or edit coordinates** to place it
4. **Automatically selected** for immediate property editing

### Default Properties by Object Type

| Object Type | Default Properties |
|-------------|-------------------|
| **Planet** | 50px radius, 1000 mass, planet_grey sprite |
| **BlackHole** | Planet-style radius/mass/reach, zero collision |
| **RepulsorStar** | 30px radius, 100 repulsion strength, 5000 reach, zero collision |
| **Bonus** | 100 point value, default rotation |
| **Target** | 60x60 size, ship_open sprite |
| **Slingshot** | Standard stretch limit and velocity |
| **TextObject** | "Sample Text", 16px font, left-aligned |
| **PointingArrow** | Cyan color, 20px base width |
| **Portal** | Reciprocal red/blue pair, opposing default directions, woosh enabled |
| **SpeedBooster** | 64x32 panel, direction 0°, speed multiplier 1 |
| **DeflectorBumper** | 30px radius, speed-preserving restitution 1, magenta glow |

Portal endpoints can be dragged and rotated independently. Selecting either endpoint shows a thin dashed line to its partner and a direction indicator. Adding, deleting, undoing, redoing, or cloning a portal operates on the complete pair so exported levels cannot be left with an orphan endpoint. The inspector exposes aperture size, direction, and the optional teleport woosh.

Deflector bumpers expose radius, bounce multiplier (`restitution`), color, sound, and waypoint motion. A value of `1` preserves Kevin's speed; smaller values damp the bounce and larger values accelerate it.

## Editing Objects

### Selection and Movement

- **Click to Select**: Left-click any object to select it
- **Drag to Move**: Click and drag selected objects to new positions; drag numbered waypoint handles to reshape fixed paths
- **Coordinate Precision**: Use property panel for exact positioning

### Object Deletion

- **Delete Key**: Select object and press **Delete** key
- **Delete Button**: Use the red "Delete Selected" button in the toolbar
- **Robust Cleanup**: Automatic removal from all game systems and arrays
- **Safe Operation**: Handles physics cleanup and special object references

### Property Editing

All property changes apply in real-time:

1. **Select Object**: Click on the object you want to edit
2. **Locate Property**: Find the property in the properties panel
3. **Modify Value**: Change the value using appropriate input type
4. **See Changes**: Visual updates happen immediately

### Input Types

- **Number Fields**: Numeric values with optional min/max ranges
- **Text Fields**: String values for content and labels
- **Color Pickers**: Visual color selection for object colors
- **Dropdowns**: Predefined options (sprites, alignment, etc.)
- **Checkboxes**: Boolean true/false values

## Object Types and Properties

### Planet
Gravitational bodies that affect penguin movement.

**Core Properties:**
- **Position**: X, Y coordinates
- **Radius**: Visual and collision size (1+ pixels)
- **Mass**: Gravitational strength (the editor control uses 1+; manually authored validated JSON may use `0` to disable gravity)
- **Collision Radius**: Collision detection size
- **Gravitational Reach**: Maximum influence distance. Omitted, null, or zero values normalize to the legacy default `5000`; set mass to zero for no gravity.
- **Color**: Fallback rendering color
- **Planet Sprite**: Visual appearance (dropdown selection)

**Available Sprites:**
- `planet_grey` - Default grey planet (sensible default)
- `planet_pink` - Pink planet
- `planet_red_gumball` - Red textured planet
- `planet_saturn` - Saturn with rings
- `planet_sun` - Sun appearance

**Orbit Properties** (when orbiting is enabled):
- **Orbit Center X/Y**: Center point of orbital motion
- **Orbit Radius**: Distance from center
- **Orbit Speed**: Rotation speed (positive/negative for direction)
- **Orbit Type**: circular, elliptical, figure8, gravity, custom

### BlackHole
Gravity-only bodies with an ominous animated event-horizon/accretion visual. They share planet gravity and orbit behavior but never collide with Kevin.

**Core Properties:**
- **Position**: X, Y coordinates
- **Radius**: Visual event-horizon size
- **Mass**: Gravitational strength; `0` disables gravity
- **Gravitational Reach**: Maximum influence distance
- **Collision**: Always disabled; collision radius remains `0`

Black holes can be cloned, exported/imported as `blackhole`, and selected by Gravity Sculpt because they participate in the shared gravity-body collection.

### RepulsorStar
Bright, non-colliding force sources that push Kevin away from their center. Their pulsing white core and outward-flicking particles are visual only.

**Core Properties:**
- **Position**: X, Y coordinates
- **Radius**: Visual star size
- **Repulsion Strength**: Non-negative magnitude of the outward force
- **Repulsion Reach**: Maximum influence distance; omitted or zero uses `5000`
- **Collision**: Always disabled; collision radius remains `0`

Repulsor stars can be cloned, orbited, waypoint-animated, and exported/imported as `repulsorstar`. Gravity Sculpt currently leaves them locked because its adjustable mass search is defined only for attractive gravity bodies.

### Bonus
Collectible items that add to the player's score.

**Core Properties:**
- **Position**: X, Y coordinates
- **Value**: Points awarded when collected (1+ points)
- **Rotation Speed**: Spin rate in degrees per frame
- **State**: Current collection state (notHit/Hit)

**Orbit Properties**: Same as Planet

**Visual Behavior:**
- Rotates continuously at specified speed
- Pulses with alpha transparency
- Changes to "hit" sprite when collected
- Automatically resets between attempts

### Target
The destination object that the penguin must reach to complete the level.

**Core Properties:**
- **Position**: X, Y coordinates
- **Width**: Target width in pixels
- **Height**: Target height in pixels
- **Ship Sprite**: Visual appearance (dropdown selection)

**Available Sprites:**
- `ship_open` - Open ship (sensible default)
- `ship_closed` - Closed ship (hit state)

**Behavior:**
- Closes when penguin enters
- Remains closed while the delayed scoring transition is pending
- Triggers the scoring screen after the game-level delay

### Slingshot
The launching mechanism for the penguin.

**Core Properties:**
- **Position**: X, Y coordinates (anchor point)
- **Width/Height**: Visual/editor dimensions

**Advanced Properties:**
- **Max Pullback**: Maximum pullback distance
- **Velocity Multiplier**: Launch power scaling

**Usage:**
- Only one slingshot per level
- Defines penguin starting position
- Controls launch mechanics

### TextObject
Displays formatted text with HTML-like styling.

**Core Properties:**
- **Position**: X, Y coordinates
- **Text Content**: HTML-formatted text content
- **Font Size**: Text size in pixels (8-72)
- **Color**: Text color
- **Font Family**: Font family name
- **Text Align**: left, center, right
- **Background Color**: Background fill color
- **Visible**: Show/hide the text

**HTML Support:**
- Basic HTML tags: `<b>`, `<font>`, `<br>`
- Color attributes: `<font color="#FF0000">`
- Size attributes: `<font size="4">`
- Line breaks: `<br>` or `<br/>`

**Example Content:**
```html
<font color="#FFFF00" size="6"><b>Level 1</b></font><br>
Collect all bonuses to proceed!
```

### PointingArrow
Animated arrows that point to specific locations.

**Core Properties:**
- **Position**: X, Y coordinates (arrow base)
- **Target X**: X coordinate of pointing target (real-time updates)
- **Target Y**: Y coordinate of pointing target (real-time updates)
- **Color**: Arrow fill color
- **Glow Color**: Shadow/glow effect color
- **Base Width**: Arrow width in pixels (10+)
- **Scale with Distance**: Auto-resize based on target distance
- **Visible**: Show/hide the arrow

**Visual Effects:**
- Pulsing alpha animation
- Dynamic scaling based on distance
- Automatic rotation toward target
- Glow shadow effects

## Visual Indicators

### Selection Highlighting
- **Green Outline**: Selected objects show bright green border
- **Persistent Selection**: Remains until another object is selected
- **Multi-object**: Only one object can be selected at a time

### Orbit Centers
- **Red Dots**: Show the center point of orbital motion
- **Visible When**: Object has active orbit system
- **Size**: 8px diameter circles
- **Color**: Bright red (#FF0000)

### Arrow Targets
- **Cyan Lines**: Show what PointingArrows are targeting
- **Dynamic**: Updates as target coordinates change
- **Visibility**: Only shown for visible arrows with valid targets

### Mode Indicators
- **"EDIT MODE"**: Green text in top-right when editor is active
- **"PLAY MODE"**: Yellow text when testing level
- **Font**: Bold 16px Arial
- **Position**: Fixed top-right corner

## Export and Persistence

### Export Process

1. **Export**: Click the editor Export button, or open the console and run `/export [filename]`.
2. **Download**: The browser creates and downloads a JSON file.
3. **Review**: Inspect authored positions, IDs, orbit relationships, rules, and any state changed during play preview.
4. **Promote manually**: Rename/copy the reviewed file to `levels/levelN.json`, then reload the game over HTTP.

### Opening and browsing levels

The level browser uses visible source tabs for **Official**, **My Levels**, and, when configured, **Community** levels. From the main menu it offers Play and Edit-a-Copy actions. From inside the editor, **Open Level…** offers Open for owned local saves and Open a Copy for immutable sources. Replacing a changed editor document requires Save & Open, Discard, or Cancel.

### Export Format

The exporter generates JSON accepted by the level loader, subject to the round-trip caveats below:

```json
{
  "name": "Custom Level 1",
  "description": "Generated by Level Editor",
  "startPosition": { "x": 100, "y": 300 },
  "targetPosition": { "x": 700, "y": 300 },
  "objects": [
    {
      "type": "planet",
      "position": { "x": 400, "y": 300 },
      "properties": {
        "radius": 50,
        "mass": 1000,
        "gravitationalReach": 5000,
        "planetType": "planet_grey",
        "orbit": {
          "orbitCenter": { "x": 300, "y": 200 },
          "orbitTargetId": null,
          "orbitRadius": 120,
          "orbitSpeed": 0.8,
          "orbitAngle": 0,
          "orbitType": "circular",
          "orbitParams": {}
        }
      }
    },
    {
      "type": "target",
      "position": { "x": 700, "y": 300 },
      "properties": {
        "width": 60,
        "height": 60,
        "spriteType": "ship_open"
      }
    }
  ],
  "rules": {
    "maxTries": null,
    "timeLimit": null,
    "scoreMultiplier": 1.0,
    "gravitationalConstant": 3,
    "requiredBonuses": null,
    "allowedMisses": null
  }
}
```

### Export Coverage and Caveats

Editor save, export, Play, and publishing clone the canonical `LevelDocument`; simulated or preview runtime state is never gathered back into the authored definition. `Game.exportCurrentLevel()` remains a separate gameplay/debug export and is not the editor synchronization path.

- **Authorable Object Lists**: Planets, bonuses, target, slingshot, text objects, and pointing arrows are gathered; runtime-only Penguin, off-screen Arrow, and BonusPopup objects are excluded.
- **Proper Structure**: Objects nested under `properties` matching game format
- **Position Objects**: Coordinates as `{x, y}` objects, not flat properties
- **Sprite Fields**: Known planet and target sprite type fields are included; export does not validate the referenced asset
- **Orbit Systems**: Authored orbital parameters and centers are serialized from `LevelDocument`; preview and Play simulation state is excluded.
- **Runtime State**: Play can change the disposable projection, but returning to Edit rebuilds from the unchanged authored document.
- **Runtime Export Caveat**: `Game.exportCurrentLevel()` can still omit or normalize runtime-only details and must not be substituted for `LevelDocument.toDefinition()` in editor code.
- **Relationships**: IDs must be unique; clones receive a new ID while retaining valid authored relationship fields.
- **Singletons**: Validation rejects multiple target or slingshot definitions; the runtime model supports one of each.

### Import and Save Status

There is no file picker, arbitrary-path loader, server save, or autosave. Save stores or updates an editable record in browser storage, including a thumbnail; Export remains the explicit JSON download path for review and manual promotion. Browse opens the asynchronous local catalog, which supports search, bounded cursor pages, details, Play, and capability-controlled Edit. The catalog boundary separates card summaries from playable definitions and can accept future cloud sources without changing the browser UI. The built-in loader separately fetches the 25 default files `levels/level01.json` through `levels/level25.json` during startup; named collections are selected with URLs such as `?level=manual:N` or `?level=challenge:N`. Undo/redo applies to add, delete, clone, canvas movement, orbit-center movement, waypoint-handle movement, centering, object-property edits, and level-setting edits during the current editor session. Continuous input events from one focused field are coalesced into one undo step.

## Advanced Features

### Orbit System

Objects can orbit around specified center points with various patterns:

**Orbit Types:**
- **Circular**: Perfect circles at fixed radius
- **Elliptical**: Oval paths with major/minor axes
- **Figure-8**: Lemniscate patterns
- **Gravity**: Numerically integrated orbit with initial velocity and strength
- **Custom**: Programmatic functions only; JSON custom configuration falls back to circular

**Configuration:**
1. Select a planet, bonus, or target object
2. Set orbit center coordinates
3. Choose orbit radius and speed
4. Select orbit type from dropdown
5. Observe real-time orbital motion

Orbit target options come from the shared schema capabilities. Planet, black-hole, and bonus IDs can be lookup targets; the shared validator still runs before export and Play.

### Gravity Sculpt Execution

Gravity Sculpt draws an intended route and searches launch angle/power plus
selected stationary-planet positions and masses. In browsers with WebAssembly
and module-worker support, the solve runs outside the rendering thread and
sends complete optimizer populations to one persistent Rust evaluator at the
minimum budget or a bounded evaluator pool for larger searches. This
keeps pointer input and canvas rendering responsive and avoids one Wasm call
per simulated frame. The worker sends full trajectory points only for the
candidate set shown in the editor. Waypoint-only candidates stop when they
complete the ordered route; curriculum phases retain their stage populations,
and nearby-launch robustness is concentrated in the closing full-route joint
generations. Stagnant stages can finish before exhausting their allocation.
Experimental influence guidance remains available to diagnostics but is
disabled by default because the multi-seed benchmark does not show a quality
benefit.
Closing Gravity Sculpt or starting a replacement solve cancels the active
worker immediately.

If WebAssembly initialization fails, a selected variable uses a custom apply
function, or the level contains an orbit/waypoint-controlled simulation object,
the solver uses its deterministic JavaScript evaluator. Results expose an
`evaluationBackend` diagnostic (`wasm` or `javascript`). Run
`npm.cmd run benchmark:gravity-sculpt-browser` from the repository root to
compare the production worker pool with JavaScript on the current machine. The
single-evaluator diagnostic remains available as
`npm.cmd run benchmark:gravity-sculpt-wasm`.

### Schema-Generated Properties

Generated object contracts describe the supported controls and capabilities for each canonical level type; `gameObjectRegistry.js` composes them with handwritten construction and exceptional behavior:

- **Declarative Controls**: Text, number, nullable number, select, color, checkbox, and action controls are built from descriptors
- **Capabilities**: Create, clone, delete, orbit-source/target, singleton, runtime registration, and context actions are data-driven
- **Input Constraints**: Property controls apply configured min/max ranges and options; save, export, Play, and publish run editor invariants and shared validation
- **Extensibility**: New types require object-schema generation, handwritten runtime hooks, semantic validation, documentation, and—when gameplay-relevant—simulation-schema/wire and JavaScript/Wasm parity coverage

### Real-time Sprite Management

Sprite changes apply immediately with proper defaults:

- **Dropdown Selection**: Choose from available sprites in properties panel
- **Sensible Defaults**: New objects start with appropriate sprites, not fallbacks
- **Instant Updates**: Visual changes happen immediately without page refresh
- **Proper Integration**: Uses object refreshSprite() methods for clean updates
- **Asset Selection**: Uses fixed sprite options; export does not validate asset files

### Play Mode Testing

Test levels without leaving the editor:

1. **Toggle Mode**: Use the editor mode button
2. **Play Mode**: The editor validates and clones the current document into a fresh runtime world with full game functionality
3. **Edit Mode**: Use the same button to return to editing
4. **State Preservation**: The simulated world is discarded and rebuilt from the unchanged document; selection survives by ID when the object still exists
5. **Publishing Proof**: Completion records the exact cloned definition that was play-tested, so later authored changes require another completion

## Troubleshooting

### Common Issues

**Objects Not Selectable:**
- Ensure you're in Edit Mode (green text visible)
- Try clicking closer to object center
- Check if object is behind another object

**Properties Not Updating:**
- Verify object is selected (green highlight)
- Check for JavaScript errors in browser console
- Ensure property values are within valid ranges

**Sprites Not Loading:**
- Check browser network tab for loading errors
- Verify sprite files exist in assets directory
- Try refreshing the page to reload assets

**Deleted Objects Still in Export:**
- This should no longer occur with the robust deletion system
- If it happens, check console for deletion log messages
- Try deleting and re-creating the object

**Export Not Working:**
- Open browser developer tools to see console output
- Check for JavaScript errors during export
- Ensure all objects have valid properties

**Sprite Dropdowns Empty:**
- Verify assets are loaded before opening level editor
- Check that manifest.json contains sprite definitions
- Ensure asset loading completed successfully

### Performance Considerations

**Large Levels:**
- Limit orbit objects to prevent performance issues
- Use simplified sprites for complex levels
- Test frequently in Play Mode

**Browser Compatibility:**
- Modern browsers recommended (Chrome, Firefox, Safari)
- Enable JavaScript and Canvas 2D
- Ensure adequate system memory

### Debug Information

The level editor provides extensive console logging:

- **Object Creation**: Logs when objects are created
- **Property Changes**: Shows property updates
- **Sprite Loading**: Reports sprite loading success/failure
- **Export Process**: Detailed export operation logging

## Technical Implementation

### Architecture Overview

The level editor is built using a modular architecture:

```
js/
├── console.js          # Console interface and command handling
├── levelEditor.js      # Compatibility facade and editor composition
├── levelEditor/
│   ├── commands/       # Command bus and semantic command strategies
│   ├── controllers/    # Canvas, tools, runtime preview, and Gravity Sculpt coordination
│   ├── services/       # Document mutation/projection, object identity, and orbit preview
│   ├── state/          # LevelDocument, editor state, selection, and domain events
│   └── views/          # Inspector, toolbar, lists, overlays, prompts, and DOM helpers
├── views/              # Shared game screens, dialogs, leaderboards, and thumbnail rendering
├── config/             # Frozen product policy plus app/runtime configuration access
├── editorCommands/     # ID-based commands, live transactions, and command history
├── runtime/entities/gameObjects.js # Shared drawable runtime classes
├── runtime/gameObjectRegistry.js   # Generated-contract composition and handwritten behavior hooks
├── levelLoader.js      # Level loading and registry-dispatching object factory
└── game.js             # Game engine integration
```

### Key Components

**Console System (`console.js`):**
- Command parsing and execution
- History management
- UI overlay rendering

**Level Editor (`levelEditor.js`):**
- Delegates ID-based selection and exclusive pointer interaction to editor services
- Coordinates focused inspector, object-list, toolbar, canvas-input, and overlay components
- Exposes the editor composition API while authored state remains in `LevelDocument`
- Reads canonical document JSON for save, download/export, play, and publish

**Editor Ownership (`levelEditor/`):**
- `EditorState` owns lifecycle, mode, camera, primary tool, and one pointer-owned discriminated interaction
- `EditorSelection` stores `none`, `level-settings`, or an object ID and resolves rebuilt runtime mirrors
- `EditorObjectService` discovers editable runtime mirrors and centrally allocates individual/group IDs and display names
- `EditorToolManager` handles selection, object/orbit dragging, Space or middle-button pan, touch threshold/long press, and Gravity Sculpt waypoint capture
- `LevelDocument` preserves authored ordering, indexes records by ID, applies patches, and supplies revision/fingerprint state
- `DocumentMutationService` transforms cloned JSON definitions for properties, positions, level settings, orbit authoring, object actions, and Gravity Sculpt batches
- `documentProjectionTransaction` validates before projection and restores the prior document/runtime pair on any projection failure
- `EditorRuntimeProjector` is the only edit-mode runtime writer; it incrementally replaces changed mirrors and uses existing loader, factory, mutator, and physics paths for structural projection
- `OrbitPreviewService` derives visualization-only orbit positions without mutating authored or runtime objects
- `EditorEvents` exposes only selection, document, mode, history, and tool signals
- `PublishMetadataPromptView` owns publish confirmation DOM, focus, validation, cancellation, and inert background state

**Editor Commands (`editorCommands/`):**
- A compatibility-named `LiveEditCommand` contract whose implementations mutate authored documents, never runtime object references
- Type-keyed, stable-ID strategies carrying serializable document snapshots for structural, movement, object-property, and level-setting changes
- `EditorCommandBus` execution, undo/redo, failure rollback, and begin/update/commit/cancel live transactions
- Per-focus coalescing for continuous inspector input and one history entry per canvas drag

**Game Object Registry:**
- Creates canonical authored definitions before any runtime projection
- Composes generated schema contracts with complete JSON-to-runtime construction functions
- Reads defaults, collections, singleton ownership, capabilities, inspector fields, and serialization metadata from generated contracts
- Owns handwritten authoring, clone, exceptional validation/normalization, and transient property behavior
- Keeps portal pair creation/cloning and type-specific post-edit refresh logic outside `LevelEditor`

### Extension Points

**Adding New Object Types:**
1. Create the runtime class in `gameObjects.js` (or its focused module)
2. Define its canonical type, properties/defaults, capabilities, membership, inspector fields, and serialization metadata in `domain/gameObjects.schema.json`
3. Run `npm run generate:domain`, then register handwritten authoring/runtime factories and clone/property hooks in `gameObjectRegistry.js`
4. Add semantic validation and editor/runtime round-trip coverage
5. For gameplay objects, extend `domain/simulation.schema.json`, including state/events and an encoded or explicitly excluded entry for every reachable binary-wire field; then rebuild and test the shared Wasm core

**Custom Property Types:**
1. Add handling in `createPropertyInput()`
2. Update `handlePropertyChange()`
3. Define editor input constraints in property maps
4. If the property is persisted gameplay data, also update shared level validation and loader/export handling

**New Visual Indicators:**
1. Add rendering in `renderVisualIndicators()`
2. Define indicator logic in object classes
3. Configure visibility toggles

### Performance Characteristics

- Input listeners are activated according to game/editor state through the centralized input router; editable controls remain above the editor context.
- Tools and views issue commands rather than mutating authored state or `Game` collections.
- Structural projection updates all known runtime collections and invalidates render ordering.
- Dirty state compares the document's canonical fingerprint, so undoing to saved content becomes clean.

### Browser API Usage

- **Canvas 2D**: Object rendering and visual indicators
- **DOM Events**: Mouse and keyboard input handling
- **Reflection**: Dynamic property discovery
- **JSON**: Level download/export serialization
- **Blob/Object URL**: Browser file download

---

*This documentation covers the complete Spaced Penguin Level Editor system. For additional technical details, consult the source code comments and implementation files.*
