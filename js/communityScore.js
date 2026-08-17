import { calculateLevelScore } from './simulationEngine.js';

export const SCORE_VERSION = 1;

/** Calculate an isolated, per-community-level score with no campaign carryover. */
export function calculateCommunityScore({ distance, tries, bonusScore, multiplier = 1 }) {
    const safeDistance = finiteNonNegative(distance, 'distance');
    const safeTries = positiveInteger(tries, 'tries');
    const safeBonus = nonNegativeSafeInteger(bonusScore, 'bonusScore');
    const safeMultiplier = finiteNonNegative(multiplier, 'multiplier');
    const shared = calculateLevelScore({
        distance: safeDistance,
        level: 1,
        tries: safeTries,
        attemptBonus: safeBonus,
        totalScore: 0,
        previousLevelContribution: 0,
        multiplier: safeMultiplier
    });
    const baseScore = Math.floor(safeDistance / safeTries);
    const rawScore = baseScore + safeBonus;
    if (!Number.isSafeInteger(shared.totalScore) || shared.totalScore < 0) {
        throw new RangeError('Calculated community score exceeds the supported integer range.');
    }
    return {
        scoreVersion: SCORE_VERSION,
        score: shared.totalScore,
        baseScore,
        rawScore,
        tries: safeTries,
        distance: safeDistance,
        bonusScore: safeBonus,
        multiplier: safeMultiplier
    };
}

function finiteNonNegative(value, name) {
    if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be finite and non-negative.`);
    return value;
}

function positiveInteger(value, name) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be a positive safe integer.`);
    return value;
}

function nonNegativeSafeInteger(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer.`);
    return value;
}
