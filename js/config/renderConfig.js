import { deepFreeze } from './configUtils.js';

export const RENDER_CONFIG = deepFreeze({
    camera: {
        deadZoneRatio: 0.6,
        easing: 7,
        lookAheadSeconds: 0.18,
        maximumLookAhead: 100,
        portraitZoom: 1.7,
        portraitDeadZoneRatio: 0.42,
        playfieldBorderColor: 'rgba(81, 239, 255, 0.65)',
        playfieldBorderWidth: 2
    },
    layers: {
        bonus: 1,
        planet: 2,
        slingshot: 3,
        target: 4,
        portal: 4.5,
        speedBooster: 4.6,
        penguin: 5,
        arrow: 6,
        popup: 7,
        text: 8,
        pointingArrow: 9
    },
    entities: {
        planetMassColors: [
            { below: 50, color: '#00FFFF' },
            { below: 100, color: '#0000FF' },
            { below: 200, color: '#FF00FF' },
            { below: 400, color: '#FF0000' },
            { below: 600, color: '#FFFF00' },
            { below: 800, color: '#00FF00' }
        ],
        planetFallbackColor: '#C8C8C8',
        bonusValueColors: [
            { below: 100, color: '#00FF00' },
            { below: 500, color: '#FFFF00' },
            { below: 1000, color: '#FF8000' },
            { below: 5000, color: '#FF0000' }
        ],
        bonusFallbackColor: '#FF00FF',
        bonus: {
            rotationSpeed: 3,
            collectedRotationSpeed: 30,
            rotationDecayPerLegacyFrame: 0.1,
            pulseSpeed: 0.1,
            pulseAmplitude: 0.2,
            pulseBaseAlpha: 0.8,
            spriteScale: 0.8
        },
        targetHitFrames: 30,
        arrow: {
            initialSize: 20,
            color: '#00FFFF',
            glowColor: '#0099FF',
            shadowBlur: 10,
            lineWidth: 2,
            shaftWidth: 10,
            headLength: 15,
            headWidth: 15
        },
        pointingArrow: {
            initialSize: 20,
            shadowBlur: 10,
            lineWidth: 2,
            shaftWidth: 8,
            headLength: 12,
            headWidth: 12
        },
        portal: {
            red: '#ff3b4f',
            blue: '#2f8cff',
            aperture: '#050814',
            glowBlur: 14,
            rimWidth: 3,
            particleCount: 9,
            particleRadius: 1.6,
            transitionSeconds: 0.14
        },
        speedBooster: {
            fill: '#164b71',
            border: '#71edff',
            arrow: '#f7fbff',
            glowBlur: 10,
            borderWidth: 2,
            arrowCount: 3,
            marqueePixelsPerSecond: 24
        },
        slingshot: {
            size: 100,
            rubberBandColor: '#FFFF00',
            hoopColor: '#00FFFF',
            glowColor: '#0099FF',
            hoopRadiusX: 16,
            hoopRadiusY: 29,
            lineWidth: 3,
            shadowBlur: 10,
            spriteRegistrationScale: 1.5
        }
    },
    kevinCam: {
        widthRatio: 0.22,
        aspectRatio: 4 / 3,
        minWidth: 140,
        maxWidth: 200,
        margin: 12,
        headerHeight: 25,
        zoom: 2.2,
        shadowColor: '#00d9ff',
        shadowBlur: 10,
        backgroundColor: 'rgba(0, 8, 24, 0.94)',
        headerColor: '#13224a',
        label: 'kEvIn cAm',
        labelColors: ['#7dfffb', '#ffef65', '#ff70d7'],
        labelFont: 'bold 16px "Comic Sans MS", "Comic Sans", cursive',
        labelLetterSpacing: 13,
        starColor: '#ffffff',
        starCount: 28,
        borderColor: '#51efff',
        borderWidth: 3
    },
    starfield: {
        count: 100,
        minimumDistance: 12,
        placementAttempts: 20,
        minimumSize: 1,
        sizeVariants: 3,
        drift: { x: 3, y: 1 },
        color: '#FFFFFF',
        baseAlpha: 0.35,
        sizeAlpha: 0.2
    },
    shotTrails: {
        colors: ['#00FFFF', '#0000FF', '#FF00FF', '#FF0000', '#FFFF00', '#00FF00', '#C8C8C8'],
        lineWidth: 1,
        completedAlpha: 0.9,
        activeAlpha: 0.7,
        alphaMaskHistory: 3,
        maximumCompletedPaths: 7
    },
    aimAssist: {
        color: '#9ffcff',
        lineWidth: 2,
        alpha: 0.58,
        dash: [4, 7],
        glowBlur: 7
    },
    penguin: {
        renderOrder: 5,
        trailLength: 20,
        animationFrameMinimum: 0,
        animationFrameMaximum: 11,
        crashAnimationStride: 4,
        spinAnimationStride: 8,
        crashedDurationSeconds: 3,
        spriteScale: 1.2,
        colorKeyTolerance: 30,
        animation: {
            minimumSpeed: 0.1,
            maximumSpeed: 0.3,
            velocityDivisor: 1000,
            horizontalBias: 1.5,
            verticalBias: 0.5
        },
        trail: {
            color: '#FFFFFF',
            lineWidth: 2,
            maximumAlpha: 0.5,
            maximumPoints: 1000
        }
    }
});
