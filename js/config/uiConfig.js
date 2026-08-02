import { deepFreeze } from './configUtils.js';

export const UI_CONFIG = deepFreeze({
    fonts: {
        primary: 'Verdana, sans-serif',
        system: 'Arial, sans-serif',
        monospace: 'Courier New, monospace'
    },
    components: {
        overlayColor: 'rgba(0, 0, 0, 0.7)',
        panelBackground: '#2C2C2C',
        panelBorder: '#FFFFCC',
        panelBorderWidth: 2,
        animatedNumberSpeed: 25,
        textColor: '#FFFFCC'
    },
    levelEnd: {
        overlayColor: 'rgba(0, 0, 0, 0.8)',
        accentColor: '#cb7928',
        panelColor: '#f5e4aa',
        panel: { width: 400, height: 400, cornerRadius: 10, borderWidth: 5 },
        titleOffsetY: 30,
        formulaOffsetY: 60,
        skipOffsetBottom: 25,
        tableOffsetY: 95,
        tableInsetX: 30,
        lineHeight: 25,
        button: { width: 100, height: 30, spacing: 20, offsetBottom: 70 },
        animation: {
            stepPauseMs: 50,
            finalPauseMs: 100,
            immediateCompletionMs: 10,
            immediateScoreThreshold: 5000,
            minimumTotalScoreSpeed: 100000,
            totalScoreSpeedMultiplier: 1000
        }
    }
});
