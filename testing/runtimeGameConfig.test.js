import test from 'node:test';
import assert from 'node:assert/strict';

import Console from '../js/console.js';
import {
    clearRuntimeGameConfigOverrides,
    getRuntimeGameConfigValue,
    listGameConfigPaths,
    setRuntimeGameConfigValue
} from '../js/runtimeGameConfig.js';

test.afterEach(() => clearRuntimeGameConfigOverrides());

test('runtime game config resolves aliases and parses values from the source type', () => {
    const result = setRuntimeGameConfigValue('simulation.aimassist.previewseconds', '2.5');

    assert.equal(result.canonicalPath, 'SIMULATION_CONFIG.aimAssist.previewSeconds');
    assert.equal(result.value, 2.5);
    assert.equal(getRuntimeGameConfigValue('SIMULATION_CONFIG.aimAssist.previewSeconds'), 2.5);
    assert.equal(getRuntimeGameConfigValue('world.stage.width'), 800);
});

test('runtime game config rejects unknown paths and type-invalid values', () => {
    assert.throws(() => setRuntimeGameConfigValue('simulation.missing', '2'), /Unknown/);
    assert.throws(
        () => setRuntimeGameConfigValue('simulation.aimAssist.previewSeconds', 'long'),
        /finite number/
    );
});

test('/SetConfig changes the aim-assist horizon and notifies the live game', () => {
    const messages = [];
    const changes = [];
    Console.prototype.setConfig.call({
        game: { onRuntimeConfigChanged: (...args) => changes.push(args) },
        log: message => messages.push(message)
    }, ['SIMULATION_CONFIG.aimAssist.previewSeconds', '1.75']);

    assert.deepEqual(changes, [['SIMULATION_CONFIG.aimAssist.previewSeconds', 1.75]]);
    assert.match(messages[0], /1\.75.*runtime override/);
});

test('console autocomplete completes commands and nested SetConfig paths', () => {
    const input = {
        value: '/setc',
        selectionStart: 5,
        setSelectionRange(start) { this.selectionStart = start; }
    };
    const consoleFixture = {
        input,
        completionState: null,
        getCompletionContext: Console.prototype.getCompletionContext,
        longestCommonPrefix: Console.prototype.longestCommonPrefix,
        applyCompletion: Console.prototype.applyCompletion
    };

    Console.prototype.autocomplete.call(consoleFixture);
    assert.equal(input.value, '/setconfig');

    input.value = '/setconfig simulation.aim';
    input.selectionStart = input.value.length;
    consoleFixture.completionState = null;
    Console.prototype.autocomplete.call(consoleFixture);
    assert.equal(input.value, '/setconfig simulation.aimAssist.');
    assert.ok(listGameConfigPaths().includes('simulation.aimAssist.previewSeconds'));
});

test('repeated Tab cycles ambiguous command completions', () => {
    const input = {
        value: '/l',
        selectionStart: 2,
        setSelectionRange(start) { this.selectionStart = start; }
    };
    const consoleFixture = {
        input,
        completionState: null,
        getCompletionContext: Console.prototype.getCompletionContext,
        longestCommonPrefix: Console.prototype.longestCommonPrefix,
        applyCompletion: Console.prototype.applyCompletion
    };

    Console.prototype.autocomplete.call(consoleFixture);
    const firstCompletion = input.value;
    Console.prototype.autocomplete.call(consoleFixture);

    assert.notEqual(input.value, firstCompletion);
    assert.ok(input.value.startsWith('/l'));
});
