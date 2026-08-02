// Asset Loader for Spaced Penguin
// Handles loading manifest, assets, and creating animations

import { AudioManager } from './audioManager.js';
import plog from './penguinLogger.js';
import {
    ASSET_CONFIG,
    assetPath,
    assetTypeForPath,
    penguinAnimationAssetPath
} from './config/assetConfig.js';

export class AssetLoader {
    constructor() {
        this.manifest = null;
        this.resources = {};
        this.assetsToLoad = [];
        this.onComplete = null;
        this.onProgress = null;
        this.loadedCount = 0;
        this.totalCount = 0;
        this.loadAttempts = new Map(); // Track load attempts to prevent redundant loading
        
        // Initialize audio manager
        this.audioManager = new AudioManager();
    }

    async loadAssets(onComplete, onProgress) {
        this.onComplete = onComplete;
        this.onProgress = onProgress;

        try {
            // Load manifest first
            plog.info('Loading asset manifest...');
            const response = await fetch(assetPath(ASSET_CONFIG.manifest));
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
        
        // Load essential assets first
        const essential = this.manifest.essential || {};
        
        // Essential animations
        Object.entries(this.manifest.animations).forEach(([name, path]) => {
            if (assetTypeForPath(path) === 'texture') {
                const isEssential = essential.animations && essential.animations.includes(name);
                this.assetsToLoad.push({ 
                    name, 
                    url: assetPath(path),
                    type: 'texture', 
                    essential: isEssential 
                });
            }
        });

        // Essential UI assets
        Object.entries(this.manifest.ui).forEach(([name, path]) => {
            const type = assetTypeForPath(path);
            const isEssential = essential.ui && essential.ui.includes(name);
            this.assetsToLoad.push({ 
                name: `ui_${name}`, 
                url: assetPath(path),
                type, 
                essential: isEssential 
            });
        });

        // Essential planet assets
        Object.entries(this.manifest.planets).forEach(([name, path]) => {
            const type = assetTypeForPath(path);
            const isEssential = essential.planets && essential.planets.includes(name);
            this.assetsToLoad.push({ 
                name: `planet_${name}`, 
                url: assetPath(path),
                type, 
                essential: isEssential 
            });
        });

        // Essential sprite assets
        Object.entries(this.manifest.sprites).forEach(([name, path]) => {
            const type = assetTypeForPath(path);
            const isEssential = essential.sprites && essential.sprites.includes(name);
            this.assetsToLoad.push({ 
                name: `sprite_${name}`, 
                url: assetPath(path),
                type, 
                essential: isEssential 
            });
        });

        // Essential audio assets
        Object.entries(this.manifest.audio).forEach(([name, path]) => {
            const isEssential = essential.audio && essential.audio.includes(name);
            this.assetsToLoad.push({ 
                name: `audio_${name}`, 
                url: assetPath(path),
                type: 'audio', 
                essential: isEssential 
            });
        });

        // Sort by priority (essential first)
        this.assetsToLoad.sort((a, b) => (b.essential ? 1 : 0) - (a.essential ? 1 : 0));
        
        this.totalCount = this.assetsToLoad.length;
        const essentialCount = this.assetsToLoad.filter(a => a.essential).length;
        plog.info(`Prepared ${this.totalCount} assets to load (${essentialCount} essential)`);
    }

    async loadAllAssets() {
        plog.info(`Loading ${this.totalCount} assets...`);
        
        for (const asset of this.assetsToLoad) {
            // Skip if already attempted and failed
            if (this.loadAttempts.has(asset.name)) {
                this.loadedCount++;
                continue;
            }
            
            // Skip if already loaded
            if (this.resources[asset.name]) {
                this.loadedCount++;
                continue;
            }
            
            this.loadAttempts.set(asset.name, true);
            
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
                plog.warn(`Failed to load asset ${asset.name}: ${error.message}`);
                
                // For essential assets, provide fallbacks
                if (asset.essential) {
                    this.createFallbackAsset(asset);
                }
                
                // Still count as "loaded" to prevent hanging
                this.loadedCount++;
                const progress = (this.loadedCount / this.totalCount) * 100;
                
                if (this.onProgress) {
                    this.onProgress(progress, asset.name + ' (fallback)');
                }
            }
        }
        
        const failedCount = this.totalCount - Object.keys(this.resources).length;
        if (failedCount > 0) {
            plog.warn(`Asset loading completed with ${failedCount} failures`);
        } else {
            plog.success('All assets loaded successfully');
        }
        
        if (this.onComplete) {
            await this.onComplete(this);
        }
    }

    // Lazy load non-essential assets after initial loading
    async loadAssetOnDemand(assetName) {
        // Check if already loaded
        if (this.resources[assetName]) {
            return this.resources[assetName];
        }

        // Find asset in manifest
        let assetInfo = null;
        
        // Search through all asset categories
        for (const [category, assets] of Object.entries(this.manifest)) {
            if (category === 'essential') continue;
            
            for (const [name, path] of Object.entries(assets)) {
                const fullName = category === 'animations' ? name : `${category.slice(0, -1)}_${name}`;
                if (fullName === assetName) {
                    assetInfo = {
                        name: fullName,
                        url: assetPath(path),
                        type: assetTypeForPath(path)
                    };
                    break;
                }
            }
            if (assetInfo) break;
        }
        
        if (!assetInfo) {
            plog.warn(`Asset ${assetName} not found in manifest for lazy loading`);
            return null;
        }
        
        // Load the asset
        try {
            plog.info(`Lazy loading asset: ${assetName}`);
            
            if (assetInfo.type === 'texture') {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = assetInfo.url;
                });
                
                this.resources[assetName] = img;
                return img;
                
            } else if (assetInfo.type === 'svg') {
                const response = await fetch(assetInfo.url);
                const svgText = await response.text();
                this.resources[assetName] = svgText;
                return svgText;
                
            } else if (assetInfo.type === 'audio') {
                const soundName = assetName.replace('audio_', '');
                await this.audioManager.loadSound(soundName, assetInfo.url);
                this.resources[assetName] = { audioManager: this.audioManager, soundName: soundName };
                return this.resources[assetName];
            }
            
        } catch (error) {
            plog.warn(`Failed to lazy load asset ${assetName}: ${error.message}`);
            return null;
        }
    }

    createFallbackAsset(asset) {
        // Create simple fallback assets for essential resources
        plog.info(`Creating fallback for essential asset: ${asset.name}`);
        
        if (asset.type === 'texture' || asset.type === 'svg') {
            // Create a simple colored rectangle as fallback
            const canvas = document.createElement('canvas');
            canvas.width = ASSET_CONFIG.fallback.width;
            canvas.height = ASSET_CONFIG.fallback.height;
            const ctx = canvas.getContext('2d');
            
            // Different colors for different asset types
            if (asset.name.includes('planet')) {
                ctx.fillStyle = ASSET_CONFIG.fallback.colors.planet;
            } else if (asset.name.includes('bonus')) {
                ctx.fillStyle = ASSET_CONFIG.fallback.colors.bonus;
            } else if (asset.name.includes('ship')) {
                ctx.fillStyle = ASSET_CONFIG.fallback.colors.ship;
            } else {
                ctx.fillStyle = ASSET_CONFIG.fallback.colors.other;
            }
            
            ctx.fillRect(0, 0, ASSET_CONFIG.fallback.width, ASSET_CONFIG.fallback.height);
            ctx.strokeStyle = ASSET_CONFIG.fallback.borderColor;
            ctx.lineWidth = ASSET_CONFIG.fallback.borderWidth;
            const borderInset = ASSET_CONFIG.fallback.borderWidth / 2;
            ctx.strokeRect(
                borderInset,
                borderInset,
                ASSET_CONFIG.fallback.width - ASSET_CONFIG.fallback.borderWidth,
                ASSET_CONFIG.fallback.height - ASSET_CONFIG.fallback.borderWidth
            );
            
            // Add text label
            ctx.fillStyle = ASSET_CONFIG.fallback.borderColor;
            ctx.font = ASSET_CONFIG.fallback.labelFont;
            ctx.textAlign = 'center';
            ctx.fillText(
                asset.name.split('_').pop(),
                ASSET_CONFIG.fallback.width / 2,
                ASSET_CONFIG.fallback.height / 2 + 3
            );
            
            this.resources[asset.name] = canvas;
            
        } else if (asset.type === 'audio') {
            // Create a silent audio context as fallback
            this.resources[asset.name] = { audioManager: this.audioManager, soundName: 'silent' };
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
            const metadataResponse = await fetch(penguinAnimationAssetPath(animationType, 'metadata'));
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
