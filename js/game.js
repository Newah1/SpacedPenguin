// Main game engine for Spaced Penguin
// Based on the original game loop and GPS scripts

import { GameObject, Planet, Bonus, BonusPopup, Target, Slingshot, Arrow, TextObject, PointingArrow } from './gameObjects.js';
import { Penguin } from './penguin.js';
import { Physics } from './physics.js';
import Utils from './utils.js';
import { LevelLoader } from './levelLoader.js';
import { UIManager } from './uiManager.js';
import { LevelEndScreen } from './levelEndScreen.js';
import Console from './console.js';
import LevelEditor from './levelEditor.js';
import FullscreenManager from './fullscreenManager.js';
import plog from './penguinLogger.js';

const GameState = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'gameOver',
    SCORING: 'scoring',
    LEVEL_EDITOR: 'levelEditor'
};

class Game {
    constructor(canvas, assetLoader, audioManager) {
        plog.info('Game constructor called');
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.physics = new Physics();
        this.assetLoader = assetLoader;
        this.audioManager = audioManager;
        
        // Canvas scaling for responsive design
        this.canvasScaleX = 1;
        this.canvasScaleY = 1;
        
        // UI Manager for menus and overlays
        this.uiManager = new UIManager(canvas, audioManager);
        
        // Game state
        this.state = GameState.MENU;
        this.level = 1;
        this.score = 0;
        this.currentAttemptScore = 0; // Track score for current attempt only
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
        this.textObjects = [];
        this.pointingArrows = [];
        this.gameObjects = [];
        
        // Bonus popup system
        this.bonusPopup = new BonusPopup(0, 0, 0);
        this.gameObjects.push(this.bonusPopup);
        
        // Initialize arrow after stage rect is set up
        this.arrow = new Arrow(0, 0);
        this.arrow.setStageRect(this.stageRect);
        this.arrow.setFlightRect(this.flightRect);
        this.gameObjects.push(this.arrow);
        
        // Initialize console and level editor
        this.console = new Console(this);
        this.levelEditor = new LevelEditor(this);
        
        // Initialize fullscreen manager
        this.fullscreenManager = new FullscreenManager(canvas, canvas.parentElement);
        
        // Pass ALL class references to level editor for object creation
        this.levelEditor.gameObjectClasses = {
            Planet,
            Bonus,
            BonusPopup,
            Target,
            Arrow,
            Slingshot,
            TextObject,
            PointingArrow
        };
        
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
        
        // Alpha mask system (matching original game's k1, k2, k3 sprites)
        this.alphaMasks = []; // Array of last 3 launch positions with alpha masks
        this.alphaMaskImage = null; // The Kev_Alph alpha mask image
        this.loadAlphaMask();
        
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
        
        plog.debug('UI elements found:', this.ui);
        plog.debug('Asset loader available:', !!this.assetLoader);
        
        // Note: Input handling now managed by InputActionManager
        plog.success('Game constructor completed');
        // Don't load level immediately - wait for start
        this.stars = [];
    }
    
    setState(newState) {
        if (this.state !== newState) {
            plog.info(`Game state changing from ${this.state} to ${newState}`);
            this.state = newState;
            
            // Notify InputActionManager of state change if available
            if (window.gameManager?.inputActionManager) {
                window.gameManager.inputActionManager.updateActiveActions();
            }
        }
    }
    
    // Input handling methods - called by InputActionManager
    // These methods are kept for backwards compatibility but input routing
    // is now handled by the InputActionManager system
    
    setupEventListeners() {
        // This method is now deprecated - input handling managed by InputActionManager
        console.warn('Game.setupEventListeners() is deprecated - input now managed by InputActionManager');
        
        // Still set touch action for mobile compatibility
        this.canvas.style.touchAction = 'none';
        
        // Add mobile-specific controls
        this.setupMobileControls();
    }
    
    setupMobileControls() {
        // Create mobile control buttons if on mobile
        if (this.isMobileDevice()) {
            this.createMobileControlButtons();
        }
    }
    
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (window.innerWidth <= 768 && window.innerHeight <= 1024);
    }
    
    createMobileControlButtons() {
        // Remove existing buttons if any
        const existingButtons = document.querySelectorAll('.mobile-control-button, .mobile-ui-overlay');
        existingButtons.forEach(btn => btn.remove());
        
        // Create mobile UI overlay container
        this.mobileUIOverlay = document.createElement('div');
        this.mobileUIOverlay.className = 'mobile-ui-overlay';
        this.mobileUIOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 150;
            font-family: Arial, sans-serif;
        `;
        
        // Create mobile control panel
        const controlPanel = document.createElement('div');
        controlPanel.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            pointer-events: auto;
        `;
        
        // Create reset button
        const resetButton = document.createElement('button');
        resetButton.className = 'mobile-control-button';
        resetButton.textContent = '↻ TRY AGAIN';
        resetButton.style.cssText = `
            background: rgba(255, 100, 100, 0.9);
            color: white;
            border: none;
            padding: 12px 16px;
            border-radius: 25px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            touch-action: manipulation;
            min-height: 44px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            backdrop-filter: blur(10px);
        `;
        
        resetButton.addEventListener('click', () => {
            if (this.state === GameState.PLAYING || (this.state === GameState.LEVEL_EDITOR && this.levelEditor.mode === 'play')) {
                this.tryAgain();
                // Haptic feedback
                if ('vibrate' in navigator) {
                    navigator.vibrate(50);
                }
            }
        });
        
        // Create quit button
        const quitButton = document.createElement('button');
        quitButton.className = 'mobile-control-button';
        quitButton.textContent = '✕ QUIT';
        quitButton.style.cssText = `
            background: rgba(128, 128, 128, 0.9);
            color: white;
            border: none;
            padding: 12px 16px;
            border-radius: 25px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            touch-action: manipulation;
            min-height: 44px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            backdrop-filter: blur(10px);
        `;
        
        quitButton.addEventListener('click', () => {
            if (this.state === GameState.PLAYING || (this.state === GameState.LEVEL_EDITOR && this.levelEditor.mode === 'play')) {
                this.showQuitDialog();
            }
        });
        
        controlPanel.appendChild(resetButton);
        controlPanel.appendChild(quitButton);
        
        // Create mobile instruction overlay
        this.mobileInstructions = document.createElement('div');
        this.mobileInstructions.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            font-size: 14px;
            text-align: center;
            pointer-events: none;
            max-width: 90%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            backdrop-filter: blur(10px);
            transition: opacity 0.3s ease;
        `;
        
        // Create launch visual feedback
        this.createLaunchFeedback();
        
        this.mobileUIOverlay.appendChild(controlPanel);
        this.mobileUIOverlay.appendChild(this.mobileInstructions);
        document.body.appendChild(this.mobileUIOverlay);
        
        // Update instructions based on current state
        this.updateMobileInstructions();
        
        // Auto-hide instructions after 5 seconds
        setTimeout(() => {
            if (this.mobileInstructions) {
                this.mobileInstructions.style.opacity = '0.6';
            }
        }, 5000);
    }
    
    createLaunchFeedback() {
        // Create visual feedback for slingshot aiming
        this.launchIndicator = document.createElement('div');
        this.launchIndicator.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 100px;
            height: 100px;
            border: 3px solid rgba(0, 255, 255, 0.8);
            border-radius: 50%;
            pointer-events: none;
            opacity: 0;
            transition: all 0.2s ease;
            box-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
        `;
        
        this.mobileUIOverlay.appendChild(this.launchIndicator);
    }
    
    updateMobileInstructions() {
        if (!this.mobileInstructions || !this.isMobileDevice()) return;
        
        let instructionText = '';
        
        switch (this.state) {
            case GameState.MENU:
                instructionText = '👆 Tap anywhere to start';
                break;
            case GameState.PLAYING:
                if (this.penguin && this.penguin.state === 'idle') {
                    instructionText = '🎯 Drag penguin to aim, release to launch';
                } else if (this.penguin && this.penguin.state === 'pullback') {
                    instructionText = '🎯 Release to launch!';
                } else if (this.penguin && this.penguin.state === 'soaring') {
                    instructionText = '👆 Tap to try again';
                } else {
                    instructionText = '🐧 Ready to launch!';
                }
                break;
            case GameState.LEVEL_EDITOR:
                if (this.levelEditor && this.levelEditor.mode === 'play') {
                    instructionText = '🎮 Testing level - drag to launch';
                } else {
                    instructionText = '✏️ Level Editor - long press to add objects';
                }
                break;
            default:
                instructionText = '👆 Touch to interact';
        }
        
        this.mobileInstructions.textContent = instructionText;
    }
    
    showLaunchFeedback(show = true) {
        if (this.launchIndicator) {
            this.launchIndicator.style.opacity = show ? '1' : '0';
            this.launchIndicator.style.transform = show ? 
                'translate(-50%, -50%) scale(1.2)' : 
                'translate(-50%, -50%) scale(1)';
        }
    }
    
    getMousePosition(e) {
        // Use fullscreen manager for coordinate conversion if available
        if (this.fullscreenManager) {
            return this.fullscreenManager.screenToCanvas(e.clientX, e.clientY);
        }
        
        // Fallback to original method
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }
    
    setCanvasScale(scaleX, scaleY) {
        this.canvasScaleX = scaleX;
        this.canvasScaleY = scaleY;
    }
    
    handleMouseDown(e) {
        this.mouseDown = true;
        this.mousePosition = this.getMousePosition(e);

        if (this.state === GameState.MENU) {
            this.startGame();
            return;
        }
        
        // Delegate to level editor if active AND in edit mode
        if (this.state === GameState.LEVEL_EDITOR && this.levelEditor.active && this.levelEditor.mode === 'edit') {
            this.levelEditor.handleMouseDown(e);
            return;
        }
        
        // Allow slingshot in both playing state and level editor play mode
        const canUseSlingshot = (this.state === GameState.PLAYING) || 
                              (this.state === GameState.LEVEL_EDITOR && this.levelEditor.mode === 'play');
        
        if (canUseSlingshot && this.penguin.state === 'idle') {
            this.isDragging = true;
            this.slingshot.startPull(this.mousePosition.x, this.mousePosition.y);
            this.penguin.setState('pullback');
            
            // Show visual feedback for mobile
            if (this.isMobileDevice()) {
                this.showLaunchFeedback(true);
                this.updateMobileInstructions();
            }
        }
    }
    
    handleMouseMove(e) {
        this.mousePosition = this.getMousePosition(e);
        
        // Delegate to level editor if active AND in edit mode
        if (this.state === GameState.LEVEL_EDITOR && this.levelEditor.active && this.levelEditor.mode === 'edit') {
            this.levelEditor.handleMouseMove(e);
            return;
        }
        
        if (this.isDragging && this.slingshot.isPulling) {
            this.slingshot.updatePullback(this.mousePosition.x, this.mousePosition.y);
        }
    }
    
    handleMouseUp(e) {
        this.mouseDown = false;
        
        // Delegate to level editor if active AND in edit mode
        if (this.state === GameState.LEVEL_EDITOR && this.levelEditor.active && this.levelEditor.mode === 'edit') {
            this.levelEditor.handleMouseUp(e);
            return;
        }
        
        if (this.isDragging) {
            this.isDragging = false;
            const velocity = this.slingshot.release();
            this.launchPenguin(velocity);
            
            // Hide visual feedback for mobile
            if (this.isMobileDevice()) {
                this.showLaunchFeedback(false);
                this.updateMobileInstructions();
            }
        } else {
            // Mouse click during soaring triggers tryAgain (like original)
            const canUseSlingshot = (this.state === GameState.PLAYING) || 
                                  (this.state === GameState.LEVEL_EDITOR && this.levelEditor.mode === 'play');
            if (canUseSlingshot && this.penguin && this.penguin.state === 'soaring') {
                this.tryAgain();
            }
        }
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            
            // Create a synthetic mouse event
            const mouseEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {},
                stopPropagation: () => {}
            };
            
            this.handleMouseDown(mouseEvent);
        }
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            
            // Create a synthetic mouse event
            const mouseEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {},
                stopPropagation: () => {}
            };
            
            this.handleMouseMove(mouseEvent);
        }
    }
    
    handleTouchEnd(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Create a synthetic mouse event
        const mouseEvent = {
            clientX: 0,
            clientY: 0,
            preventDefault: () => {},
            stopPropagation: () => {}
        };
        
        this.handleMouseUp(mouseEvent);
    }
    
    handleKeyDown(e) {
        // Handle console toggle first
        if (e.key === '`') {
            e.preventDefault();
            this.console.toggle();
            return;
        }
        
        // Don't process other keys if console is open or in level editor mode
        if (this.console.visible || this.state === GameState.LEVEL_EDITOR) {
            return;
        }
        
        switch (e.key.toLowerCase()) {
            case 'q':
                const canUseKeys = (this.state === GameState.PLAYING) || 
                                 (this.state === GameState.LEVEL_EDITOR && this.levelEditor.mode === 'play');
                if (canUseKeys) {
                    this.showQuitDialog();
                }
                break;
            case 'r':
                const canUseKeys2 = (this.state === GameState.PLAYING) || 
                                  (this.state === GameState.LEVEL_EDITOR && this.levelEditor.mode === 'play');
                if (canUseKeys2) {
                    this.tryAgain();
                }
                break;
            case ' ':
                // Only allow spacebar to start game on desktop
                if (this.state === GameState.MENU && !this.isMobileDevice()) {
                    this.startGame();
                }
                break;
            default:
                // Any other key during playing triggers tryAgain (like original)
                const canUseKeys3 = (this.state === GameState.PLAYING) || 
                                  (this.state === GameState.LEVEL_EDITOR && this.levelEditor.mode === 'play');
                if (canUseKeys3 && this.penguin && this.penguin.state === 'soaring') {
                    this.tryAgain();
                }
                break;
        }
    }
    
    launchPenguin(velocity) {
        plog.soar('Game launchPenguin called with velocity:', velocity);
        
        // Create alpha mask at current launch position (matching original game's setUpSnapping)
        this.createAlphaMaskAtLaunchPosition();
        
        this.penguin.launch(velocity.x, velocity.y);
        this.penguin.setState('soaring');
        this.tries++;
        this.updateUI();
        
        // Play launch sound
        this.playSound('17_snd_launch');
        
        // Clear physics trace
        this.physics.clearTrace();
        
        // Start recording shot path
        this.startRecordingShotPath();
        

    }
    
    // Shot path recording methods (matching original game behavior)
    startRecordingShotPath() {
        this.isRecordingPath = true;
        this.currentShotPath = [];
        plog.waddle(`Started recording shot path ${this.shotPaths.length + 1} with color ${this.shotColors[this.currentColorIndex]}`);
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
            plog.waddle(`Saved shot path ${shotPath.shotNumber} with ${shotPath.points.length} points in color ${shotPath.color}`);
            
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
        plog.debug('Cleared all shot paths');
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
    
    drawAlphaMasks(ctx) {
        if (!this.alphaMaskImage || !this.alphaMaskImage.complete) return;
        
        if (this.alphaMasks.length === 0) return;
        
        // Draw alpha masks in reverse order (oldest first, newest last)
        for (let i = this.alphaMasks.length - 1; i >= 0; i--) {
            const mask = this.alphaMasks[i];
            
            ctx.save();
            ctx.globalAlpha = mask.alpha;
            ctx.translate(mask.x, mask.y);
            
            // Create a temporary canvas for the colored alpha mask
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = this.alphaMaskImage.width;
            tempCanvas.height = this.alphaMaskImage.height;
            
            // Fill with the trace color
            tempCtx.fillStyle = mask.color;
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            
            // Convert the black shape on white background to a proper alpha mask
            // We want to keep the color only where the mask is black (the shape)
            
            // Get the alpha mask image data to convert black pixels to alpha
            const maskCanvas = document.createElement('canvas');
            const maskCtx = maskCanvas.getContext('2d');
            maskCanvas.width = this.alphaMaskImage.width;
            maskCanvas.height = this.alphaMaskImage.height;
            
            // Draw the alpha mask
            maskCtx.drawImage(this.alphaMaskImage, 0, 0);
            
            // Get the mask image data
            const maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
            const maskData = maskImageData.data;
            
            // Convert grayscale values to alpha (black = opaque, white = transparent)
            for (let i = 0; i < maskData.length; i += 4) {
                const gray = (maskData[i] + maskData[i + 1] + maskData[i + 2]) / 3;
                maskData[i] = 255;     // Red = white
                maskData[i + 1] = 255; // Green = white
                maskData[i + 2] = 255; // Blue = white
                maskData[i + 3] = 255 - gray; // Alpha = inverted gray (black becomes opaque, white becomes transparent)
            }
            
            // Put the converted mask back
            maskCtx.putImageData(maskImageData, 0, 0);
            
            // Now use destination-in to apply this alpha mask
            tempCtx.globalCompositeOperation = 'destination-in';
            tempCtx.drawImage(maskCanvas, 0, 0);
            
            // Draw the result centered on the launch position
            // Use the registration point from the original game: [8, 13]
            ctx.drawImage(tempCanvas, -8, -13);
            
            ctx.restore();
        }
    }
    
    update(deltaTime) {
        this.deltaTime = deltaTime;
        
        // Update UI Manager
        this.uiManager.update(deltaTime);
        
        // Skip game updates if in scoring state
        if (this.state === GameState.SCORING) {
            return;
        }
        
        // Update all game objects
        plog.debug('Game objects count:', this.gameObjects.length, 'types:', this.gameObjects.map(obj => obj.constructor.name));
        for (const obj of this.gameObjects) {
            if (obj.constructor.name === 'Arrow') {
                // Only update arrow if penguin exists and has position AND is soaring
                if (this.penguin && this.penguin.position && this.penguin.state === 'soaring') {
                    // plog.debug('Updating arrow with penguin at:', this.penguin.position, 'penguin state:', this.penguin.state);
                    obj.update(this.penguin);
                } else {
                    // plog.debug('Arrow update skipped - penguin:', !!this.penguin, 'position:', this.penguin?.position, 'state:', this.penguin?.state);
                    // Make sure arrow is hidden when penguin is not soaring
                    obj.visible = false;
                }
            } else {
                obj.update(deltaTime);
            }
        }
        
        // Update physics for penguin based on state
        if (this.penguin) {
            plog.physics('Game update - Penguin state:', this.penguin.state, 'Launched:', this.penguin.launched);
            if (this.penguin.state === 'soaring') {
                plog.physics('Calling updatePenguinPhysics');
                this.updatePenguinPhysics();
            } else if (this.penguin.state === 'crashed') {
                plog.crash('Calling updatePenguinCrashed');
                this.updatePenguinCrashed();
            } else if (this.penguin.state === 'hitTarget') {
                // Stop all movement when target is hit
                this.penguin.vx = 0;
                this.penguin.vy = 0;
                plog.success('Penguin stopped - target hit');
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
                plog.crash('Penguin went out of bounds (flightRect) - setting crashed state');
                this.endRecordingShotPath(); // End recording when going out of bounds
                this.penguin.state = 'crashed';
                this.penguin.crashedFrameCount = 2; // Short countdown like original GPS script
            }
        }
        
        // Check level rules for failure conditions
        if (this.levelRules && this.state === GameState.PLAYING) {
            const failureCheck = this.levelRules.checkFailureConditions(this);
            if (failureCheck.failed) {
                this.showMessage(failureCheck.reason);
                this.setState(GameState.GAME_OVER);
            }
        }
    }
    
    updatePenguinPhysics() {
        plog.physics('updatePenguinPhysics called');
        
        // Convert planets to the format expected by the new gravity system
        const planetData = this.planets.map(planet => ({
            x: planet.position.x,
            y: planet.position.y,
            mass: planet.mass,
            collisionRadius: planet.collisionRadius,
            gravitationalReach: planet.gravitationalReach || 5000
        }));
        
        // Debug: Log planet data being passed (simplified)
        plog.physics('Game passing', planetData.length, 'planets, GravConst:', this.physics.gravitationalConstant);
        
        // Check for planet collisions first (like original GPS script)
        for (const planet of planetData) {
            const changeLoc = { 
                x: this.penguin.x - planet.x, 
                y: this.penguin.y - planet.y 
            };
            const distance = Math.sqrt(changeLoc.x * changeLoc.x + changeLoc.y * changeLoc.y);
            
            if (distance < planet.collisionRadius) {
                plog.crash('Planet collision detected in physics update');
                this.penguin.crashIntoPlanet(planet);
                this.playSound('20_snd_HitPlanet');
                
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
            plog.waddle('Crash ended - calling tryAgain to reset everything');
            this.tryAgain(); // Use tryAgain instead of just resetPenguinToSlingshot
        }
        
        this.updateUI();
    }
    
    isInBounds(position, bounds = this.stageRect) {
        return position.x >= bounds.x && position.x <= bounds.x + bounds.width &&
               position.y >= bounds.y && position.y <= bounds.y + bounds.height;
    }
    
    collectBonus(bonus) {
        plog.bonus(`Game.collectBonus called with bonus value: ${bonus.value}, position:`, bonus.position);
        
        // Use the new collect method that returns the value
        const collectedValue = bonus.collect();
        
        if (collectedValue > 0) {
            this.currentAttemptScore += collectedValue;
            this.playSound('16_snd_bonus');
            
            // Show bonus popup at bonus location
            this.bonusPopup.show(collectedValue, bonus.position);
            
            this.updateUI();
        }
    }
    
    registerPlanetCollision() {
        this.planetCollisions++;
        plog.crash(`Planet collision ${this.planetCollisions} registered`);
    }
    
    handleTargetHit() {
        this.playSound('21_snd_enterShip');
        
        // Stop the target's hit timer so ship stays closed during scoring
        if (this.target && this.target.isHit) {
            this.target.isHit = false;
            this.target.hitFrameCount = 0;
        }
        
        // Check custom victory conditions if rules exist
        if (this.levelRules) {
            const victoryCheck = this.levelRules.checkVictoryConditions(this);
            if (!victoryCheck.canProgress) {
                plog.warn('Victory conditions not met:', victoryCheck.reason);
                this.showMessage(victoryCheck.reason);
                this.penguin.setState('crashed');
                return;
            }
        }
        
        // Wait a moment before showing scoring (matches original 30 frame delay)
        setTimeout(() => {
            this.showLevelEndScreen();
        }, 500);
    }
    
    calculateFinalScore() {
        // Original game formula: tempScore = tempDist * tempLevel / tempTries
        const levelScore = Math.floor(this.distance * this.level / this.tries);
        
        // Add current attempt bonuses and level score to total
        this.score += levelScore + this.currentAttemptScore;
        
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
        
        return levelScore;
    }
    
    showLevelEndScreen() {
        this.setState(GameState.SCORING);
        this.calculateFinalScore();
        this.uiManager.showScreen(LevelEndScreen, this);
    }
    
    nextLevel() {
        this.level++;
        this.tries = 0;
        this.distance = 0;
        this.planetCollisions = 0;
        
        // Close any UI screens
        this.uiManager.closeAllScreens();
        
        // Load next level
        this.loadLevel(this.level);
        
        // Update URL parameter to reflect current level
        Utils.setURLParameter('level', this.level.toString());
        
        // Return to playing state
        this.setState(GameState.PLAYING);
    }
    
    resetLevel() {
        this.resetPenguin();
        this.resetBonuses();
        this.physics.clearTrace();
        this.clearAllShotPaths();
        this.clearAlphaMasks();
        this.arrow.visible = false; // Reset arrow visibility
        this.setState(GameState.PLAYING);
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
        this.currentAttemptScore = 0; // Reset attempt score for new level
        
        // Clear all shot path traces for new level
        this.clearAllShotPaths();
        this.clearAlphaMasks();
        
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
        
        // Draw alpha masks (matching original game's k1, k2, k3 sprites)
        this.drawAlphaMasks(this.ctx);
        
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
                plog.debug('Drawing arrow object - visible:', obj.visible, 'position:', obj.position);
            }
            obj.draw(this.ctx);
        }
        
        // Draw UI overlays
        this.drawUI();
        
        // Draw UI Manager screens on top
        this.uiManager.render();
        
        // Draw level editor overlay
        this.levelEditor.render(this.ctx);
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
        if (this.state === GameState.PLAYING) {
            this.ctx.save();
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'left';
            
            // Show recorded shot paths count
            //this.ctx.fillText(`Shot Paths: ${this.shotPaths.length}`, 10, this.canvas.height - 60);
            
            // Show current recording status
            if (this.isRecordingPath) {
                this.ctx.fillStyle = this.shotColors[this.currentColorIndex];
                //this.ctx.fillText(`Recording Path ${this.shotPaths.length + 1} (${this.currentShotPath.length} points)`, 10, this.canvas.height - 40);
            }
            
            this.ctx.restore();
        }
    }
    
    updateUI() {
        this.ui.level.textContent = this.level;
        this.ui.score.textContent = Utils.formatScore(this.score + this.currentAttemptScore);
        this.ui.distance.textContent = Math.floor(this.distance);
        this.ui.tries.textContent = this.tries;
    }
    
    playSound(soundName) {
        // Use audio manager to play sounds
        if (this.audioManager) {
            this.audioManager.playSound(soundName);
        }
    }
    
    nextLevel() {
        this.level++;
        this.tries = 0;
        this.distance = 0;
        this.planetCollisions = 0;
        
        // Close any UI screens
        this.uiManager.closeAllScreens();
        
        // Load next level
        this.loadLevel(this.level);
        
        // Update URL parameter to reflect current level
        Utils.setURLParameter('level', this.level.toString());
        
        // Return to playing state
        this.setState(GameState.PLAYING);
    }
    
    showQuitDialog() {
        if (this.isMobileDevice()) {
            this.showMobileQuitDialog();
        } else {
            if (confirm('Are you sure you want to quit?')) {
                this.setState(GameState.MENU);
            }
        }
    }
    
    showMobileQuitDialog() {
        // Remove existing dialog if any
        const existingDialog = document.getElementById('mobileQuitDialog');
        if (existingDialog) {
            existingDialog.remove();
        }
        
        // Create mobile quit dialog
        const dialog = document.createElement('div');
        dialog.id = 'mobileQuitDialog';
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;
        
        const dialogContent = document.createElement('div');
        dialogContent.style.cssText = `
            background: #333;
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            color: white;
            font-family: Arial, sans-serif;
            max-width: 300px;
            width: 90%;
        `;
        
        const title = document.createElement('h3');
        title.textContent = 'Quit Game?';
        title.style.cssText = 'margin: 0 0 20px 0; font-size: 20px;';
        
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 20px;
        `;
        
        const yesButton = document.createElement('button');
        yesButton.textContent = 'YES';
        yesButton.style.cssText = `
            background: #ff4444;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            touch-action: manipulation;
        `;
        
        const noButton = document.createElement('button');
        noButton.textContent = 'NO';
        noButton.style.cssText = `
            background: #666;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            touch-action: manipulation;
        `;
        
        yesButton.addEventListener('click', () => {
            dialog.remove();
            this.setState(GameState.MENU);
        });
        
        noButton.addEventListener('click', () => {
            dialog.remove();
        });
        
        buttonContainer.appendChild(yesButton);
        buttonContainer.appendChild(noButton);
        dialogContent.appendChild(title);
        dialogContent.appendChild(buttonContainer);
        dialog.appendChild(dialogContent);
        document.body.appendChild(dialog);
    }
    
    showMessage(message) {
        // Simple alert for now - could be enhanced with UI overlay
        alert(message);
    }
    
    startGame() {
        this.level = 1;
        this.score = 0;
        this.currentAttemptScore = 0;
        this.distance = 0;
        this.tries = 0;
        this.loadLevel(this.level);
        this.setState(GameState.PLAYING);
    }
    
    jumpToLevel(targetLevel) {
        // Validate level exists (check if level file is available)
        const maxLevel = 25; // Based on original game analysis
        if (targetLevel < 1 || targetLevel > maxLevel) {
            plog.error(`Invalid level: ${targetLevel}. Must be 1-${maxLevel}.`);
            return false;
        }
        
        plog.info(`Jumping to level ${targetLevel}`);
        
        // Set up game state for the target level
        this.level = targetLevel;
        this.score = 0; // Start fresh for testing purposes
        this.currentAttemptScore = 0;
        this.distance = 0;
        this.tries = 0;
        this.planetCollisions = 0;
        
        // Close any UI screens
        this.uiManager.closeAllScreens();
        
        // Load the target level
        try {
            this.loadLevel(this.level);
            this.setState(GameState.PLAYING);
            
            // Update URL parameter to reflect current level
            Utils.setURLParameter('level', this.level.toString());
            
            plog.success(`Successfully jumped to level ${targetLevel}`);
            return true;
        } catch (error) {
            plog.error(`Failed to load level ${targetLevel}: ${error.message}`);
            
            // Fall back to level 1 if the target level doesn't exist
            this.level = 1;
            this.loadLevel(this.level);
            this.setState(GameState.PLAYING);
            Utils.removeURLParameter('level');
            
            return false;
        }
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
        plog.waddle('Resetting penguin to slingshot position');
        
        if (!this.penguin || !this.slingshot) {
            console.error('Cannot reset - penguin or slingshot not initialized');
            return;
        }
        
        // Reset penguin state and physics
        this.penguin.reset();
        
        // Position penguin at slingshot anchor with 30 pixel offset (like original)
        const slingshotAnchor = this.slingshot.anchor;
        plog.debug('Slingshot anchor position:', slingshotAnchor);
        
        const penguinPosition = Utils.findPoint(slingshotAnchor, this.slingshot.rotation || 0, 30);
        plog.debug('Calculated penguin position:', penguinPosition);
        
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
        
        plog.waddle(`Penguin reset to position: ${this.penguin.x}, ${this.penguin.y}, state: ${this.penguin.state}`);
    }
    
    // Add tryAgain method (matching original GPS script)
    tryAgain() {
        plog.waddle('tryAgain called - immediately resetting penguin and bonuses');
        this.endRecordingShotPath();
        this.resetPenguinToSlingshot();
        this.resetBonuses(); // Reset bonuses between tries
        
        // Reset current attempt score (don't add bonuses until level is completed)
        this.currentAttemptScore = 0;
        
        // Reset distance (prevents accumulation across retries affecting score)
        this.distance = 0;
        
        // Update mobile UI feedback
        if (this.isMobileDevice()) {
            this.showLaunchFeedback(false);
            this.updateMobileInstructions();
        }
        
        this.updateUI();
    }
    
    // Level Editor Methods
    enterLevelEditor() {
        this.levelEditor.enter();
    }
    
    exitLevelEditor() {
        this.levelEditor.exit();
    }
    
    exportCurrentLevel() {
        console.log('=== STARTING COMPREHENSIVE LEVEL EXPORT ===');
        
        const levelData = {
            name: `Custom Level ${this.level}`,
            description: "Generated by Level Editor",
            startPosition: this.penguin ? { x: this.penguin.x, y: this.penguin.y } : { x: 100, y: 300 },
            targetPosition: this.target ? { x: this.target.position.x, y: this.target.position.y } : { x: 700, y: 300 },
            objects: [],
            rules: this.levelRules ? this.exportLevelRules() : {
                maxTries: null,
                timeLimit: null,
                scoreMultiplier: 1.0
            }
        };
        
        // GREEDY EXPORT: Get ALL objects from ALL arrays
        const allObjects = this.getAllObjectsForExport();
        
        console.log(`Found ${allObjects.length} total objects to export`);
        
        // Export each object with ALL its properties
        for (const obj of allObjects) {
            const exportedObj = this.exportObjectComprehensively(obj);
            if (exportedObj) {
                levelData.objects.push(exportedObj);
            }
        }
        
        console.log(`Export complete: ${levelData.objects.length} objects exported`);
        console.log('Level data structure:', levelData);
        return levelData;
    }
    
    getAllObjectsForExport() {
        const allObjects = new Set(); // Use Set to avoid duplicates
        
        // Add from gameObjects array
        this.gameObjects.forEach(obj => {
            if (this.shouldExportObject(obj)) {
                allObjects.add(obj);
            }
        });
        
        // Add from specific arrays (in case something's missing from gameObjects)
        this.planets.forEach(obj => allObjects.add(obj));
        this.bonuses.forEach(obj => allObjects.add(obj));
        this.textObjects.forEach(obj => allObjects.add(obj));
        this.pointingArrows.forEach(obj => allObjects.add(obj));
        
        // Add penguin if it exists
        if (this.penguin && this.shouldExportObject(this.penguin)) {
            allObjects.add(this.penguin);
        }
        
        console.log('Objects found in arrays:');
        console.log('- gameObjects:', this.gameObjects.length);
        console.log('- planets:', this.planets.length);
        console.log('- bonuses:', this.bonuses.length);
        console.log('- textObjects:', this.textObjects.length);
        console.log('- pointingArrows:', this.pointingArrows.length);
        console.log('- penguin:', this.penguin ? 1 : 0);
        
        return Array.from(allObjects);
    }
    
    shouldExportObject(obj) {
        // Skip utility objects that shouldn't be exported
        const skipTypes = ['BonusPopup', 'Arrow']; // Arrow is the UI arrow, not PointingArrow
        return !skipTypes.includes(obj.constructor.name);
    }
    
    exportObjectComprehensively(obj) {
        const className = obj.constructor.name;
        console.log(`Exporting ${className}:`, obj);
        
        // Start with base object data
        const exportData = {
            type: className.toLowerCase(),
            className: className, // Keep original class name for precision
        };
        
        // Export position as object (matching level JSON format)
        const coords = this.getObjectCoordinates(obj);
        if (coords) {
            exportData.position = { x: coords.x, y: coords.y };
        }
        
        // Export ALL properties under 'properties' object (matching level JSON format)
        const properties = this.extractAllProperties(obj);
        
        // Export orbit system if present
        if (obj.orbitSystem) {
            properties.orbit = this.exportOrbitSystem(obj.orbitSystem);
        }
        
        // Only add properties object if it has content
        if (Object.keys(properties).length > 0) {
            exportData.properties = properties;
        }
        
        return exportData;
    }
    
    getObjectCoordinates(obj) {
        if (typeof obj.x === 'number' && typeof obj.y === 'number') {
            return { x: obj.x, y: obj.y };
        } else if (obj.position && typeof obj.position.x === 'number' && typeof obj.position.y === 'number') {
            return { x: obj.position.x, y: obj.position.y };
        }
        return null;
    }
    
    extractAllProperties(obj) {
        const properties = {};
        const className = obj.constructor.name;
        
        // Define properties to extract for each class type
        const propertyMaps = {
            'Planet': ['radius', 'mass', 'collisionRadius', 'gravitationalReach', 'color', 'planetType'],
            'Bonus': ['value', 'rotationSpeed', 'state', 'collectedRotationSpeed'],
            'Target': ['width', 'height', 'spriteType'], // Target uses width/height, not radius
            'Slingshot': ['anchorX', 'anchorY', 'stretchLimit', 'velocityMultiplier'],
            'TextObject': ['content', 'fontSize', 'color', 'fontFamily', 'textAlign', 'backgroundColor', 'padding', 'autoSize'], // content not textContent
            'PointingArrow': ['color', 'glowColor', 'baseWidth', 'scaleWithDistance', 'minWidth', 'maxWidth', 'pulseSpeed'],
            'Penguin': ['state'] // Penguin shouldn't really be exported in levels
        };
        
        // Common GameObject properties
        const commonProps = ['name', 'rotation', 'alpha', 'visible', 'width', 'height', 'renderOrder'];
        
        // Extract class-specific properties
        const classProps = propertyMaps[className] || [];
        const allProps = [...commonProps, ...classProps];
        
        allProps.forEach(prop => {
            if (obj[prop] !== undefined && obj[prop] !== null) {
                properties[prop] = obj[prop];
            }
        });
        
        // Handle special nested properties
        if (className === 'PointingArrow' && obj.pointingAt) {
            properties.pointingAt = { x: obj.pointingAt.x, y: obj.pointingAt.y };
        }
        
        // Also do a greedy scan for any other properties that look important
        this.addDiscoveredProperties(obj, properties);
        
        return properties;
    }
    
    addDiscoveredProperties(obj, properties) {
        // Scan object for additional properties that might be important
        for (const key in obj) {
            if (obj.hasOwnProperty(key) && 
                !properties.hasOwnProperty(key) && 
                !this.isInternalProperty(key) &&
                obj[key] !== undefined && 
                obj[key] !== null) {
                
                const value = obj[key];
                
                // Only export simple values and avoid functions/complex objects
                if (typeof value === 'string' || 
                    typeof value === 'number' || 
                    typeof value === 'boolean') {
                    properties[key] = value;
                    console.log(`Discovered property ${key} = ${value}`);
                }
            }
        }
    }
    
    isInternalProperty(key) {
        // Skip internal properties that shouldn't be exported
        const internalProps = [
            'position', 'orbitSystem', 'assetLoader', 'bonusSprite', 'bonusHitSprite',
            'currentSprite', 'planet', 'canvas', 'ctx', 'sprites', 'animations'
        ];
        return internalProps.includes(key) || key.startsWith('_');
    }
    
    exportOrbitSystem(orbitSystem) {
        return {
            orbitCenter: orbitSystem.orbitCenter ? { 
                x: orbitSystem.orbitCenter.x, 
                y: orbitSystem.orbitCenter.y 
            } : null,
            orbitRadius: orbitSystem.orbitRadius,
            orbitSpeed: orbitSystem.orbitSpeed,
            orbitAngle: orbitSystem.orbitAngle,
            orbitType: orbitSystem.orbitType,
            orbitParams: orbitSystem.orbitParams || {}
        };
    }
    
    exportLevelRules() {
        return {
            maxTries: this.levelRules.maxTries,
            timeLimit: this.levelRules.timeLimit,
            scoreMultiplier: this.levelRules.scoreMultiplier,
            requiredBonuses: this.levelRules.requiredBonuses,
            allowedMisses: this.levelRules.allowedMisses,
            gravitationalConstant: this.levelRules.gravitationalConstant
        };
    }


    
    createAlphaMaskAtLaunchPosition() {
        if (!this.penguin) return;
        
        // Get current trace color (matching original game's pTraceColor)
        const traceColor = this.shotColors[this.currentColorIndex];
        
        // Create alpha mask object (matching original game's k1, k2, k3 sprites)
        const alphaMask = {
            x: this.penguin.x,
            y: this.penguin.y,
            color: traceColor,
            alpha: 0.6 // Semi-transparent like original
        };
        
        // Shift existing masks (matching original game's setUpSnapping logic)
        // k3 gets k2's position, k2 gets k1's position, k1 gets current position
        if (this.alphaMasks.length >= 3) {
            this.alphaMasks[2] = this.alphaMasks[1]; // k3 = k2
            this.alphaMasks[1] = this.alphaMasks[0]; // k2 = k1
            this.alphaMasks[0] = alphaMask; // k1 = new position
        } else {
            this.alphaMasks.unshift(alphaMask);
        }
        

    }
    
    clearAlphaMasks() {
        this.alphaMasks = [];
        plog.debug('Cleared all alpha masks');
    }
    
    loadAlphaMask() {
        // Load the alpha mask image directly
        this.alphaMaskImage = new Image();
        this.alphaMaskImage.onload = () => {
            plog.success('Alpha mask image loaded successfully');
        };
        this.alphaMaskImage.onerror = () => {
            console.error('Failed to load alpha mask image');
        };
        this.alphaMaskImage.src = 'assets/ui/alpha_mask.png';
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Game;
} 

export { Game, GameState }; 