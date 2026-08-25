import assert from 'node:assert/strict';
import test from 'node:test';
import './nodeShims.js';

const { GameObjectFactory } = await import('../js/levelLoader.js');
const {
    RUNTIME_CONSTRUCTOR_CATALOG,
    getRuntimeConstructor
} = await import('../js/runtimeConstructorCatalog.js');
const {
    GAME_OBJECT_DEFINITIONS,
    GAME_OBJECT_DEFINITIONS_BY_TYPE,
    LEVEL_OBJECT_TYPES,
    LEVEL_OBJECT_TYPE_BY_CLASS_NAME
} = await import('../js/gameObjectRegistry.js');

test('browser runtime constructors are composed outside LevelLoader', () => {
    assert.equal(Object.hasOwn(GameObjectFactory, 'constructors'), false);
    assert.equal(Object.isFrozen(RUNTIME_CONSTRUCTOR_CATALOG), true);
    assert.equal(getRuntimeConstructor('Planet').name, 'Planet');
    assert.equal(getRuntimeConstructor('BlackHole').name, 'BlackHole');
});

test('missing browser runtime constructor bindings fail explicitly', () => {
    assert.throws(
        () => getRuntimeConstructor('UnregisteredObject'),
        /No browser runtime constructor is bound/
    );
});

test('factory creates a registered runtime object through composition', () => {
    const planet = GameObjectFactory.create({
        type: 'planet',
        position: { x: 25, y: 40 },
        properties: { radius: 12, mass: 50 }
    }, null, null);

    assert.equal(planet.constructor, getRuntimeConstructor('Planet'));
    assert.deepEqual(planet.position, { x: 25, y: 40 });
});

test('the registry completely owns every serialized game-object extension', () => {
    const serializedDefinitions = Object.values(GAME_OBJECT_DEFINITIONS)
        .filter(definition => definition.type);

    assert.deepEqual(
        new Set(LEVEL_OBJECT_TYPES),
        new Set(serializedDefinitions.map(definition => definition.type))
    );
    assert.equal(
        Object.keys(GAME_OBJECT_DEFINITIONS_BY_TYPE).length,
        serializedDefinitions.length,
        'serialized types must be unique'
    );

    for (const definition of serializedDefinitions) {
        assert.equal(LEVEL_OBJECT_TYPE_BY_CLASS_NAME[definition.className], definition.type);
        assert.equal(
            typeof RUNTIME_CONSTRUCTOR_CATALOG[definition.className],
            'function',
            `${definition.className} must be exported by a composed runtime module`
        );
        assert.equal(
            new Set(definition.serializedProperties).size,
            definition.serializedProperties.length,
            `${definition.className} serialization properties must be unique`
        );
        if (definition.editable) {
            assert.equal(typeof definition.createRuntime, 'function');
            assert.equal(typeof definition.createAuthoringDefinitions, 'function');
            assert.equal(
                Boolean(definition.singleton || definition.collections.length),
                true,
                `${definition.className} must declare runtime ownership`
            );
        }
    }
});

test('non-object level vocabulary does not retain a compatibility facade', async () => {
    const vocabulary = await import('../js/levelObjectVocabulary.js');
    assert.equal(Object.hasOwn(vocabulary, 'LevelObjectType'), false);
    assert.equal(Object.hasOwn(vocabulary, 'normalizeLevelObjectType'), false);
});
