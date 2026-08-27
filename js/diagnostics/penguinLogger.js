class PenguinLogger {
    constructor() {
        this.enabled = false;
        this.flipperWaves = ['🐧', '🐧👋', '🐧🏊', '🐧✨', '🐧🚀', '🐧⭐'];
        this.currentWaveIndex = 0;
        
        // Fun penguin messages for different log types
        this.penguinPhrases = {
            info: ['🐧 Waddle waddle:', '🐧 Flipper report:', '🐧 Ice update:', '🐧 Fishy news:'],
            debug: ['🐧🔍 Detective penguin says:', '🐧🧠 Brain freeze check:', '🐧⚙️ Under the hood:'],
            warn: ['🐧⚠️ Penguin alarm!', '🐧🌨️ Slippery ice ahead:', '🐧😰 Uh oh, flipper trouble:'],
            error: ['🐧💥 CRASH! Penguin down!', '🐧🆘 Emergency waddle:', '🐧❄️ Ice cold error:'],
            success: ['🐧🎉 Victory waddle!', '🐧✅ Mission accomplished!', '🐧🏆 Penguin champion!']
        };
        
        // Initialize keyboard listener
        this.initializeToggle();
        
        // Show initial status
        this.showStatus();
    }
    
    initializeToggle() {
        document.addEventListener('keydown', (event) => {
            // Toggle with Ctrl+Shift+P (P for Penguin!)
            if (event.ctrlKey && event.shiftKey && event.key === 'P') {
                this.toggle();
                event.preventDefault();
            }
        });
    }
    
    toggle() {
        this.enabled = !this.enabled;
        this.showStatus();
        
        if (this.enabled) {
            // Fun enable message
            console.log('🐧🎮 PENGUIN LOGGER ACTIVATED! 🎮🐧');
            console.log('🐧 Ready to waddle through your logs!');
            console.log('🐧 Press Ctrl+Shift+P again to make me go back to my ice cave');
        }
    }
    
    showStatus() {
        if (this.enabled) {
            console.log(`🐧 Penguin Logger: ON ${this.getNextWave()}`);
        } else {
            // Only show this once when toggling off, not on page load
            if (this.currentWaveIndex > 0) {
                console.log('🐧💤 Penguin Logger: Sleeping in ice cave... (Press Ctrl+Shift+P to wake me up!)');
            }
        }
    }
    
    getNextWave() {
        const wave = this.flipperWaves[this.currentWaveIndex];
        this.currentWaveIndex = (this.currentWaveIndex + 1) % this.flipperWaves.length;
        return wave;
    }
    
    getRandomPhrase(type) {
        const phrases = this.penguinPhrases[type] || this.penguinPhrases.info;
        return phrases[Math.floor(Math.random() * phrases.length)];
    }
    
    log(...args) {
        if (this.enabled) {
            console.log(this.getRandomPhrase('info'), ...args);
        }
    }
    
    info(...args) {
        if (this.enabled) {
            console.info(this.getRandomPhrase('info'), ...args);
        }
    }
    
    debug(...args) {
        if (this.enabled) {
            console.debug(this.getRandomPhrase('debug'), ...args);
        }
    }
    
    warn(...args) {
        if (this.enabled) {
            console.warn(this.getRandomPhrase('warn'), ...args);
        }
    }
    
    error(...args) {
        if (this.enabled) {
            console.error(this.getRandomPhrase('error'), ...args);
        }
    }
    
    success(...args) {
        if (this.enabled) {
            console.log(this.getRandomPhrase('success'), ...args);
        }
    }
    
    // Special themed methods
    waddle(...args) {
        if (this.enabled) {
            console.log('🐧👣 *waddle waddle*', ...args);
        }
    }
    
    splash(...args) {
        if (this.enabled) {
            console.log('🐧💦 *splash*', ...args);
        }
    }
    
    soar(...args) {
        if (this.enabled) {
            console.log('🐧🚀 *WHOOSH*', ...args);
        }
    }
    
    crash(...args) {
        if (this.enabled) {
            console.log('🐧💥 *BONK*', ...args);
        }
    }
    
    physics(...args) {
        if (this.enabled) {
            console.log('🐧⚡ *gravity magic*', ...args);
        }
    }
    
    bonus(...args) {
        if (this.enabled) {
            console.log('🐧✨ *shiny fish collected*', ...args);
        }
    }
    
    audio(...args) {
        if (this.enabled) {
            console.log('🐧🔊 *penguin sounds*', ...args);
        }
    }
    
    level(...args) {
        if (this.enabled) {
            console.log('🐧🗺️ *exploring new territory*', ...args);
        }
    }
}

// Create global instance
const plog = new PenguinLogger();

// Export for ES6 modules
export default plog;