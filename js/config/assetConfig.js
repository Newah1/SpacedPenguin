import { deepFreeze } from './configUtils.js';

export const ASSET_CONFIG = deepFreeze({
    root: 'assets',
    manifest: 'manifest.json',
    typesByExtension: {
        '.svg': 'svg',
        '.wav': 'audio',
        '.mp3': 'audio',
        '.ogg': 'audio'
    },
    fallback: {
        width: 64,
        height: 64,
        colors: {
            planet: '#888888',
            bonus: '#FFD700',
            ship: '#4A90E2',
            other: '#FF6B6B'
        },
        borderColor: '#000000',
        borderWidth: 2,
        labelFont: '10px Arial'
    }
});

export function assetPath(relativePath) {
    return `${ASSET_CONFIG.root}/${relativePath}`;
}

export function assetTypeForPath(path) {
    const lower = path.toLowerCase();
    const entry = Object.entries(ASSET_CONFIG.typesByExtension)
        .find(([extension]) => lower.endsWith(extension));
    return entry?.[1] ?? 'texture';
}

export function penguinAnimationAssetPath(animationType, artifact = 'sheet') {
    const suffix = artifact === 'metadata' ? 'metadata.json' : 'sheet.png';
    return assetPath(`animations/penguin_spin_${animationType}_${suffix}`);
}

