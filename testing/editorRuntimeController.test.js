import test from 'node:test';
import assert from 'node:assert/strict';

import { LevelOrbitType } from '../js/levelSchema.js';
import {
    EditorRuntimeController,
    findObjectBodyAtPosition,
    findOrbitTargetObject,
    prepareCloneForInsertion,
    shouldSuppressEditorKey
} from '../js/levelEditor/controllers/editorRuntimeController.js';
import EditorObjectService from '../js/levelEditor/services/editorObjectService.js';

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

test('editor runtime controller does not replace editor hit testing', () => {
    const editor = fakeEditor();
    const hitTest = editor.getObjectAtPosition;
    new EditorRuntimeController(editor, { now: () => 0 });
    assert.equal(editor.getObjectAtPosition, hitTest);
});

test('object bodies take selection priority over orbit-center handles', () => {
    const planet = new FakePlanet();
    const editor = fakeEditor([planet]);
    editor.isPointInObject = (_x, _y, object) => object === planet;

    assert.equal(findObjectBodyAtPosition(editor, 10, 0), planet);

    assert.equal(findObjectBodyAtPosition(editor, 10, 0), planet);
});

test('selected waypoint handles take priority over the object body', () => {
    const planet = new FakePlanet();
    planet.levelType = 'planet';
    planet.waypointSystem = {
        waypoints: [{ x: 10, y: 0 }, { x: 100, y: 0 }],
        speed: 10,
        mode: 'pingpong',
        phase: 0
    };
    const editor = fakeEditor([planet]);
    editor.selectedObject = planet;
    editor.editorCamera = { scale: 1 };
    editor.runtimeProjector = { listRuntimeObjects: () => [planet] };
    editor.isPointInObject = () => true;
    const service = new EditorObjectService(editor);

    const hit = service.hitTest(10, 0);
    assert.equal(hit.type, 'waypoint');
    assert.equal(hit.object, planet);
    assert.equal(hit.waypointIndex, 0);
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

test('moving orbit objects defer their normal edit-world render to the preview renderer', () => {
    const planet = new FakePlanet();
    const editor = fakeEditor([planet]);
    const controller = new EditorRuntimeController(editor, { now: () => 0 });

    assert.equal(controller.shouldRenderPreviewObject(planet), true);
    assert.deepEqual(controller.getDisplayPosition(planet), { x: 10, y: 0 });
    editor.state = {
        interaction: { type: 'drag-object', objectId: planet.id }
    };
    assert.equal(controller.shouldRenderPreviewObject(planet), false);
});

test('body hit testing uses the moving orbit preview position', () => {
    const planet = new FakePlanet();
    planet.orbitSystem.orbitSpeed = 40;
    const editor = fakeEditor([planet]);
    let time = 0;
    editor.objectService = new EditorObjectService(editor);
    editor.objectService.listRuntimeObjects = () => [planet];
    const controller = new EditorRuntimeController(editor, { now: () => time });
    editor.overlayRenderer = { runtimeController: controller };
    editor.isPointInObject = (x, y, object, displayPosition) => {
        const position = displayPosition || object.position;
        return Math.hypot(x - position.x, y - position.y) <= object.radius;
    };

    controller.getPreviewPosition(planet);
    time = 0.05;
    const previewPosition = controller.getPreviewPosition(planet);

    assert.equal(editor.objectService.hitTestBody(previewPosition.x, previewPosition.y), planet);
    assert.equal(editor.objectService.hitTestBody(planet.position.x, planet.position.y), null);
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
    controller.invalidatePreview();
    time = 0.06;
    assert.deepEqual(controller.getPreviewPosition(planet), { x: 10, y: 0 });
});

test('preview invalidation is explicit and does not wrap drag methods', () => {
    const planet = new FakePlanet();
    const editor = fakeEditor([planet]);
    let dragCalls = 0;
    editor.updateDragging = () => { dragCalls++; };
    const controller = new EditorRuntimeController(editor, { now: () => 0 });
    controller.preview.dirty = false;

    editor.updateDragging(25, 30);

    assert.equal(dragCalls, 1);
    assert.equal(editor.game.invalidations, 0);
    assert.equal(controller.preview.dirty, false);
    controller.invalidatePreview();
    assert.equal(controller.preview.dirty, true);
});

test('plain R is suppressed only while actively editing a level', () => {
    assert.equal(shouldSuppressEditorKey({ code: 'KeyR' }, { active: true, mode: 'edit' }), true);
    assert.equal(shouldSuppressEditorKey({ code: 'KeyR' }, { active: true, mode: 'play' }), false);
    assert.equal(shouldSuppressEditorKey({ code: 'KeyR' }, { active: false, mode: 'edit' }), false);
    assert.equal(shouldSuppressEditorKey({ code: 'KeyR', ctrlKey: true }, { active: true, mode: 'edit' }), false);
    assert.equal(shouldSuppressEditorKey({ code: 'KeyQ' }, { active: true, mode: 'edit' }), false);
});

test('plain R remains typeable in editor text controls', () => {
    const editor = { active: true, mode: 'edit' };
    const editableTarget = selector => ({
        matches: query => query.includes(selector),
        closest: () => null
    });

    assert.equal(shouldSuppressEditorKey({ code: 'KeyR', target: editableTarget('input') }, editor), false);
    assert.equal(shouldSuppressEditorKey({ code: 'KeyR', target: editableTarget('textarea') }, editor), false);
    assert.equal(shouldSuppressEditorKey({ code: 'KeyR', target: editableTarget('[contenteditable="true"]') }, editor), false);

    const nestedContentEditableTarget = {
        matches: () => false,
        closest: query => query === '[contenteditable="true"]' ? {} : null
    };
    assert.equal(shouldSuppressEditorKey({ code: 'KeyR', target: nestedContentEditableTarget }, editor), false);
});

test('object-target orbit resolves the exact authored target for highlighting', () => {
    const source = new FakePlanet();
    source.id = 'planet_source';
    source.orbitSystem.orbitTargetId = 'planet_target';
    const target = new FakePlanet();
    target.id = 'planet_target';
    const editor = fakeEditor([source, target]);
    editor.selectedObject = source;

    assert.equal(findOrbitTargetObject(editor), target);

    source.orbitSystem.orbitTargetId = 'missing';
    assert.equal(findOrbitTargetObject(editor), null);
});
