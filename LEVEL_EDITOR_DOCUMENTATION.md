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

The Spaced Penguin Level Editor is an in-game tool for creating, modifying, previewing, and exporting levels in the browser. It edits the live game object graph; it is not a separate document model and does not currently provide import, save, undo, or redo persistence.

### Key Features
- **Desktop Editing**: Mouse and keyboard editing through the centralized input router
- **Visual Object Placement**: Toolbar creation and drag-to-position
- **Real-time Property Editing**: Modify object properties with instant visual feedback
- **Mobile Toolbar**: Responsive add/select controls; canvas long-press/touch editing is currently not connected by `InputActionManager`
- **Property Discovery**: Discovers many editable properties, with explicit per-class handling for important fields
- **JSON Export**: Downloads a level definition for review and manual promotion into `levels/`
- **Robust Object Management**: Advanced deletion system with automatic cleanup from all game systems
- **Sprite Selection**: Real-time sprite changing with dropdown menus for planets and targets
- **Play Mode Testing**: Switch between edit and play modes to test levels immediately
- **Visual Indicators**: Shows orbit centers, arrow targets, and selection highlights

## Getting Started

### Accessing the Level Editor

1. **Launch the Game**: Start Spaced Penguin in your browser
2. **Open Console**: Press the **backtick key (`)** to open the game console
3. **Start Editor**: Type `/level_editor` and press Enter
4. **Close Console**: Press backtick again to close the console

The level editor will now be active, indicated by the green "EDIT MODE" text in the top-right corner.

### Basic Workflow

#### Desktop (Mouse)
1. **Create Objects**: Use an **Add Type** button in the editor toolbar
2. **Select Objects**: Left-click on any object to select it (highlighted in green)
3. **Edit Properties**: Use the properties panel on the right to modify object settings
4. **Move Objects**: Drag selected objects to reposition them
5. **Delete Objects**: Select object and press **Delete** key or use Delete button
6. **Change Sprites**: Use dropdown menus in properties panel for visual appearance
7. **Test Level**: Use the editor mode toggle button
8. **Export Level**: Use the Export button or console command `/export [filename]`

#### Mobile (Touch)
1. **Create Objects**: Use the **+** button in the mobile toolbar
2. **Select Objects**: Use the object list/toolbar. Canvas long-press and touch-drag methods exist in `LevelEditor`, but the current centralized editor action does not register touch listeners.
3. **Edit Properties**: Use the properties panel (automatically repositioned for mobile screens)
4. **Move Objects**: Tap and drag selected objects to reposition them (larger touch targets on mobile)
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
- **Orbit Center Dots**: Red dots indicate orbit centers for planets and bonuses
- **Arrow Target Lines**: Cyan lines show what PointingArrows are pointing at
- **Mode Indicator**: "EDIT MODE" or "PLAY MODE" text in top-right corner

### Object Creation Controls
The desktop add-button row and mobile **+** menu expose these types:
- Planet
- Bonus
- Target
- Slingshot
- TextObject
- PointingArrow

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
| **Bonus** | 100 point value, default rotation |
| **Target** | 60x60 size, ship_open sprite |
| **Slingshot** | Standard stretch limit and velocity |
| **TextObject** | "Sample Text", 16px font, left-aligned |
| **PointingArrow** | Cyan color, 20px base width |

## Editing Objects

### Selection and Movement

- **Click to Select**: Left-click any object to select it
- **Drag to Move**: Click and drag selected objects to new positions
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
- **Mass**: Gravitational strength (1+ units)
- **Collision Radius**: Collision detection size
- **Gravitational Reach**: Maximum influence distance (0 = infinite)
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
- **Orbit Type**: circular, elliptical, figure8, custom

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
- Reopens after brief delay
- Triggers level completion

### Slingshot
The launching mechanism for the penguin.

**Core Properties:**
- **Position**: X, Y coordinates (anchor point)
- **Angle**: Orientation in degrees (0-360)

**Advanced Properties:**
- **Stretch Limit**: Maximum pullback distance
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
          "center": { "x": 300, "y": 200 },
          "radius": 120,
          "speed": 0.8
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
    "scoreMultiplier": 1.0
  }
}
```

### Export Coverage and Caveats

The export system gathers current live objects and writes the primary level envelope. It is not a lossless authored-state codec:

- **Complete Object Lists**: All planets, bonuses, targets, text objects, arrows
- **Proper Structure**: Objects nested under `properties` matching game format
- **Position Objects**: Coordinates as `{x, y}` objects, not flat properties
- **Sprite Information**: Complete sprite type data for visual fidelity
- **Orbit Systems**: Full orbital motion parameters and center points
- **Runtime State**: A play preview can change positions, states, orbit angles, and gravity-orbit velocity before export
- **Asymmetry**: Some exported fields are not restored by `GameObjectFactory`
- **Relationships**: IDs must be unique; cloned hierarchical orbits can lose their target ID
- **Singletons**: Loading preserves only the first lowercase target and slingshot definition

### Import and Save Status

There is no file picker, arbitrary-path loader, server save, autosave, local-storage save, undo, or redo implementation. The built-in loader only fetches numbered files `levels/level1.json` through `levels/level19.json` during startup. The editor's save/undo/redo methods are placeholders even though keyboard bindings call them.

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
1. Select planet or bonus object
2. Set orbit center coordinates
3. Choose orbit radius and speed
4. Select orbit type from dropdown
5. Observe real-time orbital motion

### Reflection-Based Properties

The editor automatically discovers object properties using JavaScript reflection:

- **Dynamic Discovery**: Finds all enumerable properties
- **Type Detection**: Determines appropriate input types
- **Validation**: Respects min/max ranges and options
- **Extensibility**: New object types require coordinated factory, editor, collection, serialization, and loader changes

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
2. **Play Mode**: Full game functionality active
3. **Edit Mode**: Use the same button to return to editing
4. **State Preservation**: The same live objects are retained, including simulation mutations; there is no authored-state snapshot

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
├── levelEditor.js      # Main editor logic and UI
├── gameObjects.js      # Game object classes and properties
├── levelLoader.js      # Level loading and object factory
└── game.js            # Game engine integration
```

### Key Components

**Console System (`console.js`):**
- Command parsing and execution
- History management
- UI overlay rendering

**Level Editor (`levelEditor.js`):**
- Object selection and manipulation with robust deletion system
- Dynamic property panel generation with sprite selection
- Visual indicator rendering (orbits, arrows, selection)
- JSON download/export with manual review and promotion workflow

**Game Object Integration:**
- Reflection-based property discovery with special handling for nested properties
- Real-time property updates with immediate visual feedback
- Advanced sprite management with dropdown selection and defaults
- Coordinate system handling for both position.x/y and direct x/y properties

### Extension Points

**Adding New Object Types:**
1. Create class in `gameObjects.js`
2. Add factory method in `levelLoader.js`
3. Add editor defaults/property controls, runtime collection registration, clone serialization, and export/loader support

**Custom Property Types:**
1. Add handling in `createPropertyInput()`
2. Update `handlePropertyChange()`
3. Define validation in property maps

**New Visual Indicators:**
1. Add rendering in `renderVisualIndicators()`
2. Define indicator logic in object classes
3. Configure visibility toggles

### Performance Optimizations

- **Event Delegation**: Efficient mouse event handling with mode-aware routing
- **Selective Rendering**: Only updates changed elements and visual indicators
- **Property Caching**: Reduces reflection overhead in property discovery
- **Batch Updates**: Groups related property changes for smooth performance
- **Robust Cleanup**: Efficient object deletion with comprehensive array management

### Browser API Usage

- **Canvas 2D**: Object rendering and visual indicators
- **DOM Events**: Mouse and keyboard input handling
- **Reflection**: Dynamic property discovery
- **JSON**: Level download/export serialization
- **Blob/Object URL**: Browser file download

---

*This documentation covers the complete Spaced Penguin Level Editor system. For additional technical details, consult the source code comments and implementation files.*
