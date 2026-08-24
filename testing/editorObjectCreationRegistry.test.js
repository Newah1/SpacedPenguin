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

test('portal descriptor owns paired cloning behavior', () => {
    const descriptor = getEditorObjectDefinition('Portal');
    const red = {
        type: 'portal', position: { x: 100, y: 200 },
        properties: { id: 'red', color: 'red', pairedPortalId: 'blue' }
    };
    const blue = {
        type: 'portal', position: { x: 300, y: 200 },
        properties: { id: 'blue', color: 'blue', pairedPortalId: 'red' }
    };
    const clones = descriptor.cloneAuthoringDefinitions({
        source: blue,
        resolveDefinition: id => id === 'red' ? red : blue,
        allocatePairNumber: () => 4
    });

    assert.deepEqual(clones.map(clone => clone.properties.id), [
        'portal_pair_4_red', 'portal_pair_4_blue'
    ]);
    assert.equal(clones[0].properties.pairedPortalId, clones[1].properties.id);
    assert.equal(clones[1].properties.pairedPortalId, clones[0].properties.id);
});

test('object descriptors own type-specific transient property behavior', () => {
    const text = {
        width: 100, padding: 10, parseHTMLContent: content => ({ content })
    };
    const textHook = getEditorObjectDefinition('TextObject').applyRuntimeProperty;
    assert.equal(textHook({ object: text, property: 'width', value: 240 }), true);
    assert.equal(text.maxWidth, 220);

    const arrow = { pointingAt: null, visible: false };
    const arrowHook = getEditorObjectDefinition('PointingArrow').applyRuntimeProperty;
    assert.equal(arrowHook({ object: arrow, property: 'pointingAtX', value: 80 }), true);
    assert.deepEqual(arrow.pointingAt, { x: 80, y: 0 });
    assert.equal(arrow.visible, true);
});
