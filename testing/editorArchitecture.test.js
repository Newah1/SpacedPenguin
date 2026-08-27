import test from 'node:test';
import assert from 'node:assert/strict';

import EditorEvents, { EditorEventType } from '../js/editor/state/editorEvents.js';
import EditorSelection from '../js/editor/state/editorSelection.js';
import EditorState, { EditorInteractionType } from '../js/editor/state/editorState.js';
import EditorToolManager from '../js/editor/controllers/editorToolManager.js';
import EditorCommandBus from '../js/editor/commands/editorCommandBus.js';
import LevelDocument from '../js/editor/state/levelDocument.js';
import DocumentMutationService from '../js/editor/services/documentMutationService.js';
import { projectDocumentDefinition } from '../js/editor/services/documentProjectionTransaction.js';
import LiveEditCommand from '../js/editor/commands/live/liveEditCommand.js';
import CommandHistory from '../js/editor/commands/live/commandHistory.js';
import CommandRegistry from '../js/editor/commands/live/commandRegistry.js';
import { createLiveEditHistory, LiveEditCommandType } from '../js/editor/commands/live/index.js';
import {
    listEditableLevelObjectTypes,
    getGameObjectDefinition
} from '../js/runtime/gameObjectRegistry.js';

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
    for (const type of listEditableLevelObjectTypes()) {
        const definition = getGameObjectDefinition(type);
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

function createDocumentCommandHarness() {
    const document = LevelDocument.fromDefinition(validDefinition());
    const mutations = new DocumentMutationService();
    let projected = document.toDefinition();
    const context = {
        documentDefinition: () => document.toDefinition(),
        applyDocumentDefinition(definition) {
            document.replace(definition);
            projected = document.toDefinition();
            return true;
        },
        mutateObjectProperty: (...args) => mutations.setObjectProperty(...args),
        mutateObjectPosition: (...args) => mutations.setObjectPosition(...args),
        mutateOrbitCenter: (...args) => mutations.setOrbitCenter(...args),
        mutateWaypoint: (...args) => mutations.setWaypoint(...args),
        mutateLevelSetting: (...args) => mutations.setLevelSetting(...args),
        mutatePlanetAdjustments: (...args) => mutations.applyPlanetAdjustments(...args),
        getObjectDefinition(id) {
            const object = document.getObject(id);
            return object ? {
                definition: structuredClone(object),
                index: document.listObjects().indexOf(object)
            } : null;
        },
        applyDocumentPatches(patches) {
            const candidate = LevelDocument.fromDefinition(document.toDefinition());
            for (const patch of patches) if (!candidate.applyPatch(patch)) return false;
            return this.applyDocumentDefinition(candidate.toDefinition());
        },
        resolveObject: id => projected.objects.find(object => object.properties.id === id),
        refresh() {},
        levelSettingsTarget: { isLevelSettings: true }
    };
    const history = createLiveEditHistory(context);
    const bus = new EditorCommandBus({ history, validate: () => document.validate() });
    return { document, context, history, bus, get projected() { return projected; } };
}

test('production property and level-setting commands mutate the document before projection', () => {
    const harness = createDocumentCommandHarness();
    const planetId = harness.document.listObjects()[0].properties.id;
    assert.equal(harness.bus.execute(LiveEditCommandType.SET_OBJECT_PROPERTY, {
        objectId: planetId,
        property: 'mass',
        value: 42,
        sessionId: 1
    }), true);
    assert.equal(harness.document.getObject(planetId).properties.mass, 42);
    assert.equal(harness.projected.objects[0].properties.mass, 42);
    assert.equal(harness.bus.undo(), true);
    assert.equal(harness.document.getObject(planetId).properties.mass, 0);
    assert.equal(harness.bus.redo(), true);
    assert.equal(harness.document.getObject(planetId).properties.mass, 42);

    assert.equal(harness.bus.execute(LiveEditCommandType.SET_LEVEL_SETTING, {
        property: 'gravitationalConstant', value: 0, sessionId: 2
    }), true);
    assert.equal(harness.document.toDefinition().rules.gravitationalConstant, 0);
    assert.equal(harness.projected.rules.gravitationalConstant, 0);
});

test('document-first live movement commits one entry and cancel restores the authored start', () => {
    const harness = createDocumentCommandHarness();
    const planetId = harness.document.listObjects()[0].properties.id;
    assert.equal(harness.bus.begin(LiveEditCommandType.MOVE_OBJECT, {
        objectId: planetId,
        before: { x: 300, y: 300 },
        after: { x: 300, y: 300 }
    }), true);
    harness.bus.update({ after: { x: 350, y: 320 } });
    harness.bus.update({ after: { x: 380, y: 340 } });
    assert.deepEqual(harness.document.getObject(planetId).position, { x: 380, y: 340 });
    assert.equal(harness.bus.cancel(), true);
    assert.deepEqual(harness.document.getObject(planetId).position, { x: 300, y: 300 });

    harness.bus.begin(LiveEditCommandType.MOVE_OBJECT, {
        objectId: planetId,
        before: { x: 300, y: 300 },
        after: { x: 300, y: 300 }
    });
    harness.bus.update({ after: { x: 400, y: 360 } });
    assert.equal(harness.bus.commit(), true);
    assert.equal(harness.history.undoStack.length, 1);
    harness.bus.undo();
    assert.deepEqual(harness.document.getObject(planetId).position, { x: 300, y: 300 });
});

test('waypoint drags commit one document-first undo entry', () => {
    const harness = createDocumentCommandHarness();
    const planetId = harness.document.listObjects()[0].properties.id;
    assert.equal(harness.bus.execute(LiveEditCommandType.SET_OBJECT_PROPERTY, {
        objectId: planetId,
        property: 'waypointMode',
        value: 'pingpong',
        sessionId: 3
    }), true);
    const before = harness.document.getObject(planetId)
        .properties.waypointPath.waypoints[1];
    const undoEntriesBeforeDrag = harness.history.undoStack.length;
    assert.equal(harness.bus.begin(LiveEditCommandType.MOVE_WAYPOINT, {
        objectId: planetId,
        waypointIndex: 1,
        before,
        after: before
    }), true);
    assert.equal(harness.bus.update({ after: { x: 460, y: 375 } }), true);
    assert.equal(harness.bus.update({ after: { x: 480, y: 390 } }), true);
    assert.equal(harness.bus.commit(), true);
    assert.equal(harness.history.undoStack.length, undoEntriesBeforeDrag + 1);
    assert.deepEqual(
        harness.document.getObject(planetId).properties.waypointPath.waypoints[1],
        { x: 480, y: 390 }
    );
    assert.equal(harness.bus.undo(), true);
    assert.deepEqual(
        harness.document.getObject(planetId).properties.waypointPath.waypoints[1],
        before
    );
});

test('document-first grouped portal mutations remain atomic through undo and redo', () => {
    const harness = createDocumentCommandHarness();
    const entries = [
        {
            definition: {
                type: 'portal', position: { x: 200, y: 200 },
                properties: { id: 'portal_red', name: 'Red', color: 'red', pairedPortalId: 'portal_blue' }
            },
            index: 2
        },
        {
            definition: {
                type: 'portal', position: { x: 600, y: 400 },
                properties: { id: 'portal_blue', name: 'Blue', color: 'blue', pairedPortalId: 'portal_red' }
            },
            index: 3
        }
    ];
    assert.equal(harness.bus.execute(LiveEditCommandType.OBJECT_GROUP, {
        entries, operation: 'add'
    }), true);
    assert.deepEqual(harness.document.listObjects().slice(-2).map(object => object.properties.id),
        ['portal_red', 'portal_blue']);
    assert.equal(harness.bus.undo(), true);
    assert.equal(harness.document.getObject('portal_red'), null);
    assert.equal(harness.document.getObject('portal_blue'), null);
    assert.equal(harness.bus.redo(), true);
    assert.ok(harness.document.getObject('portal_red'));
    assert.ok(harness.document.getObject('portal_blue'));
});

test('projection failure restores the prior document and last-known-good runtime', () => {
    const document = LevelDocument.fromDefinition(validDefinition());
    const prior = document.toDefinition();
    const next = structuredClone(prior);
    next.name = 'Rejected projection';
    let rebuilt = null;
    const projector = {
        applyDefinition() { throw new Error('injected projection failure'); },
        rebuild(definition) { rebuilt = structuredClone(definition); }
    };
    assert.throws(() => projectDocumentDefinition({
        document, projector, definition: next
    }), /injected projection failure/);
    assert.deepEqual(document.toDefinition(), prior);
    assert.deepEqual(rebuilt, prior);
});

test('invalid authored candidates are rejected before the runtime projector is touched', () => {
    const document = LevelDocument.fromDefinition(validDefinition());
    const prior = document.toDefinition();
    const invalid = structuredClone(prior);
    invalid.objects[1].properties.id = invalid.objects[0].properties.id;
    let calls = 0;
    const projector = {
        applyDefinition() { calls += 1; },
        rebuild() { calls += 1; }
    };
    assert.throws(() => projectDocumentDefinition({
        document, projector, definition: invalid
    }), /unique|duplicate/i);
    assert.equal(calls, 0);
    assert.deepEqual(document.toDefinition(), prior);
});

function createToolHarness(hit = null) {
    const calls = [];
    const selected = [];
    const object = ['orbitCenter', 'waypoint', 'rotationHandle'].includes(hit?.type) ? hit.object : hit;
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

test('tool manager drags waypoint handles and synchronizes inspector coordinates', () => {
    const object = {
        id: 'planet_1',
        position: { x: 20, y: 30 },
        waypointSystem: { waypoints: [{ x: 20, y: 30 }, { x: 120, y: 30 }] },
        constructor: { name: 'Planet' }
    };
    const hit = {
        type: 'waypoint', object, waypointIndex: 1,
        point: { x: 120, y: 30 }
    };
    const drag = createToolHarness(hit);
    drag.manager.handlePointerDown(pointer(11, { x: 122, y: 32 }));
    assert.equal(drag.editor.state.interaction.type, EditorInteractionType.DRAG_WAYPOINT);
    assert.equal(drag.editor.game.canvas.style.cursor, 'grabbing');
    drag.manager.handlePointerMove(pointer(11, { x: 172, y: 82 }));
    assert.deepEqual(drag.calls.find(call => call[0] === 'update')[1].after, { x: 170, y: 80 });
    assert.equal(drag.calls.find(call => call[0] === 'begin')[1], 'waypoint.move');
    drag.manager.handlePointerUp(pointer(11, { x: 172, y: 82 }));
    assert.equal(drag.calls.at(-1)[0], 'commit');
});

test('document-first rotation commits one entry and restores the authored angle on undo', () => {
    const harness = createDocumentCommandHarness();
    const planetId = harness.document.listObjects()[0].properties.id;
    assert.equal(harness.bus.begin(LiveEditCommandType.ROTATE_OBJECT, {
        objectId: planetId,
        before: 0,
        after: 0
    }), true);
    assert.equal(harness.bus.update({ after: 135 }), true);
    assert.equal(harness.bus.commit(), true);
    assert.equal(harness.document.getObject(planetId).properties.rotation, 135);
    assert.equal(harness.bus.undo(), true);
    assert.equal(harness.document.getObject(planetId).properties.rotation, undefined);
});

test('rotation handle drag continuously updates degrees and commits one undo entry', () => {
    const object = {
        id: 'portal_1', position: { x: 100, y: 100 }, rotation: 0,
        constructor: { name: 'Portal' }
    };
    const hit = { type: 'rotationHandle', object, point: { x: 70, y: 70 } };
    const drag = createToolHarness(hit);
    drag.editor.overlayRenderer.runtimeController.getDisplayPosition = () => ({ x: 100, y: 100 });

    drag.manager.handlePointerDown(pointer(12, { x: 70, y: 70 }));
    assert.equal(drag.editor.state.interaction.type, EditorInteractionType.ROTATE_OBJECT);
    assert.equal(drag.calls.find(call => call[0] === 'begin')[1], LiveEditCommandType.ROTATE_OBJECT);

    drag.manager.handlePointerMove(pointer(12, { x: 130, y: 70 }));
    const rotation = drag.calls.find(call => call[0] === 'update')[1].after;
    assert.equal(Math.round(rotation), 90);
    drag.manager.handlePointerUp(pointer(12, { x: 130, y: 70 }));
    assert.equal(drag.calls.at(-1)[0], 'commit');
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
