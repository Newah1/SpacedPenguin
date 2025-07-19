// Asset Loader for Spaced Penguin
// Handles loading manifest, assets, and creating animations

export class AssetLoader {
    constructor() {
        this.manifest = null;
        this.resources = {};
        this.assetsToLoad = [];
        this.onComplete = null;
        this.onProgress = null;
        this.loadedCount = 0;
        this.totalCount = 0;
    }

    async loadAssets(onComplete, onProgress) {
        this.onComplete = onComplete;
        this.onProgress = onProgress;

        try {
            // Load manifest first
            console.log('Loading asset manifest...');
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
            this.assetsToLoad.push({ name: `ui_${name}`, url: `assets/${path}`, type: 'texture' });
        });

        // Add planet assets
        Object.entries(this.manifest.planets).forEach(([name, path]) => {
            this.assetsToLoad.push({ name: `planet_${name}`, url: `assets/${path}`, type: 'texture' });
        });

        // Add sprite assets
        Object.entries(this.manifest.sprites).forEach(([name, path]) => {
            this.assetsToLoad.push({ name: `sprite_${name}`, url: `assets/${path}`, type: 'texture' });
        });

        // Add audio assets (we'll handle these differently)
        Object.entries(this.manifest.audio).forEach(([name, path]) => {
            this.assetsToLoad.push({ name: `audio_${name}`, url: `assets/${path}`, type: 'audio' });
        });
        
        this.totalCount = this.assetsToLoad.length;
        console.log(`Prepared ${this.totalCount} assets to load`);
    }

    async loadAllAssets() {
        console.log(`Loading ${this.totalCount} assets...`);
        
        for (const asset of this.assetsToLoad) {
            try {
                if (asset.type === 'texture') {
                    const texture = await PIXI.Assets.load(asset.url);
                    this.resources[asset.name] = { texture };
                } else if (asset.type === 'audio') {
                    // For audio, we'll just store the URL for now
                    this.resources[asset.name] = { url: asset.url };
                }
                
                this.loadedCount++;
                const progress = (this.loadedCount / this.totalCount) * 100;
                
                console.log(`Loaded: ${asset.name} (${this.loadedCount}/${this.totalCount})`);
                
                if (this.onProgress) {
                    this.onProgress(progress, asset.name);
                }
                
            } catch (error) {
                console.error(`Error loading asset ${asset.name}:`, error);
            }
        }
        
        console.log('All assets loaded');
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
            
            // Create textures from sprite sheet
            const baseTexture = this.resources[animationName].texture.baseTexture;
            const frames = [];
            
            for (let i = 0; i < metadata.frame_count; i++) {
                const rect = new PIXI.Rectangle(
                    i * metadata.frame_width,
                    0,
                    metadata.frame_width,
                    metadata.frame_height
                );
                const texture = new PIXI.Texture(baseTexture, rect);
                frames.push(texture);
            }
            
            // Create animated sprite
            const animatedSprite = new PIXI.AnimatedSprite(frames);
            
            // Set animation properties
            animatedSprite.animationSpeed = 0.15; // Adjust as needed
            animatedSprite.loop = true;
            
            // Set anchor point based on registration points from metadata
            // Use the first frame's registration point as the anchor
            const regPoint = metadata.registration_points[0];
            animatedSprite.anchor.set(
                regPoint[0] / metadata.frame_width,
                regPoint[1] / metadata.frame_height
            );
            
            // Store metadata for later use
            animatedSprite.metadata = metadata;
            animatedSprite.animationType = animationType;
            
            console.log(`Created penguin animation: ${animationType} (${metadata.frame_count} frames)`);
            return animatedSprite;
            
        } catch (error) {
            console.error(`Error creating penguin animation ${animationType}:`, error);
            return null;
        }
    }

    // Get a sprite by name
    getSprite(category, name) {
        const resourceName = `${category}_${name}`;
        if (this.resources[resourceName]) {
            return new PIXI.Sprite(this.resources[resourceName].texture);
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
        const titleContainer = new PIXI.Container();
        
        const spacedText = this.getUI('title_spaced');
        const penguinText = this.getUI('title_penguin');
        
        if (spacedText && penguinText) {
            // Position based on original registration points
            spacedText.x = 0;
            spacedText.y = 0;
            penguinText.x = 0;
            penguinText.y = spacedText.height + 10;
            
            titleContainer.addChild(spacedText);
            titleContainer.addChild(penguinText);
        }
        
        return titleContainer;
    }
}

// Export for use in other modules
window.AssetLoader = AssetLoader; 