import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    LevelValidationError,
    assertValidLevelDefinition,
    validateLevelDefinition
} from '../js/levelValidation.js';
import {
    LEVEL_OBJECT_TYPE_NAMES,
    LEVEL_ORBIT_TYPES,
    LevelObjectType,
    normalizeLevelObjectType
} from '../js/levelSchema.js';

function object(type, x, y, properties = {}) {
    return { type, position: { x, y }, properties };
}

test('all shipped levels satisfy the shared level contract', async () => {
    for (let levelNumber = 1; levelNumber <= 19; levelNumber++) {
        const url = new URL(`../levels/level${levelNumber}.json`, import.meta.url);
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
    assert.equal(LEVEL_OBJECT_TYPE_NAMES.includes('penguin'), true);
    assert.deepEqual(LEVEL_ORBIT_TYPES, ['circular', 'elliptical', 'figure8', 'gravity', 'custom']);
});
