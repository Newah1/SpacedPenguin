import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { LEVEL_CATALOG_CONFIG, builtInLevelPath } from '../js/config/gameConfig.js';
import {
    LevelValidationError,
    assertValidLevelDefinition,
    validateLevelDefinition
} from '../js/levels/levelValidation.js';
import {
    LEVEL_OBJECT_TYPE_NAMES,
    LEVEL_ORBIT_TYPES,
    LEVEL_CAMERA_MODES,
    LevelObjectType,
    LevelOrbitType,
    isLevelObjectType,
    isLevelOrbitType,
    levelObjectTypeFromClassName,
    normalizeLevelObjectType,
    normalizeLevelDefinition,
    normalizeLevelObjectDefinition,
    normalizeLevelOrbitType,
    normalizeOrbitDefinition
} from '../js/levels/levelSchema.js';

function object(type, x, y, properties = {}) {
    return { type, position: { x, y }, properties };
}

test('all shipped levels satisfy the shared level contract', async () => {
    const levelFileNames = await readdir(new URL('../levels/', import.meta.url));
    const authoredLevelNumbers = levelFileNames
        .map(fileName => /^level(\d+)\.json$/.exec(fileName))
        .filter(Boolean)
        .map(match => Number.parseInt(match[1], 10))
        .sort((left, right) => left - right);
    const configuredLevelNumbers = Array.from(
        { length: LEVEL_CATALOG_CONFIG.shippedLevelCount },
        (_, index) => LEVEL_CATALOG_CONFIG.firstLevel + index
    );

    assert.deepEqual(
        authoredLevelNumbers,
        configuredLevelNumbers,
        'numbered level files must match the configured shipped catalog'
    );

    for (
        let levelNumber = LEVEL_CATALOG_CONFIG.firstLevel;
        levelNumber <= LEVEL_CATALOG_CONFIG.shippedLevelCount;
        levelNumber++
    ) {
        const url = new URL(`../${builtInLevelPath(levelNumber)}`, import.meta.url);
        const level = JSON.parse(await readFile(url, 'utf8'));
        const validation = validateLevelDefinition(level);
        assert.equal(
            validation.valid,
            true,
            `level ${levelNumber}: ${validation.errors.map(error => `${error.code} ${error.path}`).join(', ')}`
        );
    }
});

test('validation accumulates structural, identity, reference-cycle, and rule errors', () => {
    const level = {
        name: 'Broken level',
        startPosition: { x: 100, y: 100 },
        objects: [
            object('slingshot', 100, 100),
            object('target', 700, 300),
            object('planet', 300, 300, {
                id: 'planet_a',
                orbit: { orbitTargetId: 'planet_b', orbitRadius: 100, orbitSpeed: 1 }
            }),
            object('planet', 400, 300, {
                id: 'planet_b',
                orbit: { orbitTargetId: 'planet_a', orbitRadius: 100, orbitSpeed: 1 }
            }),
            object('bonus', Number.NaN, 200, { id: 'planet_a' })
        ],
        rules: { requiredBonuses: 2 }
    };

    const validation = validateLevelDefinition(level);
    const codes = new Set(validation.errors.map(error => error.code));

    assert.equal(validation.valid, false);
    assert.equal(codes.has('FINITE_NUMBER_REQUIRED'), true);
    assert.equal(codes.has('ID_DUPLICATE'), true);
    assert.equal(codes.has('ORBIT_CYCLE'), true);
    assert.equal(codes.has('REQUIRED_BONUSES_UNAVAILABLE'), true);
});

test('invalid levels throw a typed error with machine-readable diagnostics', () => {
    assert.throws(
        () => assertValidLevelDefinition({ objects: 'not-an-array' }, 'test level'),
        error => {
            assert.equal(error instanceof LevelValidationError, true);
            assert.equal(error.validation.valid, false);
            assert.equal(error.validation.errors[0].path, '$.objects');
            return true;
        }
    );
});

test('shared schema owns aliases and supported orbit vocabulary', () => {
    assert.equal(normalizeLevelObjectType('text'), LevelObjectType.TEXT);
    assert.equal(normalizeLevelObjectType('ARROW'), LevelObjectType.POINTING_ARROW);
    assert.equal(normalizeLevelObjectType(' Planet '), LevelObjectType.PLANET);
    assert.equal(isLevelObjectType(' BONUS '), true);
    assert.equal(levelObjectTypeFromClassName('PointingArrow'), LevelObjectType.POINTING_ARROW);
    assert.equal(levelObjectTypeFromClassName('BonusPopup'), null);
    assert.equal(LEVEL_OBJECT_TYPE_NAMES.includes('penguin'), true);
    assert.deepEqual(LEVEL_ORBIT_TYPES, ['circular', 'elliptical', 'figure8', 'gravity', 'director-gravity', 'custom']);
    assert.deepEqual(LEVEL_CAMERA_MODES, ['fit', 'follow']);
    assert.equal(normalizeLevelOrbitType(' GRAVITY '), LevelOrbitType.GRAVITY);
    assert.equal(isLevelOrbitType('Circular'), true);
    assert.equal(normalizeOrbitDefinition({ type: 'ELLIPTICAL' }).type, LevelOrbitType.ELLIPTICAL);
});

test('expanded playfield camera settings validate and normalize without affecting legacy levels', () => {
    const expanded = {
        objects: [object('slingshot', 100, 100), object('target', 2200, 1600)],
        bounds: {
            stage: { x: 0, y: 0, width: 2400, height: 1800 },
            flight: { x: -200, y: -200, width: 2800, height: 2200 }
        },
        camera: { mode: 'FOLLOW', zoom: 1.25 }
    };
    assert.equal(validateLevelDefinition(expanded).valid, true);
    assert.deepEqual(normalizeLevelDefinition(expanded).camera, { mode: 'follow', zoom: 1.25 });
    assert.equal('camera' in normalizeLevelDefinition({ objects: [] }), false);

    const invalid = validateLevelDefinition({ ...expanded, camera: { mode: 'orbit', zoom: 0 } });
    assert.equal(invalid.valid, false);
    assert.equal(invalid.errors.some(error => error.code === 'CAMERA_MODE'), true);
    assert.equal(invalid.errors.some(error => error.path === '$.camera.zoom'), true);
});

test('validation and normalization use the same case-insensitive schema vocabulary', () => {
    const level = {
        objects: [
            object(' SLINGSHOT ', 100, 100),
            object('Target', 700, 300),
            object('PLANET', 300, 300, {
                orbit: {
                    orbitCenter: { x: 400, y: 300 },
                    orbitRadius: 100,
                    orbitSpeed: 1,
                    orbitType: 'ELLIPTICAL'
                }
            })
        ]
    };

    assert.equal(validateLevelDefinition(level).valid, true);
});

test('level normalization applies shared defaults while preserving explicit zero overrides', () => {
    const planet = normalizeLevelObjectDefinition(object('PLANET', 10, 20, {
        radius: 0,
        mass: null,
        gravitationalReach: 0
    }));

    assert.equal(planet.type, LevelObjectType.PLANET);
    assert.equal(planet.properties.radius, 0);
    assert.equal(planet.properties.mass, 100);
    assert.equal(planet.properties.gravitationalReach, 0);
    assert.equal(planet.properties.collisionRadius, 8);

    const normalized = normalizeLevelDefinition({ objects: [] });
    assert.deepEqual(normalized.startPosition, { x: 100, y: 300 });
    assert.deepEqual(normalized.targetPosition, { x: 700, y: 300 });
    assert.equal(normalized.rules.scoreMultiplier, 1);
    assert.equal(normalized.rules.gravitationalConstant, 3);
});

test('portal pairs require reciprocal red and blue endpoints', () => {
    const valid = {
        objects: [
            object('slingshot', 0, 0),
            object('target', 700, 300),
            object('portal', 100, 100, { id: 'red', pairedPortalId: 'blue', color: 'red' }),
            object('portal', 300, 100, { id: 'blue', pairedPortalId: 'red', color: 'blue' })
        ]
    };
    assert.equal(validateLevelDefinition(valid).valid, true);

    const broken = structuredClone(valid);
    broken.objects[3].properties.pairedPortalId = 'missing';
    const validation = validateLevelDefinition(broken);
    assert.equal(validation.valid, false);
    assert.equal(validation.errors.some(error => error.code === 'PORTAL_PAIR_NOT_RECIPROCAL'), true);
    assert.equal(validation.errors.some(error => error.code === 'PORTAL_PAIR_UNKNOWN'), true);
});

test('speed boosters accept directional multiplier and sound configuration', () => {
    const valid = {
        objects: [
            object('slingshot', 0, 0),
            object('target', 700, 300),
            object('speedbooster', 100, 100, { rotation: 45, speedMultiplier: 1.75, playSound: false })
        ]
    };
    assert.equal(validateLevelDefinition(valid).valid, true);

    const invalid = structuredClone(valid);
    invalid.objects[2].properties.speedMultiplier = -1;
    assert.equal(validateLevelDefinition(invalid).valid, false);
    assert.equal(validateLevelDefinition(invalid).errors.some(error => error.path.endsWith('.speedMultiplier')), true);
});

test('deflector bumpers validate radius, restitution, and sound configuration', () => {
    const valid = {
        objects: [
            object('slingshot', 0, 0),
            object('target', 700, 300),
            object('deflector', 100, 100, { radius: 24, restitution: 1.2, playSound: false })
        ]
    };
    assert.equal(validateLevelDefinition(valid).valid, true);

    const invalid = structuredClone(valid);
    invalid.objects[2].properties.restitution = -0.1;
    assert.equal(validateLevelDefinition(invalid).valid, false);
    assert.equal(validateLevelDefinition(invalid).errors.some(error => error.path.endsWith('.restitution')), true);
});
