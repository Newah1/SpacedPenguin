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
            key: 'kevinCamEnabled',
            type: SettingType.BOOLEAN,
            label: 'Kevin Cam',
            description: 'Show the Kevin Cam inset while Kevin is off-screen.',
            defaultValue: true
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
            key: 'experimentalBackgroundMusic',
            type: SettingType.BOOLEAN,
            label: 'Experimental background music',
            description: 'Shuffle the new soundtrack while you play.',
            defaultValue: false,
            effect: 'backgroundMusicEnabled'
        },
        {
            key: 'stellarModeEnabled',
            type: SettingType.BOOLEAN,
            label: 'Stellar Mode',
            description: 'Fade in your MP3 when a flight lasts long enough to unlock 2× speed.',
            defaultValue: false
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
