import assert from 'node:assert/strict';
import test from 'node:test';

import { getEditorObjectDefinition } from '../js/editorObjectRegistry.js';

test('object descriptors create canonical authored definitions without runtime objects', () => {
    const descriptor = getEditorObjectDefinition('Planet');
    const [definition] = descriptor.createAuthoringDefinitions({ x: 125, y: 240 });

    assert.equal(definition.type, 'planet');
    assert.deepEqual(definition.position, { x: 125, y: 240 });
    assert.equal(definition.properties.radius, 50);
    assert.equal(definition.properties.mass, 1000);
    assert.equal(definition.properties.planetType, 'planet_grey');
    assert.equal(typeof descriptor.createRuntime, 'function');
});

test('portal descriptor owns paired authoring behavior', () => {
    const descriptor = getEditorObjectDefinition('Portal');
    const definitions = descriptor.createAuthoringDefinitions({
        x: 400,
        y: 300,
        allocatePairNumber: () => 3
    });

    assert.equal(definitions.length, 2);
    assert.deepEqual(definitions.map(definition => definition.properties.id), [
        'portal_pair_3_red',
        'portal_pair_3_blue'
    ]);
    assert.equal(definitions[0].properties.pairedPortalId, definitions[1].properties.id);
    assert.equal(definitions[1].properties.pairedPortalId, definitions[0].properties.id);
    assert.ok(definitions[0].position.x < 400);
    assert.ok(definitions[1].position.x > 400);
});
