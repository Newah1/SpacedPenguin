// Asset Loader for Spaced Penguin
// Handles loading manifest, assets, and creating animations

import { AudioManager } from './audioManager.js';
import plog from './penguinLogger.js';

export class AssetLoader {
    constructor() {
        this.manifest = null;
        this.resources = {};
        this.assetsToLoad = [];
        this.onComplete = null;
        this.onProgress = null;
        this.loadedCount = 0;
        this.totalCount = 0;
        
        // Initialize audio manager
        this.audioManager = new AudioManager();
    }

    async loadAssets(onComplete, onProgress) {
        this.onComplete = onComplete;
        this.onProgress = onProgress;

        try {
            // Load manifest first
            plog.info('Loading asset manifest...');
            const response = await fetch('assets/manifest.json');
            this.manifest = await response.json();
            
            // Prepare assets to load
            this.prepareAssetsToLoad();
            
            // Start loading
            await this.loadAllAssets();
            
        } catch (error) {
            console.error('Error loading assets:', error);
        }
    }

    prepareAssetsToLoad() {
        this.assetsToLoad = [];
        
        // Add animation sprite sheets
        Object.entries(this.manifest.animations).forEach(([name, path]) => {
            if (path.endsWith('.png')) {
                this.assetsToLoad.push({ name, url: `assets/${path}`, type: 'texture' });
            }
        });

        // Add UI assets
        Object.entries(this.manifest.ui).forEach(([name, path]) => {
            const type = path.endsWith('.svg') ? 'svg' : 'texture';
            this.assetsToLoad.push({ name: `ui_${name}`, url: `assets/${path}`, type });
        });

        // Add planet assets
        Object.entries(this.manifest.planets).forEach(([name, path]) => {
            const type = path.endsWith('.svg') ? 'svg' : 'texture';
            this.assetsToLoad.push({ name: `planet_${name}`, url: `assets/${path}`, type });
        });

        // Add sprite assets
        Object.entries(this.manifest.sprites).forEach(([name, path]) => {
            const type = path.endsWith('.svg') ? 'svg' : 'texture';
            this.assetsToLoad.push({ name: `sprite_${name}`, url: `assets/${path}`, type });
        });

        // Add audio assets (we'll handle these differently)
        Object.entries(this.manifest.audio).forEach(([name, path]) => {
            this.assetsToLoad.push({ name: `audio_${name}`, url: `assets/${path}`, type: 'audio' });
        });
        
        this.totalCount = this.assetsToLoad.length;
        plog.debug(`Prepared ${this.totalCount} assets to load`);
    }

    async loadAllAssets() {
        plog.info(`Loading ${this.totalCount} assets...`);
        
        for (const asset of this.assetsToLoad) {
            try {
                if (asset.type === 'texture') {
                    // Load regular images
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = asset.url;
                    });
                    
                    this.resources[asset.name] = { image: img };
                } else if (asset.type === 'svg') {
                    // Load SVG as an image element
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = asset.url;
                    });
                    
                    this.resources[asset.name] = { image: img };
                } else if (asset.type === 'audio') {
                    // Load audio using audio manager
                    const soundName = asset.name.replace('audio_', '');
                    await this.audioManager.loadSound(soundName, asset.url);
                    this.resources[asset.name] = { audioManager: this.audioManager, soundName: soundName };
                }
                
                this.loadedCount++;
                const progress = (this.loadedCount / this.totalCount) * 100;
                
                plog.debug(`Loaded: ${asset.name} (${this.loadedCount}/${this.totalCount})`);
                
                if (this.onProgress) {
                    this.onProgress(progress, asset.name);
                }
                
            } catch (error) {
                console.error(`Error loading asset ${asset.name}:`, error);
            }
        }
        
        plog.success('All assets loaded');
        if (this.onComplete) {
            this.onComplete(this);
        }
    }

    // Create penguin animation from sprite sheet
    async createPenguinAnimation(animationType = 'xc') {
        const animationName = `penguin_spin_${animationType}_sheet`;
        
        if (!this.resources[animationName]) {
            console.error(`Animation ${animationName} not found in resources`);
            return null;
        }

        try {
            // Load metadata
            const metadataResponse = await fetch(`assets/animations/penguin_spin_${animationType}_metadata.json`);
            const metadata = await metadataResponse.json();
            
            // Create animation object with sprite sheet and metadata
            const animation = {
                spriteSheet: this.resources[animationName].image,
                metadata: metadata,
                animationType: animationType,
                currentFrame: 0,
                frameCount: metadata.frame_count,
                frameWidth: metadata.frame_width,
                frameHeight: metadata.frame_height,
                registrationPoints: metadata.registration_points
            };
            
            plog.success(`Created penguin animation: ${animationType} (${metadata.frame_count} frames)`);
            return animation;
            
        } catch (error) {
            console.error(`Error creating penguin animation ${animationType}:`, error);
            return null;
        }
    }

    // Get a sprite by name
    getSprite(category, name) {
        const resourceName = `${category}_${name}`;
        if (this.resources[resourceName]) {
            return this.resources[resourceName].image;
        }
        console.warn(`Sprite ${resourceName} not found`);
        return null;
    }

    // Get UI element
    getUI(name) {
        return this.getSprite('ui', name);
    }

    // Get planet sprite
    getPlanet(name) {
        return this.getSprite('planet', name);
    }

    // Get game object sprite
    getGameSprite(name) {
        return this.getSprite('sprite', name);
    }

    // Create ship sprite with states
    createShip() {
        const ship = {
            closed: this.getGameSprite('ship_closed'),
            open: this.getGameSprite('ship_open'),
            currentState: 'closed'
        };
        
        ship.sprite = ship.closed;
        ship.setState = function(state) {
            if (state === 'open' || state === 'closed') {
                this.currentState = state;
                this.sprite = this[state];
            }
        };
        
        return ship;
    }

    // Create title graphics
    createTitle() {
        const titleContainer = {
            spacedText: this.getUI('title_spaced'),
            penguinText: this.getUI('title_penguin')
        };
        
        return titleContainer;
    }
    
    // Get audio manager
    getAudioManager() {
        return this.audioManager;
    }
}

// Export for use in other modules
window.AssetLoader = AssetLoader; 