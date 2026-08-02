// Node.js shims for browser-specific functionality
// Provides minimal implementations to make browser modules work in Node.js

import { WORLD_CONFIG } from '../js/config/gameConfig.js';

// Global shims used when importing production browser modules in Node tests.
globalThis.window = {
    innerWidth: WORLD_CONFIG.stage.width,
    innerHeight: WORLD_CONFIG.stage.height,
    addEventListener() {},
    removeEventListener() {}
};
Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node' },
    configurable: true
});
globalThis.document = {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
    getElementById: () => null,
    createElement: () => ({ 
        getContext: () => null,
        addEventListener() {},
        removeEventListener() {},
        appendChild() {},
        style: {},
        width: 0,
        height: 0
    })
};
globalThis.Image = class MockImage {};

// Canvas-like object for fallback rendering
export class MockCanvas {
    constructor(width = WORLD_CONFIG.stage.width, height = WORLD_CONFIG.stage.height) {
        this.width = width;
        this.height = height;
    }
    
    getContext() {
        return new MockContext();
    }
}

export class MockContext {
    save() {}
    restore() {}
    translate() {}
    rotate() {}
    fillRect() {}
    strokeRect() {}
    beginPath() {}
    arc() {}
    fill() {}
    stroke() {}
    fillText() {}
    set fillStyle(value) {}
    set strokeStyle(value) {}
    set lineWidth(value) {}
    set font(value) {}
    set textAlign(value) {}
}

// Mock audio manager for Node.js
export class MockAudioManager {
    constructor() {
        this.sounds = new Map();
    }
    
    async loadSound(name, url) {
        this.sounds.set(name, { loaded: true });
        return true;
    }
    
    playSound(name, volume = 1.0, pitch = 1.0, loop = false) {
        return { stop: () => {} };
    }
    
    stopSound() {}
    setMasterVolume() {}
}

// Mock logger for Node.js
export const mockLogger = {
    info: console.log,
    warn: console.warn,
    error: console.error,
    success: console.log,
    debug: () => {}, // Silent debug in testing
    waddle: console.log,
    audio: () => {} // Silent audio logs
};

export default {
    MockCanvas,
    MockContext,
    MockAudioManager,
    mockLogger
};
