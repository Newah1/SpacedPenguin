const STORAGE_KEY = 'spacedPenguinSavedLevels';

function clone(value) {
    return typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
}

export class LocalLevelRepository {
    constructor(storage = typeof localStorage === 'undefined' ? null : localStorage, key = STORAGE_KEY) {
        this.storage = storage;
        this.key = key;
    }

    list() {
        if (!this.storage) return [];
        try {
            const parsed = JSON.parse(this.storage.getItem(this.key) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    save(record) {
        if (!this.storage) return false;
        const records = this.list().filter(item => item.id !== record.id);
        records.unshift(clone(record));
        this.storage.setItem(this.key, JSON.stringify(records));
        return true;
    }

    load(id) {
        return this.list().find(record => record.id === id) || null;
    }
}

export class SaveLevelStrategyPipeline {
    constructor(strategies = []) {
        this.strategies = [...strategies];
    }

    add(strategy) {
        if (typeof strategy === 'function') this.strategies.push(strategy);
        return this;
    }

    async run(context) {
        for (const strategy of this.strategies) await strategy(context);
        return context;
    }
}

export class LevelSaveService {
    constructor({ repository = new LocalLevelRepository(), strategies = [] } = {}) {
        this.repository = repository;
        this.onSave = new SaveLevelStrategyPipeline(strategies);
    }

    addSaveStrategy(strategy) {
        this.onSave.add(strategy);
        return this;
    }

    async save(level, { thumbnail = '', id = null } = {}) {
        const now = new Date().toISOString();
        const existing = id ? this.repository.load(id) : null;
        const record = {
            id: id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            source: 'local',
            capabilities: { play: true, edit: true },
            name: level.name || 'Untitled Level',
            description: level.description || '',
            thumbnail,
            level: clone(level),
            createdAt: existing?.createdAt || now,
            updatedAt: now
        };
        await this.onSave.run({ record, level: record.level, repository: this.repository });
        if (!this.repository.save(record)) throw new Error('Browser storage is unavailable.');
        return record;
    }

    list() {
        return this.repository.list();
    }

    load(id) {
        return this.repository.load(id);
    }

    canEdit(record) {
        return record?.capabilities?.edit !== false;
    }

    canPlay(record) {
        return record?.capabilities?.play !== false;
    }
}

export function captureLevelThumbnail(canvas, width = 240, height = 160) {
    if (!canvas?.toDataURL) return '';
    const thumbnail = document.createElement('canvas');
    thumbnail.width = width;
    thumbnail.height = height;
    const context = thumbnail.getContext('2d');
    context.fillStyle = '#050b1d';
    context.fillRect(0, 0, width, height);
    context.drawImage(canvas, 0, 0, width, height);
    return thumbnail.toDataURL('image/png');
}

export { STORAGE_KEY };
