# Spaced Penguin - Game Documentation

## Overview

**Spaced Penguin** is a gravity-based slingshot game originally developed for Macromedia Shockwave. The game features a penguin character that players launch using a slingshot mechanism, with the goal of collecting bonus items while navigating through gravitational fields created by planets and obstacles.

## Game Mechanics

### Core Gameplay
- **Slingshot Launch**: Players drag the penguin back in a slingshot and release to launch
- **Gravitational Physics**: Realistic physics simulation with planets exerting gravitational pull
- **Bonus Collection**: Floating bonus items can be collected for points
- **Target Landing**: Ultimate goal is to land the penguin in a target area
- **Multiple Attempts**: Players can retry levels if they fail

### Physics System
- **Gravitational Constant**: `gGravitationalConstant = 0.9` (configurable)
- **Planet Gravity**: Each planet has mass and gravitational reach properties
- **Collision Detection**: Planets have collision radius and gravitational influence radius
- **Bounce Mechanics**: Penguins bounce off planets when they collide
- **Trajectory Tracing**: Optional visual trail showing the penguin's path

### Game States
The penguin can be in several states:
1. **Idle**: Waiting for player input
2. **Pullback**: Player is dragging the slingshot
3. **Snapping**: Slingshot is being released
4. **Soaring**: Penguin is in flight
5. **Crashed**: Penguin has hit a planet and is bouncing
6. **HitTarget**: Successfully landed in target
7. **Scoring**: Calculating final score

## Game Objects

### Penguin (GPS - Gravity Physics System)
- **Sprite Properties**: Main character with animation frames
- **Physics Properties**: Velocity (VX, VY), position tracking
- **Animation**: Rotating animation during flight
- **Collision**: Detects planet impacts and target hits

### Planets
- **Mass**: Determines gravitational strength (0-1000)
- **Gravitational Reach**: How far gravity extends beyond planet radius (0-200 pixels, 0 = infinite)
- **Collision Radius**: Physical collision boundary
- **Visual**: Circular sprites with varying sizes

### Bonus Items
- **Value**: Point value (0-10000)
- **Rotation**: Spinning animation
- **Collection**: Disappears when touched by penguin
- **Sound**: Plays collection sound effect

### Orbiting Objects
- **Multiple Suns**: Can orbit around 1-3 gravitational bodies
- **Gravity Factor**: Modifies gravitational effect
- **Initial Velocity**: Starting VX/VY values
- **Alternative Mass**: Can use different mass values

## Level System

### Level Progression
- Levels are stored in frame-based progression
- Each level has different planet configurations
- Score and distance tracking per level
- High score system with online leaderboards

### Level Elements
- **Planets**: Static gravitational bodies
- **Bonus Items**: Collectible point items
- **Target**: Landing zone for completion
- **Obstacles**: Various barriers and challenges

## Scoring System

### Points Calculation
- **Distance Traveled**: Points based on total distance covered
- **Bonus Collection**: Additional points from collecting items
- **Level Completion**: Bonus for successful target landing
- **Efficiency**: Higher scores for fewer attempts

### High Score Features
- **Online Leaderboards**: HTTP POST to `http://www.bigideafun.com/cgi/high_scores.pl`
- **Score Encoding**: Custom encoding algorithm for score validation
- **Daily/All-Time**: Separate tracking for daily and all-time highs
- **Name Validation**: Only letters allowed in player names

## Technical Architecture

### Script Organization

#### Main Movie Script
- **Global Variables**: Game state, scores, constants
- **Initialization**: Setup game parameters and sprites
- **Utility Functions**: Math helpers, string processing
- **Network Functions**: High score submission and retrieval

#### Behavior Scripts
1. **GPS (Gravity Physics System)**: Main penguin controller
2. **Planet**: Planet physics and collision
3. **Orbiting**: Objects that orbit around planets
4. **Bonus**: Collectible item behavior
5. **Game Looping**: Main game loop and input handling
6. **Scoring**: Score calculation and display
7. **UI Elements**: Various interface components

### Physics Implementation
- **Vector Math**: Point calculations, distance, angle rotation
- **Gravitational Force**: F = G * mass / distance²
- **Velocity Integration**: Position updates based on velocity
- **Collision Response**: Bounce calculations with energy conservation

### Asset Management
- **Cast Members**: Sprites, sounds, and graphics
- **Chunk Files**: Binary asset data with JSON metadata
- **Animation**: Frame-based sprite animations
- **Sound Effects**: Impact, collection, and UI sounds

## User Interface

### Game Elements
- **Slingshot**: Visual rubber band with stretch limits
- **Direction Arrow**: Shows penguin location when off-screen
- **Score Display**: Real-time score and distance tracking
- **Level Indicator**: Current level number
- **Attempt Counter**: Number of tries per level

### Menu System
- **Alert Dialogs**: Quit confirmation, scoring display
- **High Score Entry**: Name input with validation
- **Level Selection**: Frame-based navigation
- **Settings**: Trace toggle, sound controls

## Audio System

### Sound Effects
- **Planet Impact**: `snd_HitPlanet`
- **Bonus Collection**: `snd_bonus`
- **Target Landing**: `snd_enterShip`
- **UI Sounds**: Various interface feedback

## Network Features

### High Score System
- **Server**: `http://www.bigideafun.com/cgi/high_scores.pl`
- **Game ID**: "spaced_penguin"
- **Data Format**: Pipe-separated key-value pairs
- **Error Handling**: Network error detection and display

### Score Validation
- **Encoding Algorithm**: Custom hex-based encoding
- **Name Processing**: Character validation and trimming
- **Cheat Prevention**: Score verification system

## File Structure

### Original Shockwave Files
- **spaced_penguin.dcr**: Main Shockwave file
- **spaced_penguin.dir**: Director project file
- **sw.cab**: Cabinet file with assets

### Decompiled Structure
- **casts/scripts/**: Lingo script files (.ls and .lasm)
- **casts/Internal/**: Internal cast member scripts
- **chunks/**: Binary asset data with JSON metadata

## Conversion Considerations

### Modern Implementation
- **Canvas/WebGL**: Replace Shockwave rendering
- **JavaScript Physics**: Reimplement gravitational calculations
- **Asset Conversion**: Convert sprites and sounds to web formats
- **Input Handling**: Mouse/touch controls for slingshot
- **Audio**: Web Audio API for sound effects
- **Storage**: Local storage for high scores

### Key Algorithms to Port
1. **Gravitational Force Calculation**
2. **Collision Detection and Response**
3. **Trajectory Tracing**
4. **Score Encoding/Decoding**
5. **Animation Frame Management**

### Performance Considerations
- **60 FPS Physics**: Smooth gravitational simulation
- **Efficient Collision**: Optimized planet collision detection
- **Memory Management**: Asset loading and cleanup
- **Mobile Optimization**: Touch controls and responsive design

## Game Balance

### Difficulty Progression
- **Early Levels**: Simple single-planet scenarios
- **Mid Levels**: Multiple planets with complex gravity
- **Advanced Levels**: Orbiting objects and tight landing zones

### Scoring Balance
- **Distance vs. Efficiency**: Trade-off between distance and attempts
- **Bonus Placement**: Strategic positioning of collectibles
- **Risk vs. Reward**: Dangerous paths for higher scores

This documentation provides a comprehensive overview of the Spaced Penguin game mechanics, technical architecture, and conversion requirements for creating a modern HTML5/JavaScript version. 