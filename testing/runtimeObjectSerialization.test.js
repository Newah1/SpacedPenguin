import test from 'node:test';
import assert from 'node:assert/strict';

import {
    isRuntimeObjectExportable,
    serializeRuntimeObject
} from '../js/runtime/runtimeObjectSerialization.js';

test('runtime serialization uses stable level type identity instead of constructor names', () => {
    const object = {
        levelType: 'textobject',
        position: { x: 10, y: 20 },
        content: 'Tutorial text',
        width: 140,
        maxWidth: 340,
        padding: 10,
        fontSize: 18,
        constructor: { name: 'MinifiedName' }
    };

    const exported = serializeRuntimeObject(object);

    assert.equal(exported.type, 'textobject');
    assert.deepEqual(exported.position, { x: 10, y: 20 });
    assert.equal(exported.properties.width, 360);
    assert.equal(exported.properties.content, 'Tutorial text');
});

test('runtime serialization ignores unregistered primitive runtime state', () => {
    const object = {
        levelType: 'planet',
        position: { x: 100, y: 200 },
        radius: 40,
        mass: 200,
        collisionRadius: 45,
        gravitationalReach: 5000,
        animationFrame: 12,
        runtimeCacheHit: true
    };

    const exported = serializeRuntimeObject(object);

    assert.equal(exported.properties.radius, 40);
    assert.equal(exported.properties.collisionRadius, 45);
    assert.equal('animationFrame' in exported.properties, false);
    assert.equal('runtimeCacheHit' in exported.properties, false);
});

test('runtime serialization preserves pointing targets and delegates orbit serialization', () => {
    const orbitSystem = { orbitType: 'circular' };
    const object = {
        levelType: 'pointingarrow',
        position: { x: 5, y: 6 },
        pointingAt: { x: 700, y: 300 },
        orbitSystem
    };

    const exported = serializeRuntimeObject(object, {
        serializeOrbit: orbit => ({ source: orbit.orbitType })
    });

    assert.deepEqual(exported.properties.pointingAt, { x: 700, y: 300 });
    assert.deepEqual(exported.properties.orbit, { source: 'circular' });
    assert.notEqual(exported.properties.pointingAt, object.pointingAt);
});

test('non-level runtime objects are not exportable', () => {
    assert.equal(isRuntimeObjectExportable({ levelType: 'penguin' }), false);
    assert.equal(isRuntimeObjectExportable({ constructor: { name: 'BonusPopup' } }), false);
    assert.equal(serializeRuntimeObject({ levelType: 'penguin' }), null);
});
