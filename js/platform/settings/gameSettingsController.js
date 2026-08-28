import { SETTINGS_CONFIG } from '../../config/settingsConfig.js';
import { StellarTrackStore } from '../persistence/stellarTrackStore.js';
import { LocalSettingsStore } from './settingsStore.js';
import { SettingsManager } from './settingsManager.js';

/** Owns settings persistence and the browser-only Stellar MP3 workflow. */
export class GameSettingsController {
    constructor({ audioManager, onAimAssistDisabled, showMessage }) {
        this.audioManager = audioManager;
        this.showMessage = showMessage;
        this.stellarTrackStore = new StellarTrackStore();
        this.manager = new SettingsManager(
            SETTINGS_CONFIG,
            new LocalSettingsStore(SETTINGS_CONFIG.storageKey),
            {
                audioEnabled: value => audioManager?.setEnabled(value),
                backgroundMusicEnabled: value => audioManager?.setBackgroundMusicEnabled(value),
                masterVolume: value => audioManager?.setMasterVolume(value),
                aimAssistEnabled: value => { if (!value) onAimAssistDisabled?.(); }
            }
        );
    }

    async change(definition, value) {
        if (definition.key !== 'stellarModeEnabled') {
            return this.manager.set(definition.key, value);
        }
        if (!value) {
            this.audioManager?.clearStellarTrack();
            await this.stellarTrackStore.clear();
            return this.manager.set(definition.key, false);
        }
        const file = await this.selectStellarMp3();
        const loaded = file && await this.audioManager?.loadStellarTrack(file);
        if (!loaded) {
            this.showMessage?.('We need a Stellar MP3 to continue.');
            return this.manager.set(definition.key, false);
        }
        if (!await this.stellarTrackStore.save(file)) {
            this.audioManager?.clearStellarTrack();
            this.showMessage?.('We could not save that Stellar MP3. Please check that browser storage is available.');
            return this.manager.set(definition.key, false);
        }
        return this.manager.set(definition.key, true);
    }

    async restore() {
        if (!this.manager.get('stellarModeEnabled')) return false;
        const file = await this.stellarTrackStore.load();
        const loaded = file && await this.audioManager?.loadStellarTrack(file);
        if (loaded) return true;
        this.manager.set('stellarModeEnabled', false);
        return false;
    }

    selectStellarMp3() {
        return new Promise(resolve => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.mp3,audio/mpeg';
            input.style.display = 'none';
            document.body.appendChild(input);
            let settled = false;
            const finish = file => {
                if (settled) return;
                settled = true;
                input.remove();
                resolve(file || null);
            };
            input.addEventListener('change', () => finish(input.files?.[0]));
            input.addEventListener('cancel', () => finish(null));
            input.click();
        });
    }
}

export default GameSettingsController;
