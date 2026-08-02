import { deepFreeze } from './configUtils.js';

export const EDITOR_CONFIG = deepFreeze({
    authoringDefaults: {
        planet: {
            radius: 50,
            mass: 1000,
            gravitationalReach: 0,
            planetType: 'planet_grey'
        },
        bonus: { value: 100 },
        slingshot: { maxPullback: 150 },
        orbit: {
            radius: 100,
            speed: 1,
            gravityStrength: 5000,
            initialVelocity: { x: 0, y: 3 }
        }
    },
    cloneOffset: { x: 50, y: 50 },
    deserializationFallbacks: {
        textContent: 'Text',
        textColor: '#FFFFFF'
    },
    interaction: {
        longPressMs: 500,
        deferredListenerMs: 100,
        orbitVerificationMs: 100,
        orbitCenterHitRadius: { pointer: 10, touch: 15 },
        minimumTouchTargetRadius: 30
    },
    orbitReset: {
        minimumInitialDistance: 50,
        maximumInitialDistance: 400,
        fallbackInitialDistance: 150
    },
    overlay: {
        gridSize: 50,
        figure8StepRadians: 0.1,
        gravityPreviewRadius: 100,
        velocityVectorScale: 2
    }
});
