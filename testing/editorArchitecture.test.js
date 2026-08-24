import test from 'node:test';
import assert from 'node:assert/strict';

import EditorEvents, { EditorEventType } from '../js/levelEditor/editorEvents.js';
import EditorSelection from '../js/levelEditor/editorSelection.js';
import EditorState, { EditorInteractionType } from '../js/levelEditor/editorState.js';
import EditorToolManager from '../js/levelEditor/editorToolManager.js';
import EditorCommandBus from '../js/levelEditor/editorCommandBus.js';
import LevelDocument from '../js/levelEditor/levelDocument.js';
import LiveEditCommand from '../js/editorCommands/liveEditCommand.js';
import CommandHistory from '../js/editorCommands/commandHistory.js';
import CommandRegistry from '../js/editorCommands/commandRegistry.js';
import {
    getEditableLevelTypes,
    getEditorObjectDefinition
} from '../js/editorObjectRegistry.js';

function validDefinition() {
    return {
        name: 'Editor architecture',
        startPosition: { x: 100, y: 300 },
        targetPosition: { x: 700, y: 300 },
        objects: [
            { type: 'planet', position: { x: 300, y: 300 }, properties: { mass: 0 } },
            { type: 'target', position: { x: 700, y: 300 }, properties: {} }
        ],
        rules: { requiredBonuses: 0, gravitationalConstant: 0 }
    };
}

test('editor state permits one discriminated interaction at a time', () => {
    const state = new EditorState();
    state.setInteraction({ type: EditorInteractionType.PAN, pointerId: 7 });
    assert.equal(state.interaction.type, 'pan');
    assert.equal(state.ownsPointer(8), false);
    state.setInteraction({ type: EditorInteractionType.DRAG_OBJECT, pointerId: 8, objectId: 'planet_1' });
    assert.equal(state.interaction.type, 'drag-object');
    assert.equal(state.interaction.pointerId, 8);
    state.clearInteraction();
    assert.deepEqual(state.interaction, { type: 'idle' });
});

test('selection stores IDs and resolves rebuilt runtime objects', () => {
    const events = new EditorEvents();
    const received = [];
    events.on(EditorEventType.SELECTION_CHANGED, event => received.push(event.selection));
    let objects = new Map([['planet_1', { id: 'planet_1', version: 1 }]]);
    const selection = new EditorSelection({ events, resolveObject: id => objects.get(id) });

    selection.select('planet_1');
    assert.equal(selection.get().version, 1);
    objects = new Map([['planet_1', { id: 'planet_1', version: 2 }]]);
    assert.equal(selection.get().version, 2);
    objects.clear();
    assert.equal(selection.get(), null);
    assert.deepEqual(received, [
        { kind: 'object', id: 'planet_1' },
        { kind: 'none' }
    ]);
});

test('level document assigns persistent IDs and preserves explicit zeros', () => {
    const document = LevelDocument.fromDefinition(validDefinition());
    const [planet, target] = document.listObjects();
    assert.equal(planet.properties.id, 'planet_1');
    assert.equal(target.properties.id, 'target_1');
    assert.equal(planet.properties.mass, 0);
    assert.equal(document.toDefinition().rules.requiredBonuses, 0);
    assert.equal(document.toDefinition().rules.gravitationalConstant, 0);
});

test('ID allocation fills type gaps without colliding and rejects duplicate authored IDs', () => {
    const definition = validDefinition();
    definition.objects = [
        { type: 'planet', position: { x: 100, y: 100 }, properties: { id: 'planet_1' } },
        { type: 'planet', position: { x: 200, y: 100 }, properties: { id: 'planet_3' } },
        { type: 'planet', position: { x: 300, y: 100 }, properties: {} }
    ];
    const ids = LevelDocument.fromDefinition(definition).listObjects()
        .map(object => object.properties.id);
    assert.deepEqual(ids, ['planet_1', 'planet_3', 'planet_2']);
    assert.deepEqual(LevelDocument.fromDefinition(LevelDocument.fromDefinition(definition).toDefinition())
        .listObjects().map(object => object.properties.id), ids);

    definition.objects[2].properties.id = 'planet_1';
    assert.throws(() => LevelDocument.fromDefinition(definition), /unique|duplicate/i);
});

test('editor registry covers every editable canonical type with properties and actions', () => {
    for (const type of getEditableLevelTypes()) {
        const definition = getEditorObjectDefinition(type);
        assert.equal(definition.type, type);
        assert.equal(definition.editable, true);
        assert.equal(definition.capabilities.create, true);
        assert.equal(Array.isArray(definition.properties), true);
        assert.equal(Array.isArray(definition.actions), true);
    }
});

test('level document patches by ID and synchronizes singleton positions', () => {
    const document = LevelDocument.fromDefinition(validDefinition());
    const target = document.listObjects().find(object => object.type === 'target');
    assert.equal(document.applyPatch({
        type: 'object.update',
        id: target.properties.id,
        changes: { position: { x: 650, y: 250 } }
    }), true);
    assert.deepEqual(document.toDefinition().targetPosition, { x: 650, y: 250 });
    assert.equal(document.revision, 1);
    assert.equal(document.validate().valid, true);
});

function createToolHarness(hit = null) {
    const calls = [];
    const selected = [];
    const object = hit?.type === 'orbitCenter' ? hit.object : hit;
    const editor = {
        state: new EditorState(),
        events: new EditorEvents(),
        game: {
            canvas: {
                style: {},
                getBoundingClientRect: () => ({ width: 800, height: 600 })
            },
            viewport: { backingWidth: 800, backingHeight: 600, scale: 1 },
            invalidateSimulationState() {}
        },
        editorCamera: { scale: 1, viewRect: { x: 0, y: 0, width: 800, height: 600 } },
        objectService: { hitTest: () => hit, find: id => object?.id === id ? object : null },
        gravitySculptController: { state: { drawing: false }, addWaypoint() {} },
        commandBus: {
            begin: (type, payload) => { calls.push(['begin', type, payload]); return true; },
            update: payload => { calls.push(['update', payload]); return true; },
            commit: () => { calls.push(['commit']); return true; },
            cancel: () => { calls.push(['cancel']); return true; }
        },
        canvasInput: { hideLongPressIndicator() {}, showLongPressIndicator() {} },
        overlayRenderer: { runtimeController: { invalidatePreview() {} } },
        selectObject: value => selected.push(value),
        getObjectPosition: value => ({ ...value.position }),
        setDisplayedPropertyValue() {},
        updateObjectList() {},
        setEditorCamera(center, zoom) { calls.push(['camera', center, zoom]); },
        fitEditorCamera() {},
        showContextMenu() {}
    };
    return { editor, manager: new EditorToolManager(editor), calls, selected };
}

function pointer(pointerId, { x = 0, y = 0, button = 0, pointerType = 'mouse' } = {}) {
    return {
        event: { pointerId, button, pointerType },
        world: { x, y },
        screen: { x, y }
    };
}

test('tool manager gives one pointer exclusive ownership and cancels drag transactions', () => {
    const object = { id: 'planet_1', position: { x: 20, y: 30 }, constructor: { name: 'Planet' } };
    const { editor, manager, calls, selected } = createToolHarness(object);
    assert.equal(manager.handlePointerDown(pointer(4, { x: 22, y: 33 })), true);
    assert.equal(editor.state.interaction.type, EditorInteractionType.DRAG_OBJECT);
    assert.equal(editor.state.interaction.pointerId, 4);
    assert.deepEqual(selected, [object]);
    assert.equal(manager.handlePointerMove(pointer(5, { x: 80, y: 90 })), false);
    assert.equal(calls.some(call => call[0] === 'update'), false);
    assert.equal(manager.handlePointerMove(pointer(4, { x: 32, y: 43 })), true);
    assert.deepEqual(calls.find(call => call[0] === 'update')[1].after, { x: 30, y: 40 });
    assert.equal(manager.handlePointerCancel(pointer(4)), true);
    assert.equal(calls.at(-1)[0], 'cancel');
    assert.deepEqual(editor.state.interaction, { type: EditorInteractionType.IDLE });
});

test('tool manager commits one drag and supports middle-button and Space panning', () => {
    const object = { id: 'planet_1', position: { x: 20, y: 30 }, constructor: { name: 'Planet' } };
    const drag = createToolHarness(object);
    drag.manager.handlePointerDown(pointer(1, { x: 20, y: 30 }));
    drag.manager.handlePointerMove(pointer(1, { x: 50, y: 60 }));
    drag.manager.handlePointerUp(pointer(1, { x: 50, y: 60 }));
    assert.equal(drag.calls.filter(call => call[0] === 'commit').length, 1);

    const pan = createToolHarness(null);
    pan.manager.handlePointerDown(pointer(2, { x: 100, y: 100, button: 1 }));
    assert.equal(pan.editor.state.interaction.type, EditorInteractionType.PAN);
    pan.manager.handlePointerUp(pointer(2));
    pan.manager.setSpacePan(true);
    pan.manager.handlePointerDown(pointer(3, { x: 100, y: 100 }));
    assert.equal(pan.editor.state.interaction.type, EditorInteractionType.PAN);
});

test('touch threshold transitions exclusively to object drag or empty-space pan', () => {
    const object = { id: 'planet_1', position: { x: 20, y: 30 }, constructor: { name: 'Planet' } };
    const drag = createToolHarness(object);
    drag.manager.handlePointerDown(pointer(8, { x: 20, y: 30, pointerType: 'touch' }));
    assert.equal(drag.editor.state.interaction.type, EditorInteractionType.TOUCH_PENDING);
    drag.manager.handlePointerMove(pointer(8, { x: 25, y: 35, pointerType: 'touch' }));
    assert.equal(drag.editor.state.interaction.type, EditorInteractionType.TOUCH_PENDING);
    drag.manager.handlePointerMove(pointer(8, { x: 45, y: 55, pointerType: 'touch' }));
    assert.equal(drag.editor.state.interaction.type, EditorInteractionType.DRAG_OBJECT);

    const pan = createToolHarness(null);
    pan.manager.handlePointerDown(pointer(9, { x: 10, y: 10, pointerType: 'touch' }));
    pan.manager.handlePointerMove(pointer(9, { x: 40, y: 40, pointerType: 'touch' }));
    assert.equal(pan.editor.state.interaction.type, EditorInteractionType.PAN);
});

class ValueCommand extends LiveEditCommand {
    static type = 'value.set';
    do() {
        this.context.value = this.payload.after;
        if (this.payload.fail) throw new Error('projection failed');
        return true;
    }
    undo() {
        this.context.value = this.payload.before;
        return true;
    }
}

test('command bus coalesces live updates, cancels, and rolls back failures', () => {
    const context = { value: 0 };
    const history = new CommandHistory(new CommandRegistry([ValueCommand]), context);
    const events = new EditorEvents();
    const changes = [];
    events.on(EditorEventType.DOCUMENT_CHANGED, event => changes.push(event));
    const bus = new EditorCommandBus({ history, events });

    assert.equal(bus.begin(ValueCommand.type, { before: 0, after: 0 }), true);
    assert.equal(bus.update({ after: 2 }), true);
    assert.equal(bus.update({ after: 4 }), true);
    assert.equal(bus.commit(), true);
    assert.equal(context.value, 4);
    assert.equal(history.undoStack.length, 1);
    assert.equal(changes.length, 1);
    assert.equal(bus.undo(), true);
    assert.equal(context.value, 0);
    assert.equal(bus.redo(), true);
    assert.equal(context.value, 4);

    assert.equal(bus.begin(ValueCommand.type, { before: 4, after: 4 }), true);
    assert.equal(bus.update({ after: 8 }), true);
    assert.equal(bus.cancel(), true);
    assert.equal(context.value, 4);
    assert.equal(history.undoStack.length, 1);

    assert.equal(bus.execute(ValueCommand.type, { before: 4, after: 9, fail: true }), false);
    assert.equal(context.value, 4);
    assert.equal(history.undoStack.length, 1);
    assert.match(bus.lastError.message, /projection failed/);
});
