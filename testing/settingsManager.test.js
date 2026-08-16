import test from 'node:test';
import assert from 'node:assert/strict';

const { SETTINGS_CONFIG } = await import('../js/config/settingsConfig.js');
const { SettingsManager } = await import('../js/settingsManager.js');
const { LocalSettingsStore, MemorySettingsStore } = await import('../js/settingsStore.js');

test('settings load defaults, persist changes, and invoke configured effects', () => {
    const store = new MemorySettingsStore();
    const effects = [];
    const manager = new SettingsManager(SETTINGS_CONFIG, store, {
        audioEnabled: value => effects.push(['enabled', value]),
        backgroundMusicEnabled: value => effects.push(['music', value]),
        masterVolume: value => effects.push(['volume', value])
    });

    assert.equal(manager.get('soundEnabled'), true);
    assert.equal(manager.get('masterVolume'), 0.7);
    assert.equal(manager.get('aimAssistEnabled'), false);
    assert.equal(manager.get('experimentalBackgroundMusic'), false);
    assert.equal(manager.get('stellarModeEnabled'), false);
    assert.deepEqual(effects, [['enabled', true], ['music', false], ['volume', 0.7]]);

    manager.set('soundEnabled', false);
    manager.set('masterVolume', 0.35);

    assert.deepEqual(store.load(), {
        aimAssistEnabled: false,
        soundEnabled: false,
        experimentalBackgroundMusic: false,
        stellarModeEnabled: false,
        masterVolume: 0.35
    });
    assert.deepEqual(effects.slice(-2), [['enabled', false], ['volume', 0.35]]);
});

test('Stellar Mode setting persists alongside its separately stored local file', () => {
    const store = new MemorySettingsStore({ stellarModeEnabled: true, soundEnabled: false });
    const manager = new SettingsManager(SETTINGS_CONFIG, store);

    assert.equal(manager.get('stellarModeEnabled'), true);
    manager.set('stellarModeEnabled', false);
    assert.equal(store.load().stellarModeEnabled, false);
});

test('settings normalize invalid stored values and clamp numeric changes', () => {
    const manager = new SettingsManager(
        SETTINGS_CONFIG,
        new MemorySettingsStore({ soundEnabled: 'yes', masterVolume: 99 })
    );

    assert.equal(manager.get('soundEnabled'), true);
    assert.equal(manager.get('masterVolume'), 1);
    assert.equal(manager.set('masterVolume', -5), 0);
    assert.throws(() => manager.set('missing', true), /Unknown setting/);
});

test('local settings storage isolates unavailable or malformed browser storage', () => {
    const malformedStorage = {
        getItem: () => '{not-json',
        setItem: () => { throw new Error('blocked'); }
    };
    const store = new LocalSettingsStore('settings', malformedStorage);

    assert.deepEqual(store.load(), {});
    assert.equal(store.save({ soundEnabled: false }), false);
});
