import { deepFreeze } from './configUtils.js';
import { AUDIO_CONFIG } from './audioConfig.js';

export const SettingType = Object.freeze({
    BOOLEAN: 'boolean',
    NUMBER: 'number'
});

export const SETTINGS_CONFIG = deepFreeze({
    storageKey: 'spacedPenguinSettings',
    title: 'SETTINGS',
    settings: [
        {
            key: 'aimAssistEnabled',
            type: SettingType.BOOLEAN,
            label: 'Aim assist',
            description: 'Show a short, dynamic trajectory preview while aiming.',
            defaultValue: false,
            effect: 'aimAssistEnabled'
        },
        {
            key: 'soundEnabled',
            type: SettingType.BOOLEAN,
            label: 'Sound effects',
            description: 'Enable game audio.',
            defaultValue: true,
            effect: 'audioEnabled'
        },
        {
            key: 'masterVolume',
            type: SettingType.NUMBER,
            label: 'Master volume',
            description: 'Set the volume for all game sounds.',
            defaultValue: AUDIO_CONFIG.defaultMasterVolume,
            min: 0,
            max: 1,
            step: 0.05,
            format: 'percent',
            effect: 'masterVolume'
        }
    ]
});
