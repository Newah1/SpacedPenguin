import './nodeShims.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LEVEL_COLLECTION_CONFIG,
    LEVEL_CATALOG_CONFIG,
    LEVEL_DEFAULTS,
    PHYSICS_CONFIG,
    SIMULATION_CONFIG,
    WORLD_CONFIG,
    builtInLevelPath,
    formatLevelSelector,
    levelCollectionPath,
    parseLevelSelector
} from '../js/config/gameConfig.js';
import {
    DEFAULT_GRAVITATIONAL_REACH,
    GRAVITATIONAL_CONSTANT,
    TOTAL_LEVELS
} from '../js/globalConstants.js';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../js/viewport.js';
import {
    DEFAULT_FLIGHT_BOUNDS,
    DEFAULT_STAGE_BOUNDS,
    createSimulationStateFromLevel
} from '../js/simulationState.js';
import {
    INPUT_CONFIG,
    RESPONSIVE_CONFIG,
    isCompactEditorViewport,
    isMobileViewport
} from '../js/config/inputConfig.js';
import { RUNTIME_CONFIG } from '../js/config/runtimeConfig.js';
import {
    ASSET_CONFIG,
    assetPath,
    assetTypeForPath,
    penguinAnimationAssetPath
} from '../js/config/assetConfig.js';
import { AUDIO_CONFIG, AudioCue, getAudioCue } from '../js/config/audioConfig.js';
import { RENDER_CONFIG } from '../js/config/renderConfig.js';
import { EDITOR_CONFIG } from '../js/config/editorConfig.js';
import {
    BASIC_SERIALIZED_OBJECT_PROPERTIES,
    CLASS_SERIALIZED_OBJECT_PROPERTIES,
    EDITOR_SPRITE_OPTIONS,
    LEVEL_SETTING_FIELDS,
    OBJECT_PROPERTY_FIELDS,
    ORBIT_PROPERTY_FIELDS
} from '../js/config/editorInspectorConfig.js';
import { UI_CONFIG } from '../js/config/uiConfig.js';
import { TRAJECTORY_CONFIG } from './trajectoryConfig.js';
import { AssetLoader } from '../js/assetLoader.js';
import Utils from '../js/utils.js';

test('game configuration is deeply frozen and satisfies core invariants', () => {
    for (const config of [
        WORLD_CONFIG,
        LEVEL_COLLECTION_CONFIG,
        LEVEL_CATALOG_CONFIG,
        SIMULATION_CONFIG,
        PHYSICS_CONFIG,
        LEVEL_DEFAULTS
    ]) {
        assert.equal(Object.isFrozen(config), true);
    }
    assert.equal(Object.isFrozen(LEVEL_DEFAULTS.slingshot), true);
    assert.ok(WORLD_CONFIG.stage.width > 0);
    assert.ok(WORLD_CONFIG.stage.height > 0);
    assert.ok(SIMULATION_CONFIG.legacyPhysicsFps > 0);
    assert.ok(LEVEL_CATALOG_CONFIG.shippedLevelCount <= LEVEL_CATALOG_CONFIG.maxGeneratedLevel);
    assert.equal(builtInLevelPath(12), 'levels/level12.json');
    assert.equal(builtInLevelPath(6), 'levels/level06.json');
    assert.equal(levelCollectionPath('manual', 6), 'levels/manual/level6.json');
    assert.deepEqual(parseLevelSelector('5'), { collection: 'shipped', level: 5 });
    assert.deepEqual(parseLevelSelector('manual:06'), { collection: 'manual', level: 6 });
    assert.equal(parseLevelSelector('shipped:6'), null);
    assert.equal(parseLevelSelector('current:6'), null);
    assert.equal(parseLevelSelector('original:6'), null);
    assert.equal(parseLevelSelector('extracted:25'), null);
    assert.equal(parseLevelSelector('manual:21'), null);
    assert.equal(parseLevelSelector('mystery:1'), null);
    assert.equal(formatLevelSelector('shipped', 7), '7');
    assert.equal(formatLevelSelector('manual', 7), 'manual:7');
    assert.equal(Object.isFrozen(INPUT_CONFIG.hapticsMs), true);
    assert.equal(Object.isFrozen(RENDER_CONFIG.starfield), true);
    assert.equal(Object.isFrozen(EDITOR_CONFIG.authoringDefaults), true);
    assert.equal(Object.isFrozen(OBJECT_PROPERTY_FIELDS.Planet), true);
    assert.equal(Object.isFrozen(ORBIT_PROPERTY_FIELDS.gravityStrength), true);
    assert.equal(Object.isFrozen(UI_CONFIG.levelEnd), true);
    assert.equal(Object.isFrozen(TRAJECTORY_CONFIG.workers), true);
    assert.ok(1 / SIMULATION_CONFIG.legacyPhysicsFps <= RUNTIME_CONFIG.frameTiming.maxDeltaSeconds);
});

test('level editor inspector policy is cataloged by object and settings domain', () => {
    assert.deepEqual(
        OBJECT_PROPERTY_FIELDS.BlackHole.map(field => field.key),
        ['radius', 'mass', 'gravitationalReach']
    );
    assert.equal(
        LEVEL_SETTING_FIELDS.find(field => field.key === 'requiredBonuses').dynamicMax,
        'bonusCount'
    );
    assert.equal(
        OBJECT_PROPERTY_FIELDS.Planet.find(field => field.key === 'planetType').optionsFrom,
        'planetSprites'
    );
    assert.ok(EDITOR_SPRITE_OPTIONS.planetSprites.includes('planet_grey'));
    assert.ok(BASIC_SERIALIZED_OBJECT_PROPERTIES.includes('name'));
    assert.ok(CLASS_SERIALIZED_OBJECT_PROPERTIES.Portal.includes('pairedPortalId'));
});

test('asset and audio policy resolve semantic resources centrally', () => {
    assert.equal(assetPath(ASSET_CONFIG.manifest), 'assets/manifest.json');
    assert.equal(assetTypeForPath('sprites/bonus.svg'), 'svg');
    assert.equal(assetTypeForPath('audio/launch.WAV'), 'audio');
    assert.equal(assetTypeForPath('animations/penguin.png'), 'texture');
    assert.equal(
        penguinAnimationAssetPath('yc', 'metadata'),
        'assets/animations/penguin_spin_yc_metadata.json'
    );
    assert.equal(getAudioCue(AudioCue.LAUNCH).soundId, '17_snd_launch');
    assert.ok(AUDIO_CONFIG.defaultMasterVolume >= 0 && AUDIO_CONFIG.defaultMasterVolume <= 1);
});

test('lazy asset loading uses the configured asset root', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = null;
    globalThis.fetch = async url => {
        requestedUrl = url;
        return { text: async () => '<svg></svg>' };
    };

    try {
        const loader = new AssetLoader();
        loader.manifest = { sprites: { bonus: 'sprites/bonus.svg' } };
        assert.equal(await loader.loadAssetOnDemand('sprite_bonus'), '<svg></svg>');
        assert.equal(requestedUrl, 'assets/sprites/bonus.svg');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('shared asset lookups reuse image objects and coalesce animation metadata requests', async () => {
    const loader = new AssetLoader();
    const bonusSprite = { id: 'bonus-sprite' };
    loader.resources.sprite_bonus = { image: bonusSprite };

    assert.equal(loader.getGameSprite('bonus'), bonusSprite);
    assert.equal(loader.getGameSprite('bonus'), bonusSprite);

    const originalFetch = globalThis.fetch;
    let metadataRequests = 0;
    globalThis.fetch = async () => {
        metadataRequests++;
        return {
            ok: true,
            json: async () => ({ frame_count: 1 })
        };
    };

    try {
        const [first, second] = await Promise.all([
            loader.getAnimationMetadata('xc'),
            loader.getAnimationMetadata('xc')
        ]);
        assert.equal(first, second);
        assert.equal(metadataRequests, 1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('responsive policy is shared without requiring browser globals', () => {
    assert.equal(isMobileViewport({ userAgent: '', width: 768, height: 1024 }), true);
    assert.equal(isMobileViewport({ userAgent: '', width: 769, height: 1024 }), false);
    assert.equal(isMobileViewport({ userAgent: 'Mozilla/5.0 (iPhone)', width: 1200, height: 900 }), true);
    assert.equal(isCompactEditorViewport(RESPONSIVE_CONFIG.editorCompactBreakpoint - 1), true);
    assert.equal(isCompactEditorViewport(RESPONSIVE_CONFIG.editorCompactBreakpoint), false);
});

test('legacy constant exports are views of domain configuration', () => {
    assert.equal(STAGE_WIDTH, WORLD_CONFIG.stage.width);
    assert.equal(STAGE_HEIGHT, WORLD_CONFIG.stage.height);
    assert.equal(TOTAL_LEVELS, LEVEL_CATALOG_CONFIG.shippedLevelCount);
    assert.equal(GRAVITATIONAL_CONSTANT, PHYSICS_CONFIG.gravitationalConstant);
    assert.equal(DEFAULT_GRAVITATIONAL_REACH, PHYSICS_CONFIG.defaultGravitationalReach);
    assert.deepEqual(DEFAULT_STAGE_BOUNDS, { x: 0, y: 0, ...WORLD_CONFIG.stage });
    assert.deepEqual(DEFAULT_FLIGHT_BOUNDS, WORLD_CONFIG.flightBounds);
});

test('level URL validation accepts only complete integer levels', () => {
    assert.equal(Utils.validateLevel('5'), 5);
    assert.equal(Utils.validateLevel('5abc'), null);
    assert.equal(Utils.validateLevel('5.5'), null);
    assert.equal(Utils.validateLevel('0'), null);
});

test('omitted level values compile from shared entity and world defaults', () => {
    const state = createSimulationStateFromLevel({
        objects: [
            { type: 'planet', position: { x: 300, y: 300 }, properties: {} },
            { type: 'bonus', position: { x: 400, y: 300 }, properties: {} }
        ]
    });

    assert.deepEqual(state.slingshot.position, WORLD_CONFIG.defaultStartPosition);
    assert.deepEqual(state.target.position, WORLD_CONFIG.defaultTargetPosition);
    assert.equal(state.penguin.radius, LEVEL_DEFAULTS.penguin.radius);
    assert.equal(state.slingshot.velocityMultiplier, LEVEL_DEFAULTS.slingshot.velocityMultiplier);
    assert.equal(state.planets[0].radius, LEVEL_DEFAULTS.planet.radius);
    assert.equal(state.planets[0].mass, LEVEL_DEFAULTS.planet.mass);
    assert.equal(state.bonuses[0].value, LEVEL_DEFAULTS.bonus.value);
    assert.equal(state.target.width, LEVEL_DEFAULTS.target.width);
    assert.equal(state.rules.gravitationalConstant, PHYSICS_CONFIG.gravitationalConstant);
});
