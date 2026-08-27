// Audio Manager for Spaced Penguin
// Handles loading and playing sound effects

import plog from './penguinLogger.js';
import { AUDIO_CONFIG, AudioCue, getAudioCue } from './config/audioConfig.js';

export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.sounds = new Map();
        this.masterVolume = AUDIO_CONFIG.defaultMasterVolume;
        this.enabled = true;
        this.soundEffectsEnabled = true;
        this.backgroundMusicEnabled = false;
        this.backgroundMusicDimmed = false;
        this.backgroundMusicSuppressed = false;
        this.backgroundMusicSource = null;
        this.backgroundMusicGain = null;
        this.backgroundMusicQueue = [];
        this.currentBackgroundTrack = null;
        this.stellarMusicBuffer = null;
        this.stellarMusicSource = null;
        this.stellarMusicGain = null;
        
        // Initialize audio context
        this.initAudioContext();
    }
    
    async initAudioContext() {
        try {
            // Create audio context with fallback for older browsers
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            
            // A gesture may still be required by browser autoplay policy. A
            // suspended context is valid and can load/decode assets normally.
            this.installAudioUnlockListeners();
            await this.resumeAudioContext();
            
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
            if (
                this.backgroundMusicEnabled &&
                AUDIO_CONFIG.backgroundMusic.trackIds.includes(name) &&
                !this.backgroundMusicSource
            ) {
                this.startBackgroundMusic();
            }
            
        } catch (error) {
            plog.error(`Failed to load sound ${name}:`, error);
        }
    }
    
    playSound(name, volume = 1.0, pitch = 1.0, loop = false) {
        if (!this.enabled || !this.soundEffectsEnabled || !this.audioContext || !this.sounds.has(name)) {
            plog.warn(`Cannot play sound: ${name} (enabled: ${this.enabled && this.soundEffectsEnabled}, loaded: ${this.sounds.has(name)})`);
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

    installAudioUnlockListeners() {
        if (typeof document === 'undefined' || this.audioUnlockHandler) return;
        this.audioUnlockHandler = () => this.resumeAudioContext();
        document.addEventListener('pointerdown', this.audioUnlockHandler, { passive: true });
        document.addEventListener('keydown', this.audioUnlockHandler);
    }

    removeAudioUnlockListeners() {
        if (typeof document === 'undefined' || !this.audioUnlockHandler) return;
        document.removeEventListener('pointerdown', this.audioUnlockHandler);
        document.removeEventListener('keydown', this.audioUnlockHandler);
        this.audioUnlockHandler = null;
    }

    async resumeAudioContext() {
        if (!this.audioContext || this.audioContext.state !== 'suspended') return;
        try {
            await this.audioContext.resume();
            if (this.audioContext.state === 'running') this.removeAudioUnlockListeners();
        } catch (error) {
            plog.debug('Audio context is waiting for a user gesture:', error);
        }
    }

    playCue(cue, overrides = {}) {
        const configured = getAudioCue(cue);
        if (!configured) {
            plog.warn(`Unknown audio cue: ${cue}`);
            return null;
        }
        return this.playSound(
            configured.soundId,
            overrides.volume ?? configured.volume,
            overrides.pitch ?? configured.pitch,
            overrides.loop ?? configured.loop
        );
    }
    
    // Convenience methods for specific game sounds
    playLaunch() {
        this.playCue(AudioCue.LAUNCH);
    }
    
    playBonus() {
        this.playCue(AudioCue.BONUS);
    }
    
    playHitPlanet() {
        this.playCue(AudioCue.HIT_PLANET);
    }
    
    playEnterShip() {
        this.playCue(AudioCue.ENTER_SHIP);
    }
    
    playArp() {
        this.playCue(AudioCue.ARP);
    }
    
    // Volume control
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        this.updateBackgroundMusicVolume(false);
        this.updateStellarMusicVolume(false);
        plog.audio(`Master volume set to: ${this.masterVolume}`);
    }
    
    // Enable/disable audio
    setEnabled(enabled) {
        this.soundEffectsEnabled = Boolean(enabled);
        if (this.soundEffectsEnabled) {
            this.resumeAudioContext();
        }
        plog.audio(`Sound effects ${enabled ? 'enabled' : 'disabled'}`);
    }

    setBackgroundMusicEnabled(enabled) {
        this.backgroundMusicEnabled = Boolean(enabled);
        if (this.backgroundMusicEnabled && this.enabled) {
            this.resumeAudioContext();
            this.startBackgroundMusic();
        } else {
            this.stopBackgroundMusic();
        }
    }

    setBackgroundMusicDimmed(dimmed) {
        this.backgroundMusicDimmed = Boolean(dimmed);
        this.updateBackgroundMusicVolume(true);
    }

    getBackgroundMusicVolume() {
        const config = AUDIO_CONFIG.backgroundMusic;
        if (this.backgroundMusicSuppressed) return 0;
        const multiplier = this.backgroundMusicDimmed ? config.menuVolumeMultiplier : 1;
        return config.volume * multiplier * this.masterVolume;
    }

    updateBackgroundMusicVolume(animate = true, fadeSeconds = AUDIO_CONFIG.backgroundMusic.fadeSeconds) {
        const gain = this.backgroundMusicGain?.gain;
        if (!gain) return;
        const volume = this.getBackgroundMusicVolume();
        const now = this.audioContext?.currentTime ?? 0;
        gain.cancelScheduledValues?.(now);
        gain.setValueAtTime?.(gain.value, now);
        if (animate && gain.linearRampToValueAtTime) {
            gain.linearRampToValueAtTime(volume, now + fadeSeconds);
        } else if (gain.setValueAtTime) {
            gain.setValueAtTime(volume, now);
        } else {
            gain.value = volume;
        }
    }

    setBackgroundMusicSuppressed(suppressed) {
        const nextValue = Boolean(suppressed);
        if (this.backgroundMusicSuppressed === nextValue) return;
        this.backgroundMusicSuppressed = nextValue;
        this.updateBackgroundMusicVolume(true, AUDIO_CONFIG.stellarMusic.fadeSeconds);
    }

    refillBackgroundMusicQueue() {
        const tracks = AUDIO_CONFIG.backgroundMusic.trackIds.filter(track => this.sounds.has(track));
        for (let index = tracks.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [tracks[index], tracks[swapIndex]] = [tracks[swapIndex], tracks[index]];
        }
        if (tracks.length > 1 && tracks[0] === this.currentBackgroundTrack) {
            [tracks[0], tracks[1]] = [tracks[1], tracks[0]];
        }
        this.backgroundMusicQueue = tracks;
    }

    startBackgroundMusic() {
        if (!this.enabled || !this.backgroundMusicEnabled || this.backgroundMusicSource) return;
        if (!this.backgroundMusicQueue.length) this.refillBackgroundMusicQueue();
        const track = this.backgroundMusicQueue.shift();
        if (!track || !this.audioContext) return;

        try {
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            source.buffer = this.sounds.get(track);
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            this.backgroundMusicSource = source;
            this.backgroundMusicGain = gainNode;
            this.currentBackgroundTrack = track;
            this.updateBackgroundMusicVolume(false);
            source.onended = () => {
                if (this.backgroundMusicSource !== source) return;
                this.backgroundMusicSource = null;
                this.backgroundMusicGain = null;
                this.startBackgroundMusic();
            };
            source.start(0);
            plog.audio(`Playing background music: ${track}`);
        } catch (error) {
            this.backgroundMusicSource = null;
            this.backgroundMusicGain = null;
            plog.error(`Failed to play background music ${track}:`, error);
        }
    }

    stopBackgroundMusic() {
        const source = this.backgroundMusicSource;
        this.backgroundMusicSource = null;
        this.backgroundMusicGain = null;
        if (!source) return;
        source.onended = null;
        this.stopSound(source);
    }

    isBackgroundMusicPlaying() {
        return Boolean(this.backgroundMusicSource);
    }

    async loadStellarTrack(file) {
        if (!this.enabled || !this.audioContext || !file) return false;
        const isMp3 = file.type === 'audio/mpeg' || /\.mp3$/i.test(file.name || '');
        if (!isMp3) return false;

        try {
            this.stopStellarMusic();
            const arrayBuffer = await file.arrayBuffer();
            this.stellarMusicBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            await this.resumeAudioContext();
            return true;
        } catch (error) {
            this.stellarMusicBuffer = null;
            plog.error('Failed to load Stellar Mode MP3:', error);
            return false;
        }
    }

    clearStellarTrack() {
        this.stopStellarMusic();
        this.stellarMusicBuffer = null;
    }

    playStellarMusic() {
        if (!this.enabled || !this.audioContext || !this.stellarMusicBuffer || this.stellarMusicSource) {
            return false;
        }

        try {
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            const now = this.audioContext.currentTime;
            const config = AUDIO_CONFIG.stellarMusic;
            source.buffer = this.stellarMusicBuffer;
            source.loop = true;
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(config.volume * this.masterVolume, now + config.fadeSeconds);
            source.onended = () => {
                if (this.stellarMusicSource !== source) return;
                this.stellarMusicSource = null;
                this.stellarMusicGain = null;
            };
            this.stellarMusicSource = source;
            this.stellarMusicGain = gainNode;
            this.setBackgroundMusicSuppressed(true);
            source.start(0);
            plog.audio('Playing Stellar Mode music');
            return true;
        } catch (error) {
            this.stellarMusicSource = null;
            this.stellarMusicGain = null;
            this.setBackgroundMusicSuppressed(false);
            plog.error('Failed to play Stellar Mode music:', error);
            return false;
        }
    }

    updateStellarMusicVolume(animate = true) {
        const gain = this.stellarMusicGain?.gain;
        if (!gain) return;
        const now = this.audioContext?.currentTime ?? 0;
        const volume = AUDIO_CONFIG.stellarMusic.volume * this.masterVolume;
        gain.cancelScheduledValues?.(now);
        gain.setValueAtTime?.(gain.value, now);
        if (animate && gain.linearRampToValueAtTime) {
            gain.linearRampToValueAtTime(volume, now + AUDIO_CONFIG.stellarMusic.fadeSeconds);
        } else if (gain.setValueAtTime) {
            gain.setValueAtTime(volume, now);
        } else {
            gain.value = volume;
        }
    }

    stopStellarMusic() {
        const source = this.stellarMusicSource;
        this.stellarMusicSource = null;
        this.stellarMusicGain = null;
        this.setBackgroundMusicSuppressed(false);
        if (!source) return;
        source.onended = null;
        this.stopSound(source);
    }

    isStellarMusicPlaying() {
        return Boolean(this.stellarMusicSource);
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
