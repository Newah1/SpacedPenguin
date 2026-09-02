import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
    GAME_OBJECT_CONTRACTS,
    LEVEL_DEFAULTS as GENERATED_LEVEL_DEFAULTS,
    LEVEL_OBJECT_TYPE_ALIASES,
    normalizeLevelObjectType
} from '../generated/js/gameObjectTypes.js';
import {
    isSimulationEvent,
    SIMULATION_EVENT_SHAPES,
    SimulationEventType
} from '../generated/js/simulationTypes.js';
import { LEVEL_DOCUMENT_JSON_SCHEMA } from '../generated/js/levelSchema.js';
import {
    decodeSimulationStepPatch,
    encodeSimulationStepInput,
    encodeSimulationStepPatch,
    SIMULATION_WIRE_VERSION
} from '../generated/js/simulationWire.js';
import { LEVEL_DEFAULTS, SIMULATION_CONFIG } from '../js/config/gameConfig.js';
import { createSimulationStateFromLevel } from '../js/simulation/simulationState.js';
import {
    computeSimulationWireFingerprint,
    validateGameplaySimulationProjections,
    validateSimulationWireLayout
} from '../tools/generateDomainContracts.js';

const root = new URL('../', import.meta.url);

test('generated domain artifacts are reproducible from the canonical schemas', () => {
    const result = spawnSync(process.execPath, ['tools/generateDomainContracts.js', '--check'], {
        cwd: new URL('.', root), encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('game object aliases, defaults, capabilities, and editor metadata come from generated contracts', () => {
    assert.equal(LEVEL_OBJECT_TYPE_ALIASES.booster, 'speedbooster');
    assert.equal(normalizeLevelObjectType(' speedBooster '), 'speedbooster');
    assert.equal(normalizeLevelObjectType('BOOSTER'), 'speedbooster');
    assert.deepEqual(GAME_OBJECT_CONTRACTS.SpeedBooster.defaults, {
        width: 64, height: 32, rotation: 0, speedMultiplier: 1, playSound: true
    });
    assert.equal(GAME_OBJECT_CONTRACTS.SpeedBooster.capabilities.gameplay, true);
    assert.equal(GAME_OBJECT_CONTRACTS.SpeedBooster.capabilities.waypointSource, true);
    assert.ok(GAME_OBJECT_CONTRACTS.SpeedBooster.properties.some(field => field.key === 'playSound'));
});

test('public LEVEL_DEFAULTS is an exact generated view with only authored defaults', async () => {
    const [objectSchema, levelSchema] = await Promise.all([
        readFile(new URL('domain/gameObjects.schema.json', root), 'utf8').then(JSON.parse),
        readFile(new URL('domain/level.schema.json', root), 'utf8').then(JSON.parse)
    ]);
    const generatedSections = Object.fromEntries(objectSchema['x-spaced-penguin-objects']
        .map(object => [object['x-spaced-penguin-level-defaults'], object])
        .filter(([metadata]) => metadata)
        .map(([metadata, object]) => {
            const properties = object.properties || {};
            const defaults = Object.fromEntries((metadata.include || []).map(key => {
                assert.ok(properties[key] && Object.hasOwn(properties[key], 'default'),
                    `${object.className}.${key} needs a schema default`);
                return [key, properties[key].default];
            }));
            return [metadata.key, { ...defaults, ...(metadata.derived || {}) }];
        }));
    const ruleKeys = levelSchema['x-spaced-penguin-level-defaults']?.rules || [];
    const rules = Object.fromEntries(ruleKeys.map(key => {
        const property = levelSchema.$defs.Rules.properties[key];
        assert.ok(Object.hasOwn(property, 'default'), `Rules.${key} needs a schema default`);
        return [key, property.default];
    }));
    const expected = {
        ...generatedSections,
        rules
    };

    assert.deepEqual(GENERATED_LEVEL_DEFAULTS, expected);
    assert.deepEqual(LEVEL_DEFAULTS, expected);
    assert.deepEqual(Object.keys(LEVEL_DEFAULTS).sort(), Object.keys(expected).sort());
    assert.equal(LEVEL_DEFAULTS.planet.collisionPadding, 8);
    assert.equal(LEVEL_DEFAULTS.bonus.collectionPadding, 8);
    assert.equal(LEVEL_DEFAULTS.text.visible, true);
    assert.equal(Object.hasOwn(LEVEL_DEFAULTS.pointingArrow, 'visible'), false);
    assert.equal(LEVEL_DEFAULTS.rules.scoreMultiplier, 1);
    assert.equal(Object.isFrozen(LEVEL_DEFAULTS), true);
    assert.equal(Object.isFrozen(GENERATED_LEVEL_DEFAULTS), true);

    const forbiddenBySection = {
        planet: ['collidable'],
        bonus: ['collected'],
        portal: ['rotation'],
        speedBooster: ['rotation'],
        slingshot: ['launchModel'],
        pointingArrow: ['visible']
    };
    for (const [sectionName, forbiddenFields] of Object.entries(forbiddenBySection)) {
        for (const forbidden of forbiddenFields) {
            const section = GENERATED_LEVEL_DEFAULTS[sectionName];
            assert.equal(Object.hasOwn(section, forbidden), false,
                `${forbidden} should remain a schema/runtime default, not a public LEVEL_DEFAULTS field`);
        }
    }
});

test('generated JavaScript and Rust expose the complete simulation event union', async () => {
    assert.deepEqual(Object.keys(SIMULATION_EVENT_SHAPES).sort(), Object.values(SimulationEventType).sort());
    assert.equal(isSimulationEvent({ type: SimulationEventType.PORTAL_TELEPORTED,
        sourcePortalId: 'a', destinationPortalId: 'b', entryPosition: {}, exitPosition: {},
        incomingVelocity: {}, velocity: {}, playSound: true }), true);
    const rust = await readFile(new URL('generated/rust/simulation_events.rs', root), 'utf8');
    for (const type of Object.values(SimulationEventType)) {
        const variant = type.split('_').map(part => part[0].toUpperCase() + part.slice(1)).join('');
        assert.match(rust, new RegExp(`\\b${variant}\\b`));
    }
});

test('external level schema expands every editable object variant', () => {
    const variants = LEVEL_DOCUMENT_JSON_SCHEMA.$defs.GameObject.oneOf;
    const expected = Object.values(GAME_OBJECT_CONTRACTS).filter(contract => contract.capabilities.editable);
    assert.equal(variants.length, expected.length);
    assert.ok(variants.some(variant => variant.properties.type.enum.includes('booster')));
});

test('generated simulation wire encodes the canonical state more compactly than JSON', () => {
    const state = createSimulationStateFromLevel({
        startPosition: { x: 100, y: 300 }, targetPosition: { x: 700, y: 300 },
        objects: [{ type: 'speedbooster', position: { x: 300, y: 300 }, properties: { id: 'boost', playSound: false } }], rules: {}
    });
    const wire = encodeSimulationStepInput(state, SIMULATION_CONFIG);
    const json = new TextEncoder().encode(JSON.stringify({ state, simulation: SIMULATION_CONFIG }));
    assert.equal(SIMULATION_WIRE_VERSION, 2);
    assert.ok(wire.byteLength < json.byteLength, `${wire.byteLength} should be less than ${json.byteLength}`);
});

test('simulation wire layout rejects reachable fields without generator coverage', async () => {
    const schema = JSON.parse(await readFile(new URL('domain/simulation.schema.json', root), 'utf8'));
    assert.doesNotThrow(() => validateSimulationWireLayout(schema));

    schema.$defs.Portal.properties.cooldownTicks = { type: 'integer', minimum: 0 };
    assert.throws(
        () => validateSimulationWireLayout(schema),
        /Simulation wire layout does not cover Portal\.cooldownTicks/
    );
});

test('gameplay object projections reject an authored field without a declarative mapping', async () => {
    const [objects, simulation] = await Promise.all([
        readFile(new URL('domain/gameObjects.schema.json', root), 'utf8').then(JSON.parse),
        readFile(new URL('domain/simulation.schema.json', root), 'utf8').then(JSON.parse)
    ]);
    assert.doesNotThrow(() => validateGameplaySimulationProjections(objects, simulation));
    const planet = objects['x-spaced-penguin-objects'].find(object => object.className === 'Planet');
    planet.properties.newGameplayKnob = { type: 'number' };
    assert.throws(
        () => validateGameplaySimulationProjections(objects, simulation),
        /Planet gameplay field newGameplayKnob has no simulation projection mapping/
    );
});

test('simulation output patch contract has a generated binary round trip', () => {
    const patch = {
        time: 1.5, runTick: 4,
        penguin: { position: { x: 1, y: 2 }, velocity: { x: 3, y: 4 }, state: 'flying', crashFramesRemaining: 0, portalLockId: null, speedBoosterLockId: 'boost' },
        counters: { planetCollisions: 2, currentAttemptScore: 75, distance: 9 },
        bonusCollected: [true, false], events: [{ type: 'target_hit', position: { x: 5, y: 6 } }]
    };
    assert.deepEqual(decodeSimulationStepPatch(encodeSimulationStepPatch(patch)), patch);
});

test('simulation output binary codec round-trips every event variant and optional/zero values', () => {
    const point = { x: 0, y: -0 };
    const events = [
        { type: 'penguin_moved', from: point, position: point, distance: 0, deltaTime: 0 },
        { type: 'bonus_collected', bonusId: 'b', bonusIndex: 0, value: 0, position: point },
        { type: 'planet_collision', planetId: 'p', planetIndex: 0, position: point },
        { type: 'planet_bounce', planetId: 'p', planetIndex: 0, position: point },
        { type: 'target_hit', position: point },
        { type: 'target_blocked', rule: 'requiredBonuses', required: 0, collected: 0, remaining: 0, reason: '', position: point },
        { type: 'out_of_bounds', position: point },
        { type: 'portal_teleported', sourcePortalId: 'a', destinationPortalId: 'b', entryPosition: point, exitPosition: point, incomingVelocity: point, velocity: point, playSound: false },
        { type: 'speed_booster_activated', speedBoosterId: 's', speedBoosterIndex: 0, position: point, incomingVelocity: point, velocity: point, playSound: false },
        { type: 'attempt_reset_required' },
        { type: 'rule_failure', rule: 'maxTries', reason: '' },
        { type: 'deflector_bounced', deflectorBumperId: 'd', deflectorBumperIndex: 0, position: point, normal: point, incomingVelocity: point, velocity: point, playSound: false }
    ];
    const patch = {
        time: 0, runTick: 0,
        penguin: { position: point, velocity: point, state: '', crashFramesRemaining: 0, portalLockId: null, speedBoosterLockId: null },
        counters: { planetCollisions: 0, currentAttemptScore: 0, distance: 0 }, bonusCollected: [false, true], events
    };
    assert.deepEqual(decodeSimulationStepPatch(encodeSimulationStepPatch(patch)), patch);
    const absentOptional = { ...events[0] }; delete absentOptional.from;
    const absent = { ...patch, events: [absentOptional] };
    assert.equal(decodeSimulationStepPatch(encodeSimulationStepPatch(absent)).events[0].from, null);
});

test('simulation output binary codec rejects malformed headers, tags, and truncation', () => {
    const patch = {
        time: 0, runTick: 0,
        penguin: { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, state: '', crashFramesRemaining: 0, portalLockId: null, speedBoosterLockId: null },
        counters: { planetCollisions: 0, currentAttemptScore: 0, distance: 0 }, bonusCollected: [], events: [{ type: 'attempt_reset_required' }]
    };
    const encoded = encodeSimulationStepPatch(patch);
    const magic = encoded.slice(); magic[0] ^= 0xff;
    assert.throws(() => decodeSimulationStepPatch(magic), /magic/);
    const version = encoded.slice(); version[4] = 99;
    assert.throws(() => decodeSimulationStepPatch(version), /version/);
    const tag = encoded.slice(); tag[tag.length - 1] = 255;
    assert.throws(() => decodeSimulationStepPatch(tag), /tag/);
    assert.throws(() => decodeSimulationStepPatch(encoded.slice(0, -1)), /truncated/);
});

test('wire field reorder fails at the unchanged version until its fingerprint is intentionally updated', async () => {
    const schema = JSON.parse(await readFile(new URL('domain/simulation.schema.json', root), 'utf8'));
    const layout = schema['x-spaced-penguin-wire'].records.SimulationStepInput;
    [layout[0], layout[1]] = [layout[1], layout[0]];
    assert.throws(() => validateSimulationWireLayout(schema), /wire fingerprint mismatch/);
    schema['x-spaced-penguin-wire'].fingerprints.input = computeSimulationWireFingerprint(schema, 'input');
    assert.doesNotThrow(() => validateSimulationWireLayout(schema));
});
