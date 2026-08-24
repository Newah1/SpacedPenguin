import assert from 'node:assert/strict';
import test from 'node:test';

import { createLiveEditHistory, LiveEditCommandType } from '../js/editorCommands/index.js';

test('grouped document mutations publish no partial state when projection fails', () => {
    const applied = [];
    let refreshCount = 0;
    const entries = [
        { definition: { type: 'portal', properties: { id: 'red' } }, index: 0 },
        { definition: { type: 'portal', properties: { id: 'blue' } }, index: 1 }
    ];
    const history = createLiveEditHistory({
        applyDocumentPatches(patches) {
            const staged = [...applied];
            for (const patch of patches) {
                staged.push(patch.object.properties.id);
                if (patch.object.properties.id === 'blue') {
                    throw new Error('injected projection failure');
                }
            }
            applied.splice(0, applied.length, ...staged);
            return true;
        },
        refresh() { refreshCount += 1; }
    });

    assert.throws(() => history.execute(LiveEditCommandType.OBJECT_GROUP, {
        entries,
        operation: 'add'
    }), /injected projection failure/);
    assert.deepEqual(applied, []);
    assert.equal(refreshCount, 0);
    assert.equal(history.undoStack.length, 0);
});
