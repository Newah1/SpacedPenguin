# Spaced Penguin - HTML5 Remake

A modern HTML5/JavaScript remake of the classic Shockwave game "Spaced Penguin". This is a gravity-based slingshot game where players launch a penguin through gravitational fields to collect bonuses and land in targets.

## 🎮 Game Features

- **Gravitational Physics**: Realistic physics simulation with planets exerting gravitational pull
- **Slingshot Mechanics**: Click and drag to pull back, release to launch
- **Bonus Collection**: Collect floating bonus items for points
- **Level Progression**: Increasingly complex levels with multiple planets
- **Trajectory Tracing**: Visual trail showing the penguin's path
- **High Score System**: Local storage for high scores
- **Mobile Support**: Touch controls for mobile devices

## 🚀 How to Run

1. **Simple Setup**: Just open `index.html` in a modern web browser
   - No build process required
   - No dependencies to install
   - Works offline

2. **Local Server** (Recommended for development):
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Using Python 2
   python -m SimpleHTTPServer 8000
   
   # Using Node.js (if you have it installed)
   npx http-server
   ```
   Then open `http://localhost:8000` in your browser

## 🎯 How to Play

1. **Launch**: Press SPACE to start the game
2. **Aim**: Click and drag the penguin to pull back the slingshot
3. **Fire**: Release to launch the penguin
4. **Collect**: Gather bonus items for points
5. **Land**: Try to land in the green target
6. **Retry**: Press R to reset the level if needed

## 🎨 Controls

- **Mouse/Touch**: Click and drag to pull slingshot
- **SPACE**: Start game from menu
- **R**: Reset current level
- **Q**: Quit to menu (during gameplay)

## 🏗️ Project Structure

```
SpacedPenguinRewrite/
├── index.html              # Main HTML file
├── js/
│   ├── utils.js           # Utility functions and math helpers
│   ├── physics.js         # Gravitational physics system
│   ├── gameObjects.js     # Game entities (Penguin, Planet, Bonus, etc.)
│   ├── game.js            # Main game engine
│   └── main.js            # Entry point and game loop
├── OldSource/             # Original Shockwave files (decompiled)
└── SpacedPenguin_Documentation.md  # Detailed game analysis
```

## 🔧 Technical Details

### Physics System
- **Gravitational Force**: F = G * mass / distance²
- **Collision Detection**: Circle-based collision with bounce mechanics
- **Velocity Integration**: Smooth movement with delta time
- **Trace System**: Visual trajectory tracking

### Game Objects
- **Penguin**: Main character with animation and physics
- **Planet**: Gravitational bodies with configurable mass and reach
- **Bonus**: Collectible items with point values
- **Target**: Landing zone for level completion
- **Slingshot**: Launch mechanism with rubber band visualization

### Browser Compatibility
- **Modern Browsers**: Chrome, Firefox, Safari, Edge
- **Mobile**: iOS Safari, Chrome Mobile
- **Canvas API**: Required for rendering
- **Local Storage**: Used for high scores

## 🎮 Game Mechanics

### Scoring System
- **Distance Points**: Points based on total distance traveled
- **Bonus Collection**: Additional points from collecting items
- **Level Completion**: Bonus for successful target landing
- **Efficiency Bonus**: Higher scores for fewer attempts

### Level Progression
- **Level 1**: Simple single planet scenario
- **Level 2**: Two planets with more complex gravity
- **Random Levels**: Procedurally generated for higher levels

### Physics Parameters
- **Gravitational Constant**: 0.9 (configurable)
- **Planet Mass**: 0-1000 (affects gravitational strength)
- **Gravitational Reach**: 0-200 pixels (0 = infinite)
- **Collision Radius**: Planet radius + 8 pixels

## 🔍 Development Notes

This is a faithful recreation of the original Shockwave game, with the following improvements:

- **Modern Web Standards**: HTML5 Canvas instead of Shockwave
- **Responsive Design**: Works on desktop and mobile
- **Better Performance**: Optimized JavaScript physics
- **Enhanced Graphics**: Smooth animations and visual effects
- **Local Storage**: Persistent high scores

## 📚 Original Game Analysis

The original game was developed for Macromedia Shockwave and used Lingo scripting. The decompiled source files are available in the `OldSource/` directory for reference.

Key original features preserved:
- Gravitational physics system
- Slingshot launch mechanics
- Bonus collection system
- Level progression
- Scoring algorithm
- Game state management

## 🚧 Future Enhancements

Potential improvements for future versions:
- **Sound Effects**: Audio feedback for actions
- **Particle Effects**: Visual enhancements for collisions
- **More Levels**: Additional hand-crafted levels
- **Power-ups**: Special abilities and items
- **Multiplayer**: Online leaderboards
- **Level Editor**: Create custom levels

## 📄 License

This project is a recreation of the original "Spaced Penguin" game. The original game concept and mechanics belong to their respective owners.

## 🤝 Contributing

Feel free to submit issues, feature requests, or pull requests to improve the game!

---

**Enjoy playing Spaced Penguin!** 🐧🚀 