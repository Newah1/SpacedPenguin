import test from 'node:test';
import assert from 'node:assert/strict';

import { LevelOrbitType } from '../js/levelSchema.js';
import {
    EditorRuntimeController,
    findObjectBodyAtPosition,
    prepareCloneForInsertion
} from '../js/levelEditor/editorRuntimeController.js';

class FakePlanet {
    constructor() {
        this.id = 'planet_1';
        this.name = 'Planet 1';
        this.position = { x: 10, y: 0 };
        this.radius = 10;
        this.mass = 1;
        this.gravitationalReach = 0;
        this.alpha = 1;
        this.orbitSystem = {
            orbitCenter: { x: 0, y: 0 },
            orbitTargetId: null,
            orbitRadius: 10,
            orbitSpeed: 1,
            orbitAngle: 0,
            orbitType: LevelOrbitType.CIRCULAR,
            orbitParams: {},
            velocity: { x: 0, y: 0 },
            gravityStrength: 1000,
            maxGravityAccel: 100
        };
    }

    draw() {}
}

function fakeEditor(objects = []) {
    return {
        active: true,
        mode: 'edit',
        dragging: false,
        draggingOrbitCenter: false,
        selectedObject: null,
        orbitCenterObject: null,
        game: {
            invalidations: 0,
            invalidateSimulationState() { this.invalidations++; }
        },
        cloneObject() {
            return { id: 'planet_1', name: 'Planet 1' };
        },
        getAllGameObjects() { return objects; },
        isPointInObject() { return false; },
        getOrbitCenterAtPosition() { return { type: 'orbitCenter', object: objects[0] }; },
        updateDragging() {},
        updateOrbitCenterDragging() {}
    };
}

test('cloned editor objects discard source identity and generated name', () => {
    const clone = prepareCloneForInsertion({ id: 'planet_7', name: 'Planet 7', mass: 20 });
    assert.equal(clone.id, null);
    assert.equal(clone.name, '');
    assert.equal(clone.mass, 20);
});

test('editor runtime clone hook forces generated identity on insertion', () => {
    const editor = fakeEditor();
    new EditorRuntimeController(editor, { now: () => 0 });

    const clone = editor.cloneObject({});
    assert.equal(clone.id, null);
    assert.equal(clone.name, '');
});

test('object bodies take selection priority over orbit-center handles', () => {
    const planet = new FakePlanet();
    const editor = fakeEditor([planet]);
    editor.isPointInObject = (_x, _y, object) => object === planet;

    assert.equal(findObjectBodyAtPosition(editor, 10, 0), planet);

    new EditorRuntimeController(editor, { now: () => 0 });
    assert.equal(editor.getObjectAtPosition(10, 0), planet);
});

test('orbit preview advances without mutating authored position', () => {
    const planet = new FakePlanet();
    const editor = fakeEditor([planet]);
    let time = 0;
    const controller = new EditorRuntimeController(editor, { now: () => time });

    assert.deepEqual(controller.getPreviewPosition(planet), { x: 10, y: 0 });
    time = 0.05;
    const preview = controller.getPreviewPosition(planet);

    assert.ok(preview.x < 10);
    assert.ok(preview.y > 0);
    assert.deepEqual(planet.position, { x: 10, y: 0 });
});

test('editing orbit parameters immediately resets preview phase', () => {
    const planet = new FakePlanet();
    const editor = fakeEditor([planet]);
    let time = 0;
    const controller = new EditorRuntimeController(editor, { now: () => time });

    controller.getPreviewPosition(planet);
    time = 0.05;
    const advanced = controller.getPreviewPosition(planet);
    assert.ok(advanced.y > 0);

    planet.orbitSystem.orbitSpeed = 2;
    time = 0.06;
    assert.deepEqual(controller.getPreviewPosition(planet), { x: 10, y: 0 });
});

test('drag updates invalidate stale simulation and preview state', () => {
    const planet = new FakePlanet();
    const editor = fakeEditor([planet]);
    let dragCalls = 0;
    editor.updateDragging = () => { dragCalls++; };
    const controller = new EditorRuntimeController(editor, { now: () => 0 });
    controller.signature = 'stale';

    editor.updateDragging(25, 30);

    assert.equal(dragCalls, 1);
    assert.equal(editor.game.invalidations, 1);
    assert.equal(controller.signature, null);
});
