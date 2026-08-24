import assert from 'node:assert/strict';
import test from 'node:test';

import { LiveEditCommandType } from '../js/editorCommands/index.js';
import EditorCommandBus from '../js/levelEditor/editorCommandBus.js';
import {
    EditorCommandIntent,
    registerDeleteObjectCommandStrategies
} from '../js/levelEditor/deleteObjectCommandStrategies.js';

function createHarness(portals = []) {
    const calls = [];
    const commandBus = new EditorCommandBus();
    commandBus.execute = (type, payload) => {
        calls.push({ type, payload });
        return true;
    };
    registerDeleteObjectCommandStrategies({
        commandBus,
        findPortal: id => portals.find(portal => portal.id === id)
    });
    return { commandBus, calls };
}

test('regular delete strategy emits a remove-object command on the command bus', () => {
    class Planet {}
    const object = Object.assign(new Planet(), { id: 'planet-1' });
    const { commandBus, calls } = createHarness();

    assert.equal(commandBus.emit(EditorCommandIntent.DELETE_SELECTED_OBJECT, { object }), true);
    assert.deepEqual(calls, [{
        type: LiveEditCommandType.REMOVE_OBJECT,
        payload: { objectId: 'planet-1', className: 'Planet' }
    }]);
});

test('portal delete strategy emits one grouped command for both portals', () => {
    class Portal {}
    const pair = Object.assign(new Portal(), { id: 'portal-blue', pairedPortalId: 'portal-red' });
    const object = Object.assign(new Portal(), { id: 'portal-red', pairedPortalId: pair.id });
    const { commandBus, calls } = createHarness([object, pair]);

    assert.equal(commandBus.emit(EditorCommandIntent.DELETE_SELECTED_OBJECT, { object }), true);
    assert.deepEqual(calls, [{
        type: LiveEditCommandType.OBJECT_GROUP,
        payload: { objectIds: ['portal-red', 'portal-blue'], operation: 'remove' }
    }]);
});
