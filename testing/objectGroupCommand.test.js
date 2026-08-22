import assert from 'node:assert/strict';
import test from 'node:test';

import { createLiveEditHistory, LiveEditCommandType } from '../js/editorCommands/index.js';

class Portal {}

test('grouped editor mutations roll back earlier objects when a later mutation fails', () => {
    const applied = [];
    let refreshCount = 0;
    const red = new Portal();
    const blue = new Portal();
    const mutator = {
        addObject(object) {
            if (object === blue) return false;
            applied.push(object);
            return true;
        },
        removeObject(object) {
            const index = applied.indexOf(object);
            if (index >= 0) applied.splice(index, 1);
            return true;
        }
    };
    const history = createLiveEditHistory({
        mutator,
        refresh() { refreshCount += 1; },
        updateOrbitSystem() {}
    });

    assert.equal(history.execute(LiveEditCommandType.OBJECT_GROUP, {
        objects: [red, blue],
        operation: 'add'
    }), false);
    assert.deepEqual(applied, []);
    assert.equal(refreshCount, 0);
    assert.equal(history.undoStack.length, 0);
});
