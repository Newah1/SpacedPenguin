import { deepFreeze } from './configUtils.js';

export const RUNTIME_CONFIG = deepFreeze({
    frameTiming: {
        maxDeltaSeconds: 1 / 30
    },
    mobileInstructionsFadeDelayMs: 5000,
    levelEndTransitionDelayMs: 500
});
