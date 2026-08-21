import { deepFreeze } from './configUtils.js';

export const AudioCue = Object.freeze({
    ARP: 'arp',
    BONUS: 'bonus',
    LAUNCH: 'launch',
    HIT_PLANET: 'hitPlanet',
    ENTER_SHIP: 'enterShip',
    PORTAL_WOOSH: 'portalWoosh'
});

export const AUDIO_CONFIG = deepFreeze({
    defaultMasterVolume: 0.7,
    scoringLoopVolume: 0.6,
    backgroundMusic: {
        trackIds: ['bgm_penguins_ska', 'bgm_penguins_ska_2', 'bgm_penguins_drum'],
        volume: 0.55,
        menuVolumeMultiplier: 0.25,
        fadeSeconds: 0.25
    },
    stellarMusic: {
        volume: 0.7,
        fadeSeconds: 1
    },
    cues: {
        [AudioCue.ARP]: { soundId: '15_Arp', volume: 0.6, pitch: 1, loop: false },
        [AudioCue.BONUS]: { soundId: '16_snd_bonus', volume: 0.9, pitch: 1, loop: false },
        [AudioCue.LAUNCH]: { soundId: '17_snd_launch', volume: 0.8, pitch: 1, loop: false },
        [AudioCue.HIT_PLANET]: { soundId: '20_snd_HitPlanet', volume: 0.7, pitch: 1, loop: false },
        [AudioCue.ENTER_SHIP]: { soundId: '21_snd_enterShip', volume: 0.8, pitch: 1, loop: false },
        [AudioCue.PORTAL_WOOSH]: { soundId: 'portal_woosh', volume: 0.8, pitch: 1, loop: false }
    }
});

export function getAudioCue(cue) {
    return AUDIO_CONFIG.cues[cue] ?? null;
}
