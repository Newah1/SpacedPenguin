export class LocalSettingsStore {
    constructor(storageKey, storage = globalThis.localStorage) {
        this.storageKey = storageKey;
        this.storage = storage;
    }

    load() {
        try {
            const stored = this.storage?.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : {};
        } catch {
            return {};
        }
    }

    save(values) {
        try {
            this.storage?.setItem(this.storageKey, JSON.stringify(values));
            return true;
        } catch {
            return false;
        }
    }
}

export class MemorySettingsStore {
    constructor(initialValues = {}) {
        this.values = { ...initialValues };
    }

    load() {
        return { ...this.values };
    }

    save(values) {
        this.values = { ...values };
        return true;
    }
}
