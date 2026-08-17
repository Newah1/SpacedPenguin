import { createHash } from 'node:crypto';

function normalize(value) {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
    }
    return value;
}

export function canonicalJson(value) {
    return JSON.stringify(normalize(value));
}

export function sha256(value) {
    return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex');
}

export function encodeCursor(value) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor(value) {
    try {
        const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error();
        return decoded;
    } catch {
        return null;
    }
}
