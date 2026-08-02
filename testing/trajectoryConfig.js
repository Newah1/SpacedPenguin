import { deepFreeze } from '../js/config/configUtils.js';

export const TRAJECTORY_CONFIG = deepFreeze({
    simulation: {
        maximumTimeSeconds: 120,
        captureStrideSteps: 10
    },
    sweep: {
        angleRange: [0, 360],
        powerRange: [10, 100],
        samples: 100,
        progressBuckets: 10,
        minimumProgressInterval: 10
    },
    workers: {
        maximum: 4,
        automaticSampleThreshold: 5000
    },
    ascii: {
        width: 80,
        height: 24,
        resultLimit: 5,
        fingerprintSamples: 16,
        routeClosenessThreshold: 24
    }
});
