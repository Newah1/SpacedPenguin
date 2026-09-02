import assert from 'node:assert/strict';
import test from 'node:test';
import './nodeShims.js';

const { GameObjectFactory } = await import('../js/levels/levelLoader.js');
const {
    RUNTIME_CONSTRUCTOR_CATALOG,
    getRuntimeConstructor
} = await import('../js/runtime/runtimeConstructorCatalog.js');
const {
    GAME_OBJECT_DEFINITIONS,
    GAME_OBJECT_DEFINITIONS_BY_TYPE,
    LEVEL_OBJECT_TYPES,
    LEVEL_OBJECT_TYPE_BY_CLASS_NAME
} = await import('../js/runtime/gameObjectRegistry.js');

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

test('factory creates an editable deflector bumper with authored physics and presentation', () => {
    const bumper = GameObjectFactory.create({
        type: 'bumper',
        position: { x: 80, y: 90 },
        properties: { id: 'bumper_1', radius: 22, restitution: 1.1, color: '#00ffaa', playSound: false }
    }, null, null);

    assert.equal(bumper.constructor, getRuntimeConstructor('DeflectorBumper'));
    assert.deepEqual(bumper.position, { x: 80, y: 90 });
    assert.equal(bumper.radius, 22);
    assert.equal(bumper.restitution, 1.1);
    assert.equal(bumper.color, '#00ffaa');
    assert.equal(bumper.playSound, false);
});

test('factory projects authored rotation onto common runtime objects', () => {
    const planet = GameObjectFactory.create({
        type: 'planet',
        position: { x: 25, y: 40 },
        properties: { radius: 12, mass: 50, rotation: 135 }
    }, null, null);

    assert.equal(planet.rotation, 135);
});

test('collecting and resetting a runtime bonus keeps its hit presentation visible and state synchronized', () => {
    const normalSprite = { complete: true, name: 'bonus' };
    const hitSprite = { complete: true, name: 'bonus_hit' };
    const assetLoader = {
        getGameSprite(key) {
            return key === 'bonus_hit' ? hitSprite : normalSprite;
        }
    };
    const Bonus = getRuntimeConstructor('Bonus');
    const bonus = new Bonus(25, 40, 100, assetLoader);

    assert.equal(bonus.collected, false);
    assert.equal(bonus.collect(), 100);
    assert.equal(bonus.state, 'Hit');
    assert.equal(bonus.collected, true);
    assert.equal(bonus.currentSprite, hitSprite);

    const rotationBeforeUpdate = bonus.rotation;
    bonus.update(1 / 60, { updateOrbit: false });
    assert.ok(bonus.rotation > rotationBeforeUpdate);
    assert.equal(bonus.collected, true);

    const calls = [];
    const context = {
        save: () => calls.push(['save']),
        restore: () => calls.push(['restore']),
        translate: (...args) => calls.push(['translate', ...args]),
        rotate: (...args) => calls.push(['rotate', ...args]),
        drawImage: (...args) => calls.push(['drawImage', ...args]),
        set globalAlpha(value) { calls.push(['globalAlpha', value]); }
    };

    bonus.drawSprite(context);
    const drawCall = calls.find(([method]) => method === 'drawImage');
    assert.ok(drawCall, 'expected collected bonus to remain visible');
    assert.equal(drawCall[1], hitSprite);
    assert.equal(bonus.collected, true);

    bonus.reset();
    assert.equal(bonus.state, 'notHit');
    assert.equal(bonus.collected, false);
    assert.equal(bonus.currentSprite, normalSprite);
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
    const vocabulary = await import('../js/levels/levelObjectVocabulary.js');
    assert.equal(Object.hasOwn(vocabulary, 'LevelObjectType'), false);
    assert.equal(Object.hasOwn(vocabulary, 'normalizeLevelObjectType'), false);
});
