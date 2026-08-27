const DEFAULT_STORAGE_KEY = 'spacedPenguinHighScores';
const MAX_SAVED_ENTRIES = 100;

function localDayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeEntry(entry) {
    const score = Math.max(0, Math.floor(Number(entry?.score) || 0));
    const achievedAt = typeof entry?.achievedAt === 'string' && !Number.isNaN(Date.parse(entry.achievedAt))
        ? entry.achievedAt
        : new Date().toISOString();
    return {
        id: String(entry?.id || `${achievedAt}-${Math.random().toString(36).slice(2)}`),
        name: String(entry?.name || '').trim().slice(0, 20),
        region: String(entry?.region || '').trim().toUpperCase().slice(0, 2),
        score,
        achievedAt,
        day: typeof entry?.day === 'string' ? entry.day : localDayKey(new Date(achievedAt))
    };
}

function rankEntries(entries) {
    return [...entries].sort((a, b) =>
        b.score - a.score ||
        a.achievedAt.localeCompare(b.achievedAt) ||
        a.id.localeCompare(b.id)
    );
}

export class HighScoreStore {
    constructor(storage = null, storageKey = DEFAULT_STORAGE_KEY) {
        this.storage = storage;
        this.storageKey = storageKey;
    }

    load() {
        if (!this.storage) return [];
        try {
            const parsed = JSON.parse(this.storage.getItem(this.storageKey) || '[]');
            const entries = Array.isArray(parsed) ? parsed : parsed?.entries;
            return Array.isArray(entries) ? entries.map(normalizeEntry) : [];
        } catch {
            return [];
        }
    }

    save(entries) {
        if (!this.storage) return;
        this.storage.setItem(this.storageKey, JSON.stringify({
            version: 1,
            entries: rankEntries(entries).slice(0, MAX_SAVED_ENTRIES)
        }));
    }

    getAllTime(limit = 10) {
        return rankEntries(this.load()).slice(0, limit);
    }

    getToday(date = new Date(), limit = 10) {
        const day = localDayKey(date);
        return rankEntries(this.load().filter(entry => entry.day === day)).slice(0, limit);
    }

    getCutoff(limit = 10) {
        const scores = this.getAllTime(limit);
        return scores.length < limit ? 0 : scores[scores.length - 1].score;
    }

    qualifies(score, limit = 10) {
        const numericScore = Math.max(0, Math.floor(Number(score) || 0));
        const scores = this.getAllTime(limit);
        return scores.length < limit || numericScore >= scores[scores.length - 1].score;
    }

    add({ name, region, score, achievedAt = new Date() }) {
        const date = achievedAt instanceof Date ? achievedAt : new Date(achievedAt);
        const entry = normalizeEntry({
            id: `${date.toISOString()}-${Math.random().toString(36).slice(2)}`,
            name,
            region,
            score,
            achievedAt: date.toISOString(),
            day: localDayKey(date)
        });
        const entries = this.load();
        entries.push(entry);
        this.save(entries);
        return entry;
    }
}

export { DEFAULT_STORAGE_KEY as HIGH_SCORE_STORAGE_KEY, localDayKey };
