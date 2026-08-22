import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';

import LiveLevelMutator from '../js/liveLevelMutator.js';
import LevelEditor from '../js/levelEditor.js';
import { BlackHole } from '../js/blackHole.js';
import { validateLevelDefinition } from '../js/levelValidation.js';
import {
    getEditableClassNames,
    getEditorObjectDefinition
} from '../js/editorObjectRegistry.js';
import { levelObjectTypeFromClassName, LevelObjectType } from '../js/levelSchema.js';

test('black hole is exposed as an addable level editor object', () => {
    const gameObjectClasses = {};
    const editableClasses = getEditableClassNames(gameObjectClasses);

    assert.equal(editableClasses.includes('BlackHole'), true);
    assert.equal(typeof gameObjectClasses.BlackHole, 'function');

    const definition = getEditorObjectDefinition('BlackHole');
    assert.equal(definition.editable, true);
    assert.deepEqual(definition.collections, ['planets']);
    assert.equal(definition.physicsAdd, 'addPlanet');
    assert.equal(definition.physicsRemove, 'removePlanet');
});

test('editor-created black hole joins gravity collections and remains schema-backed', () => {
    const gameObjectClasses = {};
    getEditableClassNames(gameObjectClasses);

    const blackHole = new gameObjectClasses.BlackHole(320, 240);
    const game = {
        gameObjects: [],
        planets: [],
        physics: {
            planets: [],
            addPlanet(object) { this.planets.push(object); },
            removePlanet(object) { this.planets = this.planets.filter(value => value !== object); }
        },
        addGameObject(object) { this.gameObjects.push(object); },
        removeGameObject(object) {
            this.gameObjects = this.gameObjects.filter(value => value !== object);
        },
        invalidateSimulationState() {}
    };

    const mutator = new LiveLevelMutator(game);
    assert.equal(mutator.addObject(blackHole), true);
    assert.deepEqual(game.gameObjects, [blackHole]);
    assert.deepEqual(game.planets, [blackHole]);
    assert.deepEqual(game.physics.planets, [blackHole]);
    assert.equal(blackHole.collisionRadius, 0);
    assert.equal(blackHole.collidable, false);
    assert.equal(levelObjectTypeFromClassName(blackHole.constructor.name), LevelObjectType.BLACK_HOLE);
});


test('black hole exposes gravity properties in the editor inspector', () => {
    const editor = Object.create(LevelEditor.prototype);
    const hole = new BlackHole(10, 20, 42, 321, 1234);
    const props = editor.getClassSpecificProperties(hole, 'BlackHole');
    const keys = props.map(prop => prop.key);
    assert.deepEqual(keys, ['radius', 'mass', 'gravitationalReach']);
    assert.equal(props.find(prop => prop.key === 'mass').value, 321);
});

test('black hole editor cloning preserves gravity settings and non-collision', () => {
    const editor = Object.create(LevelEditor.prototype);
    editor.game = { assetLoader: null };
    editor.gameObjectClasses = { BlackHole };
    const original = new BlackHole(10, 20, 45, 777, 2345);
    original.id = 'blackhole_1';
    original.name = 'Void';
    const clone = editor.cloneObject(original);
    assert.equal(clone.radius, 45);
    assert.equal(clone.mass, 777);
    assert.equal(clone.gravitationalReach, 2345);
    assert.equal(clone.collisionRadius, 0);
    assert.equal(clone.collidable, false);
});

test('editing black hole gravity refreshes the shared physics registry', () => {
    const editor = Object.create(LevelEditor.prototype);
    const calls = [];
    editor.game = {
        invalidateSimulationState() {},
        physics: { refreshPlanet(object) { calls.push(object); } }
    };
    const hole = new BlackHole(10, 20);
    editor.synchronizeEditedObject(hole);
    assert.deepEqual(calls, [hole]);
});

test('black hole validation enforces gravity fields and non-collision contract', () => {
    const base = {
        name: 'Black hole validation',
        startPosition: { x: 100, y: 300 },
        targetPosition: { x: 700, y: 300 },
        objects: [{
            type: 'blackhole',
            position: { x: 400, y: 300 },
            properties: { radius: 30, mass: 100, gravitationalReach: 5000 }
        }]
    };
    assert.equal(validateLevelDefinition(base).valid, true);
    const invalid = structuredClone(base);
    invalid.objects[0].properties.mass = -1;
    invalid.objects[0].properties.collisionRadius = 10;
    invalid.objects[0].properties.collidable = true;
    const validation = validateLevelDefinition(invalid);
    assert.equal(validation.valid, false);
    assert.equal(validation.errors.some(error => error.code === 'NUMBER_TOO_SMALL'), true);
    assert.equal(validation.errors.some(error => error.code === 'BLACK_HOLE_COLLISION_RADIUS'), true);
    assert.equal(validation.errors.some(error => error.code === 'BLACK_HOLE_COLLIDABLE'), true);
});
