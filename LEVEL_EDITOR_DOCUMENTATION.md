# Spaced Penguin Level Editor Documentation

## Table of Contents
1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Interface Components](#interface-components)
4. [Creating Objects](#creating-objects)
5. [Editing Objects](#editing-objects)
6. [Object Types and Properties](#object-types-and-properties)
7. [Visual Indicators](#visual-indicators)
8. [Export and Import](#export-and-import)
9. [Advanced Features](#advanced-features)
10. [Troubleshooting](#troubleshooting)
11. [Technical Implementation](#technical-implementation)

## Overview

The Spaced Penguin Level Editor is a comprehensive in-game tool that allows you to create, modify, and test custom levels directly within the browser. The editor provides a visual interface for placing game objects, editing their properties, and exporting complete level definitions.

### Key Features
- **Visual Object Placement**: Click and drag to position objects
- **Real-time Property Editing**: Modify object properties with instant visual feedback
- **Reflection-based System**: Automatically discovers all available game object types and properties
- **Comprehensive Export**: Generates complete JSON level definitions with full fidelity
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

1. **Create Objects**: Right-click in empty space to create new objects
2. **Select Objects**: Left-click on any object to select it (highlighted in green)
3. **Edit Properties**: Use the properties panel on the right to modify object settings
4. **Move Objects**: Drag selected objects to reposition them
5. **Test Level**: Press **E** to toggle between Edit and Play modes
6. **Export Level**: Use the console command `/export_level` to generate JSON

## Interface Components

### Console System
- **Activation**: Backtick key (`)
- **Commands**:
  - `/level_editor` - Start/stop the level editor
  - `/export_level` - Export current level as JSON
  - `/help` - Show available commands
- **Command History**: Use Up/Down arrow keys to navigate previous commands

### Properties Panel
Located on the right side of the screen when an object is selected:
- **Object Type**: Shows the selected object's class name
- **Position Controls**: X and Y coordinate inputs
- **Object-Specific Properties**: Dynamically generated based on object type
- **Real-time Updates**: Changes apply immediately as you type

### Visual Indicators
- **Green Selection Highlight**: Shows which object is currently selected
- **Orbit Center Dots**: Red dots indicate orbit centers for planets and bonuses
- **Arrow Target Lines**: Cyan lines show what PointingArrows are pointing at
- **Mode Indicator**: "EDIT MODE" or "PLAY MODE" text in top-right corner

### Object Creation Menu
Right-click context menu with available object types:
- Planet
- Bonus
- Target
- Slingshot
- TextObject
- PointingArrow

## Creating Objects

### Object Creation Process

1. **Right-click** in an empty area of the game canvas
2. **Select object type** from the context menu
3. **Object appears** at the click location with sensible defaults
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
- **Planet Sprite**: Visual appearance

**Available Sprites:**
- `planet_grey` - Default grey planet
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
- **Radius**: Hit detection size
- **Inner Radius**: Inner collision area
- **Ship Sprite**: Visual appearance

**Available Sprites:**
- `ship_open` - Open ship (default state)
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
- **Target X**: X coordinate of pointing target
- **Target Y**: Y coordinate of pointing target
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

## Export and Import

### Export Process

1. **Open Console**: Press backtick (`)
2. **Run Export**: Type `/export_level` and press Enter
3. **Copy JSON**: Complete level definition is logged to console
4. **Save File**: Copy the JSON to a `.json` file

### Export Format

The export system generates comprehensive JSON with full object fidelity:

```json
{
  "metadata": {
    "name": "Custom Level",
    "description": "Generated by Level Editor",
    "version": "1.0",
    "timestamp": "2024-01-01T12:00:00.000Z"
  },
  "penguinStartPosition": { "x": 100, "y": 300 },
  "targetPosition": { "x": 700, "y": 300 },
  "objects": [
    {
      "type": "Planet",
      "position": { "x": 400, "y": 300 },
      "properties": {
        "radius": 50,
        "mass": 1000,
        "gravitationalReach": 5000,
        "planetType": "planet_grey",
        "orbit": null
      }
    }
  ],
  "rules": {
    "maxTries": -1,
    "timeLimit": 0,
    "scoreMultiplier": 1.0
  }
}
```

### Greedy Export Features

The export system captures ALL objects and properties:

- **Complete Object Lists**: All planets, bonuses, targets, text objects, arrows
- **Full Property Extraction**: Every editable and non-editable property
- **Nested Properties**: Orbit systems, pointing targets, sprite types
- **Metadata**: Timestamps, versions, descriptions
- **Game State**: Penguin position, target location, rules

### Import Support

Generated JSON can be loaded using the game's level loading system:

1. **Save JSON**: Save exported data as `custom_level.json`
2. **Place in Levels**: Put file in the `levels/` directory
3. **Load in Game**: Use level loader to load the custom level

## Advanced Features

### Orbit System

Objects can orbit around specified center points with various patterns:

**Orbit Types:**
- **Circular**: Perfect circles at fixed radius
- **Elliptical**: Oval paths with major/minor axes
- **Figure-8**: Lemniscate patterns
- **Custom**: User-defined mathematical functions

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
- **Extensibility**: New object types automatically supported

### Real-time Sprite Management

Sprite changes apply immediately:

- **Dropdown Selection**: Choose from available sprites
- **Instant Updates**: Visual changes happen immediately
- **Fallback Handling**: Graceful degradation if sprites fail to load
- **Asset Validation**: Ensures sprites exist before applying

### Play Mode Testing

Test levels without leaving the editor:

1. **Toggle Mode**: Press **E** key to switch modes
2. **Play Mode**: Full game functionality active
3. **Edit Mode**: Return to editing with **E** key
4. **State Preservation**: Object positions and properties maintained

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

**Export Not Working:**
- Open browser developer tools to see console output
- Check for JavaScript errors during export
- Ensure all objects have valid properties

### Performance Considerations

**Large Levels:**
- Limit orbit objects to prevent performance issues
- Use simplified sprites for complex levels
- Test frequently in Play Mode

**Browser Compatibility:**
- Modern browsers recommended (Chrome, Firefox, Safari)
- Enable JavaScript and WebGL
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
- Object selection and manipulation
- Property panel generation
- Visual indicator rendering
- Export/import functionality

**Game Object Integration:**
- Reflection-based property discovery
- Real-time property updates
- Sprite management
- Coordinate system handling

### Extension Points

**Adding New Object Types:**
1. Create class in `gameObjects.js`
2. Add factory method in `levelLoader.js`
3. Properties automatically discovered by reflection

**Custom Property Types:**
1. Add handling in `createPropertyInput()`
2. Update `handlePropertyChange()`
3. Define validation in property maps

**New Visual Indicators:**
1. Add rendering in `renderVisualIndicators()`
2. Define indicator logic in object classes
3. Configure visibility toggles

### Performance Optimizations

- **Event Delegation**: Efficient mouse event handling
- **Selective Rendering**: Only updates changed elements
- **Property Caching**: Reduces reflection overhead
- **Batch Updates**: Groups related property changes

### Browser API Usage

- **Canvas 2D**: Object rendering and visual indicators
- **DOM Events**: Mouse and keyboard input handling
- **Reflection**: Dynamic property discovery
- **JSON**: Level export/import serialization
- **Local Storage**: Future save/load functionality

---

*This documentation covers the complete Spaced Penguin Level Editor system. For additional technical details, consult the source code comments and implementation files.*