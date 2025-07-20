// Main entry point for Spaced Penguin
// Initializes the game and runs the game loop

import { Game } from './game.js';
import { AssetLoader } from './assetLoader.js';
import Utils from './utils.js';

console.log('main.js loaded');

class GameManager {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.game = null;
        this.assetLoader = null;
        this.isRunning = false;
        this.lastTime = 0;
        this.assetsLoaded = false;
        
        this.init();
    }
    
    init() {
        // Hide loading screen initially
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'none';
            console.log('Loading screen hidden');
        }
        
        // Show loading screen for assets
        this.showLoadingScreen();
        
        // Initialize asset loader
        this.assetLoader = new AssetLoader();
        
        // Load assets first
        this.assetLoader.loadAssets(
            this.onAssetsLoaded.bind(this),
            this.onAssetProgress.bind(this)
        );
    }
    
    onAssetProgress(progress, resourceName) {
        // Update loading screen with progress
        const loadingText = document.getElementById('loadingText');
        if (loadingText) {
            loadingText.textContent = `Loading ${resourceName}... ${Math.round(progress)}%`;
        }
    }
    
    onAssetsLoaded(assetLoader) {
        console.log('Assets loaded, initializing game...');
        this.assetsLoaded = true;
        
        // Initialize game with loaded assets
        this.game = new Game(this.canvas, assetLoader);
        
        // Make game globally accessible for sound effects
        window.game = this.game;
        
        // Load high score
        this.game.loadHighScore();
        
        // Set up volume control
        this.setupVolumeControl();
        
        // Hide loading screen
        this.hideLoadingScreen();
        
        // Start game loop
        this.isRunning = true;
        this.gameLoop();
        
        // Show start screen with real graphics
        this.showStartScreen();
        
        // Set up start screen animation
        this.startScreenAnimation();
    }
    
    showLoadingScreen() {
        // Create loading screen if it doesn't exist
        let loadingScreen = document.getElementById('loadingScreen');
        if (!loadingScreen) {
            loadingScreen = document.createElement('div');
            loadingScreen.id = 'loadingScreen';
            loadingScreen.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #000;
                color: #fff;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                font-family: Arial, sans-serif;
                z-index: 1000;
            `;
            
            const title = document.createElement('h1');
            title.textContent = 'SPACED PENGUIN';
            title.style.cssText = 'font-size: 48px; margin-bottom: 20px;';
            
            const loadingText = document.createElement('div');
            loadingText.id = 'loadingText';
            loadingText.textContent = 'Loading assets...';
            loadingText.style.cssText = 'font-size: 16px;';
            
            loadingScreen.appendChild(title);
            loadingScreen.appendChild(loadingText);
            document.body.appendChild(loadingScreen);
        }
        
        loadingScreen.style.display = 'flex';
    }
    
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
    }
    
    gameLoop(currentTime = 0) {
        if (!this.isRunning) return;
        
        // Calculate delta time
        const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;
        
        // Cap delta time to prevent large jumps
        const cappedDeltaTime = Math.min(deltaTime, 1/30); // Max 30 FPS equivalent
        
        // Update game
        if (this.game && this.assetsLoaded) {
            this.game.update(cappedDeltaTime);
            this.game.render();
        }
        
        // Continue game loop
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    showStartScreen() {
        if (!this.assetsLoaded || !this.game) return;
        
        console.log('Showing start screen with real graphics');
        const ctx = this.canvas.getContext('2d');
        
        // Clear canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw stars
        this.game.drawStars();
        
        // The title graphics will be handled by the Game class using real sprites
        // For now, keep the text-based title as fallback
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SPACED PENGUIN', this.canvas.width / 2, 150);
        
        // Draw subtitle
        ctx.font = '24px Arial';
        ctx.fillText('A Gravity Slingshot Adventure', this.canvas.width / 2, 200);
        
        // Draw instructions
        ctx.font = '16px Arial';
        ctx.fillText('Click and drag to pull back the slingshot', this.canvas.width / 2, 300);
        ctx.fillText('Release to launch the penguin', this.canvas.width / 2, 330);
        ctx.fillText('Collect bonuses and land in the target', this.canvas.width / 2, 360);
        ctx.fillText('Avoid crashing into planets', this.canvas.width / 2, 390);
        
        // Draw controls
        ctx.font = '14px Arial';
        ctx.fillText('Press SPACE to start', this.canvas.width / 2, 450);
        ctx.fillText('Press R to reset level', this.canvas.width / 2, 480);
        ctx.fillText('Press Q to quit', this.canvas.width / 2, 510);
        
        // Draw high score
        if (this.game.highScore > 0) {
            ctx.fillText(`High Score: ${Utils.formatScore(this.game.highScore)}`, this.canvas.width / 2, 550);
        }
        
        // Draw penguin animation (now using real sprites)
        this.drawStartPenguin(ctx);
    }
    
    drawStartPenguin(ctx) {
        // This will be replaced with actual penguin sprite rendering
        // For now, keep the simple animation as fallback
        const time = Date.now() * 0.001;
        const x = this.canvas.width / 2;
        const y = 100;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(time) * 0.1);
        
        // Draw penguin (fallback)
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(0, 0, 16, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw features
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(-3, -3, 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw beak
        ctx.fillStyle = '#FFA500';
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(12, -1);
        ctx.lineTo(12, 1);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }
    
    startScreenAnimation() {
        if (this.game && this.game.state === 'menu') {
            this.showStartScreen();
            requestAnimationFrame(() => this.startScreenAnimation());
        }
    }
    
    pause() {
        this.isRunning = false;
    }
    
    resume() {
        this.isRunning = true;
        this.gameLoop();
    }
    
    setupVolumeControl() {
        const volumeSlider = document.getElementById('volumeSlider');
        const volumeValue = document.getElementById('volumeValue');
        
        if (volumeSlider && volumeValue && this.game && this.game.assetLoader) {
            const audioManager = this.game.assetLoader.getAudioManager();
            
            if (audioManager) {
                // Set initial volume
                const initialVolume = volumeSlider.value / 100;
                audioManager.setMasterVolume(initialVolume);
                
                // Add event listener for volume changes
                volumeSlider.addEventListener('input', function() {
                    const volume = this.value / 100;
                    volumeValue.textContent = this.value + '%';
                    audioManager.setMasterVolume(volume);
                });
                
                console.log('Volume control initialized');
            }
        }
    }
    
    destroy() {
        this.isRunning = false;
        this.game = null;
        this.assetLoader = null;
    }
}

// Initialize the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, starting game manager...');
    const gameManager = new GameManager();
    window.gameManager = gameManager; // Make it globally accessible for debugging
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (window.gameManager) {
        if (document.hidden) {
            window.gameManager.pause();
        } else {
            window.gameManager.resume();
        }
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    if (window.gameManager && window.gameManager.game) {
        // Recalculate canvas size if needed
        const canvas = window.gameManager.canvas;
        const container = canvas.parentElement;
        
        // Keep canvas at fixed size for now
        canvas.width = 800;
        canvas.height = 600;
    }
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameManager;
} 