// Main game engine for Spaced Penguin
// Based on the original game loop and GPS scripts

import { GameObject, Planet, Bonus, BonusPopup, Target, Slingshot, Arrow } from './gameObjects.js';
import { Penguin } from './penguin.js';
import { Physics } from './physics.js';
import Utils from './utils.js';
import { LevelLoader } from './levelLoader.js';

class Game {
    constructor(canvas, assetLoader) {
        console.log('Game constructor called');
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.physics = new Physics();
        this.assetLoader = assetLoader;
        
        // Game state
        this.state = 'menu'; // menu, playing, paused, gameOver, scoring
        this.level = 1;
        this.score = 0;
        this.distance = 0;
        this.tries = 0;
        this.highScore = 0;
        this.planetCollisions = 0; // Track planet collisions for rules
        
        // Level system
        this.levelLoader = new LevelLoader(assetLoader);
        this.levelRules = null;
        
        // Bounds system (matching original game's pFlightRect/pStageRect)
        this.flightBorder = 400; // Grace distance around canvas (original default was 100)
        this.stageRect = { x: 0, y: 0, width: canvas.width, height: canvas.height };
        this.flightRect = {
            x: -this.flightBorder,
            y: -this.flightBorder,
            width: canvas.width + (this.flightBorder * 4),
            height: canvas.height + (this.flightBorder * 4)
        };
        
        // Game objects
        this.penguin = null;
        this.slingshot = null;
        this.target = null;
        this.planets = [];
        this.bonuses = [];
        this.gameObjects = [];
        
        // Bonus popup system
        this.bonusPopup = new BonusPopup(0, 0, 0);
        this.gameObjects.push(this.bonusPopup);
        
        // Initialize arrow after stage rect is set up
        this.arrow = new Arrow(0, 0);
        this.arrow.setStageRect(this.stageRect);
        this.arrow.setFlightRect(this.flightRect);
        this.gameObjects.push(this.arrow);
        
        // Shot path tracing system (like original game)
        this.shotPaths = []; // Array of complete shot paths
        this.currentShotPath = []; // Current shot being recorded
        this.shotColors = [
            '#00FFFF', // Cyan (rgb(0, 255, 255))
            '#0000FF', // Blue (rgb(0, 0, 255))
            '#FF00FF', // Magenta (rgb(255, 0, 255))
            '#FF0000', // Red (rgb(255, 0, 0))
            '#FFFF00', // Yellow (rgb(255, 255, 0))
            '#00FF00', // Green (rgb(0, 255, 0))
            '#C8C8C8'  // Light Gray (rgb(200, 200, 200))
        ];
        this.currentColorIndex = 0;
        this.isRecordingPath = false;
        
        // Input handling
        this.mouseDown = false;
        this.mousePosition = { x: 0, y: 0 };
        this.isDragging = false;
        
        // Animation
        this.lastTime = 0;
        this.deltaTime = 0;
        
        // UI
        this.ui = {
            level: document.getElementById('level'),
            score: document.getElementById('score'),
            distance: document.getElementById('distance'),
            tries: document.getElementById('tries')
        };
        
        console.log('UI elements found:', this.ui);
        console.log('Asset loader available:', !!this.assetLoader);
        
        this.setupEventListeners();
        console.log('Game constructor completed');
        // Don't load level immediately - wait for start
        this.stars = [];
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        
        // Keyboard controls
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }
    
    getMousePosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
    
    handleMouseDown(e) {
        this.mouseDown = true;
        this.mousePosition = this.getMousePosition(e);
        
        if (this.state === 'playing' && this.penguin.state === 'idle') {
            this.isDragging = true;
            this.slingshot.startPull(this.mousePosition.x, this.mousePosition.y);
            this.penguin.setState('pullback');
        }
    }
    
    handleMouseMove(e) {
        this.mousePosition = this.getMousePosition(e);
        
        if (this.isDragging && this.slingshot.isPulling) {
            this.slingshot.updatePullback(this.mousePosition.x, this.mousePosition.y);
        }
    }
    
    handleMouseUp(e) {
        this.mouseDown = false;
        
        if (this.isDragging) {
            this.isDragging = false;
            const velocity = this.slingshot.release();
            this.launchPenguin(velocity);
        } else {
            // Mouse click during soaring triggers tryAgain (like original)
            if (this.state === 'playing' && this.penguin && this.penguin.state === 'soaring') {
                this.tryAgain();
            }
        }
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            this.handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            this.handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }
    
    handleTouchEnd(e) {
        e.preventDefault();
        this.handleMouseUp(e);
    }
    
    handleKeyDown(e) {
        switch (e.key.toLowerCase()) {
            case 'q':
                if (this.state === 'playing') {
                    this.showQuitDialog();
                }
                break;
            case 'r':
                if (this.state === 'playing') {
                    this.tryAgain();
                }
                break;
            case ' ':
                if (this.state === 'menu') {
                    this.startGame();
                }
                break;
            default:
                // Any other key during playing triggers tryAgain (like original)
                if (this.state === 'playing' && this.penguin && this.penguin.state === 'soaring') {
                    this.tryAgain();
                }
                break;
        }
    }
    
    launchPenguin(velocity) {
        console.log('Game launchPenguin called with velocity:', velocity);
        this.penguin.launch(velocity.x, velocity.y);
        this.penguin.setState('soaring');
        this.tries++;
        this.updateUI();
        
        // Clear physics trace
        this.physics.clearTrace();
        
        // Start recording shot path
        this.startRecordingShotPath();
    }
    
    // Shot path recording methods (matching original game behavior)
    startRecordingShotPath() {
        this.isRecordingPath = true;
        this.currentShotPath = [];
        console.log(`Started recording shot path ${this.shotPaths.length + 1} with color ${this.shotColors[this.currentColorIndex]}`);
    }
    
    recordPathPoint(x, y) {
        if (this.isRecordingPath) {
            this.currentShotPath.push({ x: x, y: y });
        }
    }
    
    endRecordingShotPath() {
        if (this.isRecordingPath && this.currentShotPath.length > 1) {
            // Store the complete path with its color
            const shotPath = {
                points: [...this.currentShotPath],
                color: this.shotColors[this.currentColorIndex],
                shotNumber: this.shotPaths.length + 1
            };
            
            this.shotPaths.push(shotPath);
            console.log(`Saved shot path ${shotPath.shotNumber} with ${shotPath.points.length} points in color ${shotPath.color}`);
            
            // Cycle to next color
            this.currentColorIndex = (this.currentColorIndex + 1) % this.shotColors.length;
        }
        
        this.isRecordingPath = false;
        this.currentShotPath = [];
    }
    
    clearAllShotPaths() {
        this.shotPaths = [];
        this.currentShotPath = [];
        this.currentColorIndex = 0;
        this.isRecordingPath = false;
        console.log('Cleared all shot paths');
    }
    
    drawAllShotPaths(ctx) {
        // Draw all completed shot paths
        for (const shotPath of this.shotPaths) {
            if (shotPath.points.length < 2) continue;
            
            ctx.save();
            ctx.strokeStyle = shotPath.color;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.9;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            ctx.moveTo(shotPath.points[0].x, shotPath.points[0].y);
            
            for (let i = 1; i < shotPath.points.length; i++) {
                ctx.lineTo(shotPath.points[i].x, shotPath.points[i].y);
            }
            
            ctx.stroke();
            ctx.restore();
        }
        
        // Draw current shot path being recorded (if any) with slightly different style
        if (this.isRecordingPath && this.currentShotPath.length > 1) {
            ctx.save();
            ctx.strokeStyle = this.shotColors[this.currentColorIndex];
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.7;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            ctx.moveTo(this.currentShotPath[0].x, this.currentShotPath[0].y);
            
            for (let i = 1; i < this.currentShotPath.length; i++) {
                ctx.lineTo(this.currentShotPath[i].x, this.currentShotPath[i].y);
            }
            
            ctx.stroke();
            ctx.restore();
        }
    }
    
    update(deltaTime) {
        this.deltaTime = deltaTime;
        
        // Update all game objects
        console.log('Game objects count:', this.gameObjects.length, 'types:', this.gameObjects.map(obj => obj.constructor.name));
        for (const obj of this.gameObjects) {
            if (obj.constructor.name === 'Arrow') {
                // Only update arrow if penguin exists and has position AND is soaring
                if (this.penguin && this.penguin.position && this.penguin.state === 'soaring') {
                    // console.log('Updating arrow with penguin at:', this.penguin.position, 'penguin state:', this.penguin.state);
                    obj.update(this.penguin);
                } else {
                    // console.log('Arrow update skipped - penguin:', !!this.penguin, 'position:', this.penguin?.position, 'state:', this.penguin?.state);
                    // Make sure arrow is hidden when penguin is not soaring
                    obj.visible = false;
                }
            } else {
                obj.update(deltaTime);
            }
        }
        
        // Update physics for penguin based on state
        if (this.penguin) {
            console.log('Game update - Penguin state:', this.penguin.state, 'Launched:', this.penguin.launched);
            if (this.penguin.state === 'soaring') {
                console.log('Calling updatePenguinPhysics');
                this.updatePenguinPhysics();
            } else if (this.penguin.state === 'crashed') {
                console.log('Calling updatePenguinCrashed');
                this.updatePenguinCrashed();
            } else if (this.penguin.state === 'hitTarget') {
                // Stop all movement when target is hit
                this.penguin.vx = 0;
                this.penguin.vy = 0;
                console.log('Penguin stopped - target hit');
            }
        }
        
        // Check for target collision
        if (this.penguin && this.penguin.state === 'soaring') {
            if (this.target.checkCollision(this.penguin)) {
                this.penguin.setState('hitTarget');
                this.endRecordingShotPath(); // End recording when target is hit
                
                // Call target's onHit method to open the ship
                this.target.onHit();
                
                // Move penguin off-screen like original game (point(1000, 1000))
                this.penguin.x = 1000;
                this.penguin.y = 1000;
                this.penguin.position = { x: 1000, y: 1000 };
                
                this.handleTargetHit();
            }
        }
        
        // Check for out of bounds
        if (this.penguin && this.penguin.state === 'soaring') {
            if (!this.isInBounds(this.penguin.position, this.flightRect)) {
                console.log('Penguin went out of bounds (flightRect) - setting crashed state');
                this.endRecordingShotPath(); // End recording when going out of bounds
                this.penguin.state = 'crashed';
                this.penguin.crashedFrameCount = 2; // Short countdown like original GPS script
            }
        }
        
        // Check level rules for failure conditions
        if (this.levelRules && this.state === 'playing') {
            const failureCheck = this.levelRules.checkFailureConditions(this);
            if (failureCheck.failed) {
                this.showMessage(failureCheck.reason);
                this.state = 'gameOver';
            }
        }
    }
    
    updatePenguinPhysics() {
        console.log('updatePenguinPhysics called');
        
        // Convert planets to the format expected by the new gravity system
        const planetData = this.planets.map(planet => ({
            x: planet.position.x,
            y: planet.position.y,
            mass: planet.mass,
            collisionRadius: planet.collisionRadius,
            gravitationalReach: planet.gravitationalReach || 5000
        }));
        
        // Debug: Log planet data being passed (simplified)
        console.log('Game passing', planetData.length, 'planets, GravConst:', this.physics.gravitationalConstant);
        
        // Check for planet collisions first (like original GPS script)
        for (const planet of planetData) {
            const changeLoc = { 
                x: this.penguin.x - planet.x, 
                y: this.penguin.y - planet.y 
            };
            const distance = Math.sqrt(changeLoc.x * changeLoc.x + changeLoc.y * changeLoc.y);
            
            if (distance < planet.collisionRadius) {
                console.log('Planet collision detected in physics update');
                this.penguin.crashIntoPlanet(planet);
                this.playSound('hitPlanet');
                
                // Register the collision for level rules
                this.registerPlanetCollision();
                
                return; // Exit physics update since penguin is now crashed
            }
        }
        
        // Use the new planet gravity system (matching old GPS script)
        this.penguin.updateWithPlanetGravity(planetData, this.physics.gravitationalConstant, this.deltaTime);
        
        // Record path point for shot tracing
        this.recordPathPoint(this.penguin.x, this.penguin.y);
        
        // Update distance
        if (this.penguin.trail.length > 1) {
            const lastPoint = this.penguin.trail[this.penguin.trail.length - 2];
            const currentPoint = this.penguin.trail[this.penguin.trail.length - 1];
            this.distance += Utils.distance(lastPoint, currentPoint);
        }
        
        // Check for bonus collection
        const collectedBonuses = this.physics.checkBonusCollection(this.penguin.position);
        for (const bonus of collectedBonuses) {
            this.collectBonus(bonus);
        }
        
        this.updateUI();
    }
    
    updatePenguinCrashed() {
        // Convert planets to the format expected by the new gravity system
        const planetData = this.planets.map(planet => ({
            x: planet.position.x,
            y: planet.position.y,
            mass: planet.mass,
            collisionRadius: planet.collisionRadius,
            gravitationalReach: planet.gravitationalReach || 5000
        }));
        
        // Update crashed state using new planet gravity system
        this.penguin.updateCrashed(this.deltaTime, planetData);
        
        // Record path point for shot tracing (even during crash)
        this.recordPathPoint(this.penguin.x, this.penguin.y);
        
        // Check if crashed state is complete (original game logic)
        if (this.penguin.crashedFrameCount < 1 || !this.isInBounds(this.penguin.position, this.stageRect)) {
            console.log('Crash ended - resetting penguin to slingshot');
            this.endRecordingShotPath(); // End recording when crash is complete
            this.resetPenguinToSlingshot();
        }
        
        this.updateUI();
    }
    
    isInBounds(position, bounds = this.stageRect) {
        return position.x >= bounds.x && position.x <= bounds.x + bounds.width &&
               position.y >= bounds.y && position.y <= bounds.y + bounds.height;
    }
    
    collectBonus(bonus) {
        console.log(`Game.collectBonus called with bonus value: ${bonus.value}, position:`, bonus.position);
        
        // Use the new collect method that returns the value
        const collectedValue = bonus.collect();
        
        if (collectedValue > 0) {
            this.score += collectedValue;
            this.playSound('bonus');
            
            // Show bonus popup at bonus location
            this.bonusPopup.show(collectedValue, bonus.position);
            
            this.updateUI();
        }
    }
    
    registerPlanetCollision() {
        this.planetCollisions++;
        console.log(`Planet collision ${this.planetCollisions} registered`);
    }
    
    handleTargetHit() {
        this.playSound('enterShip');
        
        // Stop the target's hit timer so ship stays closed during scoring
        if (this.target && this.target.isHit) {
            this.target.isHit = false;
            this.target.hitFrameCount = 0;
        }
        
        // Check custom victory conditions if rules exist
        if (this.levelRules) {
            const victoryCheck = this.levelRules.checkVictoryConditions(this);
            if (!victoryCheck.canProgress) {
                console.log('Victory conditions not met:', victoryCheck.reason);
                this.showMessage(victoryCheck.reason);
                this.penguin.setState('crashed');
                return;
            }
        }
        
        this.state = 'scoring';
        this.calculateFinalScore();
    }
    
    calculateFinalScore() {
        // Add distance bonus
        this.score += Math.floor(this.distance / 10);
        
        // Add completion bonus
        this.score += 1000;
        
        // Add efficiency bonus (fewer tries = more points)
        const efficiencyBonus = Math.max(0, 500 - (this.tries * 50));
        this.score += efficiencyBonus;
        
        // Apply score multiplier from level rules
        if (this.levelRules && this.levelRules.scoreMultiplier !== 1.0) {
            this.score = Math.floor(this.score * this.levelRules.scoreMultiplier);
        }
        
        this.updateUI();
        
        // Check for high score
        if (this.score > this.highScore) {
            this.highScore = this.score;
            this.saveHighScore();
        }
        
        setTimeout(() => {
            this.nextLevel();
        }, 2000);
    }
    
    nextLevel() {
        this.level++;
        this.loadLevel(this.level);
        this.state = 'playing';
    }
    
    resetLevel() {
        this.resetPenguin();
        this.resetBonuses();
        this.physics.clearTrace();
        this.clearAllShotPaths();
        this.arrow.visible = false; // Reset arrow visibility
        this.state = 'playing';
    }
    
    resetPenguin() {
        this.penguin.reset();
        this.resetPenguinToSlingshot();
        this.arrow.visible = false; // Reset arrow visibility
    }
    
    resetBonuses() {
        for (const bonus of this.bonuses) {
            bonus.reset(); // Use the new reset method
        }
        
        // Reset bonus popup
        if (this.bonusPopup) {
            this.bonusPopup.visible = false;
            this.bonusPopup.state = 'idle';
        }
    }
    
    loadLevel(level) {
        // Clear existing game state
        this.gameObjects = [];
        this.planets = [];
        this.bonuses = [];
        this.physics.clear();
        this.planetCollisions = 0;
        this.tries = 0;
        this.distance = 0;
        
        // Clear all shot path traces for new level
        this.clearAllShotPaths();
        
        // Load level through level loader first
        const result = this.levelLoader.loadLevel(level, this);
        
        // Add arrow AFTER level loader has finished (so it doesn't get cleared)
        this.arrow = new Arrow(0, 0);
        this.arrow.setStageRect(this.stageRect);
        this.arrow.setFlightRect(this.flightRect);
        this.gameObjects.push(this.arrow);
        
        // Re-add bonus popup system
        this.bonusPopup = new BonusPopup(0, 0, 0);
        this.gameObjects.push(this.bonusPopup);
        
        return result;
    }

    
    render() {
        // Clear canvas
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background stars
        this.drawStars();
        
        // Draw all shot paths (like original game)
        this.drawAllShotPaths(this.ctx);
        
        // Draw physics trace
        this.physics.drawTrace(this.ctx);
        
        // Sort game objects by render order (lower numbers = rendered first/underneath)
        const sortedObjects = [...this.gameObjects].sort((a, b) => {
            const orderA = a.renderOrder || 0;
            const orderB = b.renderOrder || 0;
            return orderA - orderB;
        });
        
        // Draw all game objects in render order
        for (const obj of sortedObjects) {
            if (obj.constructor.name === 'Arrow') {
                console.log('Drawing arrow object - visible:', obj.visible, 'position:', obj.position);
            }
            obj.draw(this.ctx);
        }
        
        // Draw UI overlays
        this.drawUI();
    }
    
    generateStars() {
        // Generate 100 random, spaced-out stars
        const numStars = 100;
        const minDist = 12; // Minimum distance between stars
        const maxTries = 20;
        this.stars = [];
        for (let i = 0; i < numStars; i++) {
            let tries = 0;
            let x, y, size;
            let ok = false;
            while (!ok && tries < maxTries) {
                x = Math.random() * this.canvas.width;
                y = Math.random() * this.canvas.height;
                size = 1 + Math.floor(Math.random() * 3);
                ok = true;
                for (const s of this.stars) {
                    const dx = s.x - x;
                    const dy = s.y - y;
                    if (Math.sqrt(dx*dx + dy*dy) < minDist) {
                        ok = false;
                        break;
                    }
                }
                tries++;
            }
            this.stars.push({ x, y, size });
        }
    }
    
    drawStars() {
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.globalAlpha = 0.5;
        for (const star of this.stars) {
            this.ctx.fillRect(star.x, star.y, star.size, star.size);
        }
        this.ctx.globalAlpha = 1.0;
    }
    
    drawUI() {
        // Draw shot path info (debugging/status display)
        if (this.state === 'playing') {
            this.ctx.save();
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'left';
            
            // Show recorded shot paths count
            this.ctx.fillText(`Shot Paths: ${this.shotPaths.length}`, 10, this.canvas.height - 60);
            
            // Show current recording status
            if (this.isRecordingPath) {
                this.ctx.fillStyle = this.shotColors[this.currentColorIndex];
                this.ctx.fillText(`Recording Path ${this.shotPaths.length + 1} (${this.currentShotPath.length} points)`, 10, this.canvas.height - 40);
            }
            
            this.ctx.restore();
        }
    }
    
    updateUI() {
        this.ui.level.textContent = this.level;
        this.ui.score.textContent = Utils.formatScore(this.score);
        this.ui.distance.textContent = Math.floor(this.distance);
        this.ui.tries.textContent = this.tries;
    }
    
    playSound(soundName) {
        // Enhanced sound system with fallback
        try {
            console.log(`Playing sound: ${soundName}`);
            // TODO: Implement actual sound loading and playback
            // For now, just log the sound that would be played
        } catch (error) {
            console.warn('Sound playback failed:', error);
        }
    }
    
    showQuitDialog() {
        if (confirm('Are you sure you want to quit?')) {
            this.state = 'menu';
        }
    }
    
    showMessage(message) {
        // Simple alert for now - could be enhanced with UI overlay
        alert(message);
    }
    
    startGame() {
        this.level = 1;
        this.score = 0;
        this.distance = 0;
        this.tries = 0;
        this.loadLevel(this.level);
        this.state = 'playing';
    }
    
    saveHighScore() {
        localStorage.setItem('spacedPenguinHighScore', this.highScore.toString());
    }
    
    loadHighScore() {
        const saved = localStorage.getItem('spacedPenguinHighScore');
        if (saved) {
            this.highScore = parseInt(saved);
        }
    }

    resetPenguinToSlingshot() {
        console.log('Resetting penguin to slingshot position');
        
        if (!this.penguin || !this.slingshot) {
            console.error('Cannot reset - penguin or slingshot not initialized');
            return;
        }
        
        // Reset penguin state and physics
        this.penguin.reset();
        
        // Position penguin at slingshot anchor with 30 pixel offset (like original)
        const slingshotAnchor = this.slingshot.anchor;
        console.log('Slingshot anchor position:', slingshotAnchor);
        
        const penguinPosition = Utils.findPoint(slingshotAnchor, this.slingshot.rotation || 0, 30);
        console.log('Calculated penguin position:', penguinPosition);
        
        this.penguin.x = penguinPosition.x;
        this.penguin.y = penguinPosition.y;
        this.penguin.position = { x: penguinPosition.x, y: penguinPosition.y };
        
        // Make slingshot visible again (equivalent to original's resetGPS)
        this.slingshot.visible = true;
        this.slingshot.isPulling = false;
        
        // Set penguin to idle state
        this.penguin.setState('idle');
        
        // Reset any physics state
        this.physics.clearTrace();
        
        console.log(`Penguin reset to position: ${this.penguin.x}, ${this.penguin.y}, state: ${this.penguin.state}`);
    }
    
    // Add tryAgain method (matching original GPS script)
    tryAgain() {
        console.log('tryAgain called - immediately resetting penguin');
        this.endRecordingShotPath();
        this.resetPenguinToSlingshot();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Game;
} 

export { Game }; 