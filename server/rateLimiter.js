import { ApiError } from './errors.js';

export class MemoryRateLimiter {
    constructor(now = Date.now) {
        this.now = now;
        this.entries = new Map();
    }

    check(key, { limit, windowMs }) {
        const now = this.now();
        const timestamps = (this.entries.get(key) || []).filter(timestamp => timestamp > now - windowMs);
        if (timestamps.length >= limit) {
            const retryAfter = Math.max(1, Math.ceil((timestamps[0] + windowMs - now) / 1000));
            const error = new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.', { retryAfter });
            error.retryAfter = retryAfter;
            throw error;
        }
        timestamps.push(now);
        this.entries.set(key, timestamps);
    }
}
