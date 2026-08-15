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
    modal: {
        overlayColor: 'rgba(0, 0, 0, 0.78)',
        panel: {
            width: 440,
            minHeight: 220,
            padding: 32,
            cornerRadius: 12,
            backgroundColor: '#211b18',
            borderColor: '#cb7928',
            borderWidth: 4
        },
        titleColor: '#f5e4aa',
        messageColor: '#fff6d6',
        titleSize: 26,
        messageSize: 16,
        messageLineHeight: 24,
        button: {
            width: 150,
            height: 44,
            gap: 20,
            backgroundColor: '#4b3b32',
            confirmColor: '#9b3d2f',
            borderColor: '#e9c27a',
            focusBorderColor: '#ffffff',
            textColor: '#fff6d6',
            fontSize: 15
        }
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
        button: {
            width: 100,
            height: 30,
            spacing: 20,
            offsetBottom: 70,
            backgroundColor: '#cb7928',
            hoverColor: '#f0ad5a',
            activeColor: '#a96520'
        },
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
