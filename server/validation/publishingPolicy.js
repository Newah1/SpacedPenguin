import { normalizeLevelDefinition, normalizeLevelObjectType, LevelOrbitType } from '../../js/levels/levelSchema.js';
import { validateLevelDefinition } from '../../js/levels/levelValidation.js';
import { SERVER_LIMITS } from '../config.js';
import { badRequest } from '../errors.js';
import { jsonDepth } from './apiValidation.js';

const ABS_COORDINATE_LIMIT = 1_000_000;
const NUMERIC_LIMIT = 1_000_000;

function walk(value, path = '$') {
    if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > NUMERIC_LIMIT)) {
        throw badRequest('LEVEL_VALUE_OUT_OF_RANGE', `Numeric value at ${path} is outside the public level limits.`);
    }
    if (Array.isArray(value)) value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, entry]) => walk(entry, `${path}.${key}`));
}

export function normalizeAndValidatePublishedLevel(level) {
    if (jsonDepth(level) > SERVER_LIMITS.maxDepth) throw badRequest('LEVEL_TOO_COMPLEX', 'Level JSON is nested too deeply.');
    if (!Array.isArray(level.objects) || level.objects.length > SERVER_LIMITS.maxObjects) {
        throw badRequest('LEVEL_TOO_COMPLEX', `A level may contain at most ${SERVER_LIMITS.maxObjects} objects.`);
    }
    const name = typeof level.name === 'string' ? level.name.trim() : '';
    const description = typeof level.description === 'string' ? level.description.trim() : '';
    if (!name || name.length > SERVER_LIMITS.maxNameLength) throw badRequest('INVALID_LEVEL', 'Level name is required and may contain at most 80 characters.');
    if (description.length > SERVER_LIMITS.maxDescriptionLength) throw badRequest('INVALID_LEVEL', 'Level description may contain at most 1000 characters.');
    walk(level);
    const validation = validateLevelDefinition(level);
    if (!validation.valid) throw badRequest('INVALID_LEVEL', 'Level definition failed validation.', { diagnostics: validation.errors });
    if (level.rules?.timeLimit != null || (Array.isArray(level.rules?.customBehaviors) && level.rules.customBehaviors.length)) {
        throw badRequest('UNSUPPORTED_LEVEL_FEATURE', 'Public levels cannot use unenforced or custom rules.');
    }
    const customOrbit = level.objects.some(object => {
        const orbit = object?.properties?.orbit;
        return String(orbit?.orbitType ?? orbit?.type ?? '').toLowerCase() === LevelOrbitType.CUSTOM;
    });
    if (customOrbit) throw badRequest('UNSUPPORTED_LEVEL_FEATURE', 'Custom orbit fallbacks cannot be published.');
    const rules = level.rules || {};
    if (rules.maxTries != null && rules.maxTries > 10) throw badRequest('LEVEL_VALUE_OUT_OF_RANGE', 'maxTries may not exceed 10.');
    if (rules.requiredBonuses != null && rules.requiredBonuses > 128) throw badRequest('LEVEL_VALUE_OUT_OF_RANGE', 'requiredBonuses is too large.');
    if (rules.scoreMultiplier != null && rules.scoreMultiplier > 100) throw badRequest('LEVEL_VALUE_OUT_OF_RANGE', 'scoreMultiplier may not exceed 100.');
    for (const [index, object] of level.objects.entries()) {
        const position = object.position ?? object.properties;
        if (position && (Math.abs(position.x ?? 0) > ABS_COORDINATE_LIMIT || Math.abs(position.y ?? 0) > ABS_COORDINATE_LIMIT)) {
            throw badRequest('LEVEL_VALUE_OUT_OF_RANGE', `Object ${index} position is outside public level limits.`);
        }
        const properties = object.properties || {};
        if (normalizeLevelObjectType(object.type) === 'bonus' && (properties.value ?? 0) > 1_000_000) {
            throw badRequest('LEVEL_VALUE_OUT_OF_RANGE', `Object ${index} bonus value is too large.`);
        }
        const sources = properties.orbit?.orbitParams?.gravitySources ?? properties.orbit?.params?.gravitySources;
        if (Array.isArray(sources) && sources.length > 16) throw badRequest('LEVEL_TOO_COMPLEX', 'An orbit may have at most 16 gravity sources.');
    }
    return normalizeLevelDefinition({ ...level, name, description });
}
