// Audio Manager for Spaced Penguin
// Handles loading and playing sound effects

import plog from './penguinLogger.js';

export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.sounds = new Map();
        this.masterVolume = 0.7; // Default volume
        this.enabled = true;
        
        // Initialize audio context
        this.initAudioContext();
    }
    
    async initAudioContext() {
        try {
            // Create audio context with fallback for older browsers
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            
            // Resume context if it's suspended (required for autoplay policies)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            plog.audio('Audio context initialized successfully');
        } catch (error) {
            plog.warn('Failed to initialize audio context:', error);
            this.enabled = false;
        }
    }
    
    async loadSound(name, url) {
        if (!this.enabled || !this.audioContext) {
            plog.warn('Audio not enabled, skipping sound load:', name);
            return;
        }
        
        try {
            plog.audio(`Loading sound: ${name} from ${url}`);
            
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            this.sounds.set(name, audioBuffer);
            plog.audio(`Sound loaded successfully: ${name}`);
            
        } catch (error) {
            plog.error(`Failed to load sound ${name}:`, error);
        }
    }
    
    playSound(name, volume = 1.0, pitch = 1.0, loop = false) {
        if (!this.enabled || !this.audioContext || !this.sounds.has(name)) {
            plog.warn(`Cannot play sound: ${name} (enabled: ${this.enabled}, loaded: ${this.sounds.has(name)})`);
            return null;
        }
        
        try {
            const audioBuffer = this.sounds.get(name);
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            // Set up audio graph
            source.buffer = audioBuffer;
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // Apply volume and pitch
            gainNode.gain.value = volume * this.masterVolume;
            source.playbackRate.value = pitch;
            
            // Set looping
            source.loop = loop;
            
            // Play the sound
            source.start(0);
            
            plog.audio(`Playing sound: ${name} (volume: ${volume}, pitch: ${pitch}, loop: ${loop})`);
            
            // Return source for stopping looped sounds
            return source;
            
        } catch (error) {
            plog.error(`Failed to play sound ${name}:`, error);
            return null;
        }
    }
    
    stopSound(source) {
        if (source) {
            try {
                source.stop();
            } catch (error) {
                plog.warn('Error stopping sound:', error);
            }
        }
    }
    
    // Convenience methods for specific game sounds
    playLaunch() {
        this.playSound('17_snd_launch', 0.8);
    }
    
    playBonus() {
        this.playSound('16_snd_bonus', 0.9);
    }
    
    playHitPlanet() {
        this.playSound('20_snd_HitPlanet', 0.7);
    }
    
    playEnterShip() {
        this.playSound('21_snd_enterShip', 0.8);
    }
    
    playArp() {
        this.playSound('15_Arp', 0.6);
    }
    
    // Volume control
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        plog.audio(`Master volume set to: ${this.masterVolume}`);
    }
    
    // Enable/disable audio
    setEnabled(enabled) {
        this.enabled = enabled;
        plog.audio(`Audio ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    // Get loaded sounds count
    getLoadedSoundsCount() {
        return this.sounds.size;
    }
    
    // Check if a sound is loaded
    isSoundLoaded(name) {
        return this.sounds.has(name);
    }
} 