import { deepFreeze } from './configUtils.js';

export const RESPONSIVE_CONFIG = deepFreeze({
    mobileMaxWidth: 768,
    mobileMaxHeight: 1024,
    editorCompactBreakpoint: 768
});

export const INPUT_CONFIG = deepFreeze({
    tapMaxDurationMs: {
        menu: 300,
        ui: 500
    },
    orientationSettleMs: 100,
    hapticsMs: {
        contextMenu: 100,
        selection: 50,
        objectListSelection: 30,
        mobileControl: 50
    }
});

const MOBILE_USER_AGENT = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export function isMobileViewport({
    userAgent = globalThis.navigator?.userAgent || '',
    width = globalThis.window?.innerWidth ?? Infinity,
    height = globalThis.window?.innerHeight ?? Infinity
} = {}) {
    return MOBILE_USER_AGENT.test(userAgent) || (
        width <= RESPONSIVE_CONFIG.mobileMaxWidth &&
        height <= RESPONSIVE_CONFIG.mobileMaxHeight
    );
}

export function isCompactEditorViewport(width = globalThis.window?.innerWidth ?? Infinity) {
    return width < RESPONSIVE_CONFIG.editorCompactBreakpoint;
}

export function isTouchViewport(target = globalThis.window) {
    return Boolean(target && 'ontouchstart' in target);
}

