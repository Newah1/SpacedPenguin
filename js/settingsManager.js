import { SettingType } from './config/settingsConfig.js';

function normalizeValue(definition, value) {
    if (definition.type === SettingType.BOOLEAN) {
        return typeof value === 'boolean' ? value : definition.defaultValue;
    }
    if (definition.type === SettingType.NUMBER) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) return definition.defaultValue;
        return Math.min(definition.max, Math.max(definition.min, numericValue));
    }
    return value ?? definition.defaultValue;
}

export class SettingsManager {
    constructor(config, store, effects = {}) {
        this.config = config;
        this.store = store;
        this.effects = effects;
        const storedValues = store.load();
        this.values = Object.fromEntries(config.settings.map(definition => [
            definition.key,
            normalizeValue(
                definition,
                definition.persistent === false ? definition.defaultValue : storedValues[definition.key]
            )
        ]));
        this.applyAll();
    }

    getDefinitions() {
        return this.config.settings;
    }

    get(key) {
        return this.values[key];
    }

    set(key, value) {
        const definition = this.config.settings.find(setting => setting.key === key);
        if (!definition) throw new Error(`Unknown setting: ${key}`);
        const normalizedValue = normalizeValue(definition, value);
        this.values[key] = normalizedValue;
        this.store.save(Object.fromEntries(this.config.settings
            .filter(setting => setting.persistent !== false)
            .map(setting => [setting.key, this.values[setting.key]])));
        this.apply(definition, normalizedValue);
        return normalizedValue;
    }

    apply(definition, value) {
        if (definition.effect) this.effects[definition.effect]?.(value, definition);
    }

    applyAll() {
        for (const definition of this.config.settings) {
            this.apply(definition, this.values[definition.key]);
        }
    }
}
