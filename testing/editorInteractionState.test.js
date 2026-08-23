import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';

import EditorInteractionState, { EditorInteractionType } from '../js/levelEditor/editorInteractionState.js';
import LevelEditorCanvasInputController from '../js/levelEditor/canvasInputController.js';

function pointerEvent(overrides = {}) {
    return {
        button: 0,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 40,
        clientY: 50,
        preventDefaultCalls: 0,
        preventDefault() { this.preventDefaultCalls++; },
        currentTarget: {
            setPointerCapture() {},
            hasPointerCapture() { return false; },
            releasePointerCapture() {}
        },
        ...overrides
    };
}

function editorFixture() {
    const calls = [];
    const editor = {
        active: true,
        mode: 'edit',
        spacePan: false,
        editorCamera: null,
        game: {
            canvas: {},
            viewport: {}
        },
        gravitySculptController: {
            state: { drawing: false },
            addWaypoint: value => calls.push(['waypoint', value])
        },
        getObjectAtPosition: () => null,
        selectObject: value => calls.push(['select', value]),
        startPanning: (...args) => calls.push(['startPan', ...args]),
        updatePanning: (...args) => calls.push(['updatePan', ...args]),
        stopPanning: () => calls.push(['stopPan']),
        startDragging: (...args) => calls.push(['startDrag', ...args]),
        updateDragging: (...args) => calls.push(['updateDrag', ...args]),
        stopDragging: () => calls.push(['stopDrag']),
        startOrbitCenterDragging: (...args) => calls.push(['startOrbitDrag', ...args]),
        updateOrbitCenterDragging: (...args) => calls.push(['updateOrbitDrag', ...args]),
        stopOrbitCenterDragging: () => calls.push(['stopOrbitDrag']),
        showContextMenu: (...args) => calls.push(['contextMenu', ...args])
    };
    return { editor, calls };
}

function controllerFixture() {
    const { editor, calls } = editorFixture();
    const controller = new LevelEditorCanvasInputController(editor);
    controller.getEventCoordinates = () => ({ x: 10, y: 20 });
    return { editor, calls, controller };
}

test('interaction state permits exactly one active gesture', () => {
    const state = new EditorInteractionState();
    const object = { id: 'planet_1' };

    assert.equal(state.idle, true);
    assert.equal(state.begin(EditorInteractionType.OBJECT_DRAG, { object }), true);
    assert.equal(state.type, EditorInteractionType.OBJECT_DRAG);
    assert.equal(state.data.object, object);
    assert.equal(state.begin(EditorInteractionType.PAN), false);
    assert.equal(state.end(EditorInteractionType.PAN), null);
    assert.equal(state.type, EditorInteractionType.OBJECT_DRAG);

    const completed = state.end(EditorInteractionType.OBJECT_DRAG);
    assert.equal(completed.type, EditorInteractionType.OBJECT_DRAG);
    assert.equal(completed.data.object, object);
    assert.equal(state.idle, true);
    assert.equal(state.cancel(), null);
    assert.throws(() => state.begin(EditorInteractionType.IDLE), /Invalid editor interaction type/);
    assert.throws(() => state.begin('unknown'), /Invalid editor interaction type/);
});

test('object drag owns pointer movement until pointer up', () => {
    const { editor, calls, controller } = controllerFixture();
    const object = { id: 'planet_1', constructor: { name: 'Planet' } };
    editor.getObjectAtPosition = () => object;

    controller.handlePointerDown(pointerEvent());
    assert.equal(controller.interaction.type, EditorInteractionType.OBJECT_DRAG);

    controller.handlePointerMove(pointerEvent({ clientX: 45, clientY: 55 }));
    controller.handlePointerUp(pointerEvent({ clientX: 45, clientY: 55 }));

    assert.deepEqual(calls.map(call => call[0]), ['select', 'startDrag', 'updateDrag', 'stopDrag']);
    assert.equal(controller.interaction.idle, true);
});

test('orbit-center drag routes exclusively to orbit-center handlers', () => {
    const { editor, calls, controller } = controllerFixture();
    const object = { id: 'planet_1', constructor: { name: 'Planet' } };
    editor.getObjectAtPosition = () => ({ type: 'orbitCenter', object });

    controller.handlePointerDown(pointerEvent());
    controller.handlePointerMove(pointerEvent());
    controller.handlePointerUp(pointerEvent());

    assert.deepEqual(calls.map(call => call[0]), [
        'select', 'startOrbitDrag', 'updateOrbitDrag', 'stopOrbitDrag'
    ]);
    assert.equal(controller.interaction.idle, true);
});

test('pan gesture cannot accidentally invoke drag handlers', () => {
    const { editor, calls, controller } = controllerFixture();
    editor.spacePan = true;

    controller.handlePointerDown(pointerEvent());
    assert.equal(controller.interaction.type, EditorInteractionType.PAN);
    controller.handlePointerMove(pointerEvent({ clientX: 60, clientY: 70 }));
    controller.handlePointerUp(pointerEvent({ clientX: 60, clientY: 70 }));

    assert.deepEqual(calls.map(call => call[0]), ['startPan', 'updatePan', 'stopPan']);
    assert.equal(controller.interaction.idle, true);
});

test('gravity sculpt owns one pointer gesture without starting another interaction', () => {
    const { editor, calls, controller } = controllerFixture();
    editor.gravitySculptController.state.drawing = true;

    controller.handlePointerDown(pointerEvent());
    assert.equal(controller.interaction.type, EditorInteractionType.GRAVITY_SCULPT);
    controller.handlePointerMove(pointerEvent());
    controller.handlePointerUp(pointerEvent());

    assert.deepEqual(calls.map(call => call[0]), ['waypoint']);
    assert.equal(controller.interaction.idle, true);
});

test('pointer cancellation stops only the active interaction', () => {
    const { editor, calls, controller } = controllerFixture();
    const object = { id: 'planet_1', constructor: { name: 'Planet' } };
    editor.getObjectAtPosition = () => object;

    controller.handlePointerDown(pointerEvent());
    controller.cancelPointer();

    assert.deepEqual(calls.map(call => call[0]), ['select', 'startDrag', 'stopDrag']);
    assert.equal(controller.interaction.idle, true);
    assert.equal(controller.activePointerId, null);
});
