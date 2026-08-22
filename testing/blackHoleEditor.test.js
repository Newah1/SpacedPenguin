import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';

import LiveLevelMutator from '../js/liveLevelMutator.js';
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
