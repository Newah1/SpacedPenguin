import { integratePlanetGravity, LEGACY_PHYSICS_FPS, MAX_PHYSICS_STEP } from './simulation.js';
import { advanceOrbitGraphMutable, compileOrbitGraph } from './orbitSimulation.js';
import { cloneSimulationState } from './simulationState.js';
import { circlesOverlap, clonePoint, distance, pointInRect } from './simulationGeometry.js';
import { LEVEL_DEFAULTS, SIMULATION_CONFIG } from '../config/gameConfig.js';
import { getPortalOutwardDirection } from './portalGeometry.js';
import { advanceWaypointPathsMutable } from './waypointSimulation.js';
import { SimulationEventType } from '../../generated/js/simulationTypes.js';
import { PenguinState } from '../runtime/penguinState.js';

export { SimulationEventType };

export const FIXED_TICK_RATE = 60;
export const FIXED_TICK_SECONDS = 1 / FIXED_TICK_RATE;

const compiledOrbitGraphs = new WeakMap();

export function calculateLaunchScale(normalizedDistance) {
    const curve = SIMULATION_CONFIG.launchCurve;
    if (normalizedDistance <= curve.lowBreakpoint) {
        return curve.baseScale + (normalizedDistance / curve.lowBreakpoint) * curve.bandScaleGain;
    }
    if (normalizedDistance <= curve.highBreakpoint) {
        const bandWidth = curve.highBreakpoint - curve.lowBreakpoint;
        return curve.middleBaseScale +
            ((normalizedDistance - curve.lowBreakpoint) / bandWidth) * curve.bandScaleGain;
    }
    const highBandWidth = 1 - curve.highBreakpoint;
    return curve.highBaseScale + Math.pow(
        (normalizedDistance - curve.highBreakpoint) / highBandWidth,
        curve.highExponent
    ) * curve.bandScaleGain;
}

export function calculateLaunchVelocity(angleDegrees, pullbackPower, slingshot = {}) {
    if (slingshot.launchModel === 'director') {
        const maxPullback = slingshot.maxPullback ?? slingshot.stretchLimit ?? LEVEL_DEFAULTS.slingshot.maxPullback;
        const pullback = Math.min(Math.max(pullbackPower, 0), maxPullback);
        const coordinateScale = slingshot.coordinateScale ?? 1;
        const sourceFrameRate = slingshot.sourceFrameRate ?? 30;
        const sourceSpeed = 40 * Math.pow(pullback / Math.max(1, maxPullback), 2);
        const speed = sourceSpeed * coordinateScale * sourceFrameRate;
        const radians = angleDegrees * Math.PI / 180;
        return { x: Math.cos(radians) * speed, y: Math.sin(radians) * speed };
    }
    const velocityMultiplier = slingshot.velocityMultiplier ?? LEVEL_DEFAULTS.slingshot.velocityMultiplier;
    const maxPullback = slingshot.maxPullback ?? slingshot.stretchLimit ?? LEVEL_DEFAULTS.slingshot.maxPullback;
    const minPullback = slingshot.minPullback ?? LEVEL_DEFAULTS.slingshot.minPullback;
    const pullback = Math.min(Math.max(pullbackPower, 0), maxPullback);
    const curveKnee = Math.min(Math.max(minPullback, 0), maxPullback);
    const curve = SIMULATION_CONFIG.launchCurve;
    let speedFactor;
    if (curveKnee > 0 && pullback <= curveKnee) {
        speedFactor = curve.minimumSpeedFactor * (pullback / curveKnee);
    } else {
        const pullbackRange = Math.max(1, maxPullback - curveKnee);
        const normalizedPull = Math.max(0, Math.min(1, (pullback - curveKnee) / pullbackRange));
        const response = Math.pow(normalizedPull, curve.responseExponent);
        speedFactor = curveKnee > 0
            ? curve.minimumSpeedFactor +
                (curve.maximumSpeedFactor - curve.minimumSpeedFactor) * response
            : curve.maximumSpeedFactor * response;
    }
    const speed = speedFactor * velocityMultiplier;
    const radians = angleDegrees * Math.PI / 180;
    return { x: Math.cos(radians) * speed, y: Math.sin(radians) * speed };
}

export function calculateLaunchPosition(angleDegrees, pullbackPower, slingshot = {}) {
    const fallback = slingshot.position || { x: 0, y: 0 };
    if (slingshot.launchModel !== 'director') return clonePoint(fallback);
    const maxPullback = slingshot.maxPullback ?? slingshot.stretchLimit ?? LEVEL_DEFAULTS.slingshot.maxPullback;
    const minPullback = slingshot.minPullback ?? LEVEL_DEFAULTS.slingshot.minPullback;
    const pullback = Math.min(Math.max(pullbackPower, minPullback), maxPullback);
    const coordinateScale = slingshot.coordinateScale ?? 1;
    const sourceSpeed = 40 * Math.pow(pullback / Math.max(1, maxPullback), 2);
    const normalizedDistance = 100 * pullback / Math.max(1, maxPullback);
    const snapFrames = Math.trunc(normalizedDistance / Math.max(sourceSpeed, Number.EPSILON) + 1);
    const launchOffset = (sourceSpeed * snapFrames - pullback) * coordinateScale;
    const radians = angleDegrees * Math.PI / 180;
    const anchor = slingshot.anchorPosition || fallback;
    return {
        x: anchor.x + Math.cos(radians) * launchOffset,
        y: anchor.y + Math.sin(radians) * launchOffset
    };
}

export function launchSimulationPenguin(stateInput, angleDegrees, pullbackPower) {
    const state = cloneSimulationState(stateInput);
    return launchSimulationPenguinMutable(state, angleDegrees, pullbackPower);
}

export function launchSimulationPenguinMutable(state, angleDegrees, pullbackPower) {
    state.penguin.position = calculateLaunchPosition(angleDegrees, pullbackPower, state.slingshot);
    state.penguin.velocity = calculateLaunchVelocity(angleDegrees, pullbackPower, state.slingshot);
    state.penguin.state = PenguinState.SOARING;
    state.penguin.crashFramesRemaining = 0;
    state.counters.tries += 1;
    return state;
}

export function stepSimulation(stateInput, deltaTime) {
    const state = cloneSimulationState(stateInput);
    return stepSimulationMutable(state, deltaTime);
}

export function stepSimulationMutable(state, deltaTime, options = {}) {
    const events = [];
    let remainingTime = Math.max(0, deltaTime);
    while (remainingTime > 0) {
        const step = Math.min(remainingTime, MAX_PHYSICS_STEP);
        stepSimulationSlice(state, step, events, options);
        remainingTime -= step;
        if (remainingTime < Number.EPSILON) remainingTime = 0;
    }
    if (deltaTime <= 0) appendFailureEvent(state, events);
    return { state, events };
}

/** Advance exactly one authoritative proof/gameplay tick. */
export function stepSimulationTickMutable(state, options = {}) {
    const tick = state.runTick ?? 0;
    const result = stepSimulationMutable(state, FIXED_TICK_SECONDS, options);
    state.runTick = tick + 1;
    return result;
}

function stepSimulationSlice(state, deltaTime, events, options) {
    state.time += deltaTime;
    if (options.advanceWorld !== false) advanceSimulationWorldMutable(state, deltaTime);
    if (state.penguin.state === PenguinState.SOARING) {
        stepSoaringPenguin(state, deltaTime, events, options);
    } else if (state.penguin.state === PenguinState.CRASHED) {
        stepCrashedPenguin(state, deltaTime, events, options);
    }
    appendFailureEvent(state, events);
}

function appendFailureEvent(state, events) {
    if (state.penguin.state === PenguinState.HIT_TARGET) return;
    const failure = evaluateFailureRules(state);
    if (failure?.rule === 'maxTries' && state.penguin.state === PenguinState.SOARING) return;
    if (failure && !events.some(event => event.type === SimulationEventType.RULE_FAILURE && event.rule === failure.rule)) {
        events.push({ type: SimulationEventType.RULE_FAILURE, ...failure });
    }
}

export function advanceSimulationWorldMutable(state, deltaTime) {
    let cached = compiledOrbitGraphs.get(state);
    if (!cached) {
        const entities = [
            ...state.planets,
            ...state.bonuses,
            ...(state.portals || []),
            ...(state.speedBoosters || []),
            ...(state.deflectorBumpers || []),
            ...(state.forceFields || []),
            ...(state.decorations || []),
            state.target,
            state.slingshot
        ];
        cached = { entities, graph: compileOrbitGraph(entities) };
        compiledOrbitGraphs.set(state, cached);
    }
    advanceOrbitGraphMutable(cached.entities, deltaTime, cached.graph);
    advanceWaypointPathsMutable(cached.entities, deltaTime);
    if (state.slingshot.waypointPath &&
        state.penguin.state !== PenguinState.SOARING &&
        state.penguin.state !== PenguinState.CRASHED &&
        state.penguin.state !== PenguinState.HIT_TARGET) {
        state.penguin.position = clonePoint(state.slingshot.position);
    }
}

function stepSoaringPenguin(state, deltaTime, events, options) {
    const collisionIndex = findPlanetCollision(state.penguin.position, state.planets, state.penguin.radius);
    if (collisionIndex >= 0) {
        const planet = state.planets[collisionIndex];
        const bounce = resolvePlanetBounce(state.penguin.position, state.penguin.velocity, planet, state.penguin.radius);
        state.penguin.position = bounce.position;
        state.penguin.velocity = bounce.velocity;
        state.penguin.state = PenguinState.CRASHED;
        state.penguin.crashFramesRemaining = SIMULATION_CONFIG.collision.planetCrashFrames;
        state.counters.planetCollisions += 1;
        events.push({ type: SimulationEventType.PLANET_COLLISION, planetId: planet.id, planetIndex: collisionIndex, position: clonePoint(state.penguin.position) });
        return;
    }

    const previousPosition = clonePoint(state.penguin.position);
    const gravity = integratePlanetGravity(
        state.penguin.position,
        state.penguin.velocity,
        state.planets.map(planet => ({ x: planet.position.x, y: planet.position.y, mass: planet.mass, gravitationalReach: planet.gravitationalReach })),
        state.rules.gravitationalConstant,
        deltaTime
    );
    state.penguin.position = gravity.position;
    state.penguin.velocity = gravity.velocity;

    const deflection = applySweptWorldCollisions(state, previousPosition, events);
    if (deflection.planetCollision) return;
    applySpeedBoosters(state, deflection.interactionStart, events);
    applyPortalTeleports(state, deflection.interactionStart, events);
    const traveled = deflection.traveled;
    state.counters.distance += traveled;
    if (options.emitMovementEvents !== false) {
        events.push({ type: SimulationEventType.PENGUIN_MOVED, from: previousPosition, position: clonePoint(state.penguin.position), distance: traveled, deltaTime });
    }

    collectBonuses(state, events);
    if (circlesOverlap(state.penguin.position, 0, state.target.position, state.target.collisionRadius)) {
        const victoryFailure = evaluateVictoryRules(state);
        if (victoryFailure) {
            state.penguin.state = PenguinState.CRASHED;
            state.penguin.crashFramesRemaining = SIMULATION_CONFIG.collision.terminalCrashFrames;
            events.push({ type: SimulationEventType.TARGET_BLOCKED, ...victoryFailure, position: clonePoint(state.penguin.position) });
        } else {
            state.penguin.state = PenguinState.HIT_TARGET;
            state.penguin.velocity = { x: 0, y: 0 };
            events.push({ type: SimulationEventType.TARGET_HIT, position: clonePoint(state.penguin.position) });
        }
        return;
    }

    if (!pointInRect(state.penguin.position, state.bounds.flight)) {
        state.penguin.state = PenguinState.CRASHED;
        state.penguin.crashFramesRemaining = SIMULATION_CONFIG.collision.terminalCrashFrames;
        events.push({ type: SimulationEventType.OUT_OF_BOUNDS, position: clonePoint(state.penguin.position) });
    }
}

function segmentCircleEntry(start, end, center, radius) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const fx = start.x - center.x;
    const fy = start.y - center.y;
    const a = dx * dx + dy * dy;
    if (a <= Number.EPSILON || fx * fx + fy * fy <= radius * radius) return null;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    return [(-b - root) / (2 * a), (-b + root) / (2 * a)]
        .filter(value => value >= 0 && value <= 1)
        .sort((left, right) => left - right)[0] ?? null;
}

function reflectVector(vector, normal, multiplier = 1) {
    const dot = vector.x * normal.x + vector.y * normal.y;
    return {
        x: (vector.x - 2 * dot * normal.x) * multiplier,
        y: (vector.y - 2 * dot * normal.y) * multiplier
    };
}

function segmentForceFieldEntry(start, end, field, penguinRadius) {
    const a = toPortalLocal(start, field);
    const b = toPortalLocal(end, field);
    const dx = b.x - a.x;
    const front = field.width / 2 + penguinRadius;
    if (dx >= -Number.EPSILON || a.x < front) return null;
    const fraction = (front - a.x) / dx;
    if (fraction < 0 || fraction > 1) return null;
    const y = a.y + (b.y - a.y) * fraction;
    return Math.abs(y) <= field.height / 2 + penguinRadius ? fraction : null;
}

function applySweptWorldCollisions(state, originalStart, events) {
    const bumpers = state.deflectorBumpers || [];
    const forceFields = state.forceFields || [];
    let start = clonePoint(originalStart);
    let end = clonePoint(state.penguin.position);
    let traveled = 0;
    let lastBumperId = null;
    let lastForceFieldId = null;

    for (let bounceCount = 0; bounceCount < 4; bounceCount++) {
        const planetHit = findPlanetCollisionOnSegment(
            start,
            end,
            state.planets,
            state.penguin.radius
        );
        let bumperHit = null;
        for (let index = 0; index < bumpers.length; index++) {
            const bumper = bumpers[index];
            if (bumper.id === lastBumperId) continue;
            const fraction = segmentCircleEntry(
                start,
                end,
                bumper.position,
                bumper.radius + state.penguin.radius
            );
            if (fraction !== null && (!bumperHit || fraction < bumperHit.fraction)) {
                bumperHit = { bumper, index, fraction };
            }
        }

        let forceFieldHit = null;
        for (let index = 0; index < forceFields.length; index++) {
            const field = forceFields[index];
            if (field.id === lastForceFieldId) continue;
            const fraction = segmentForceFieldEntry(start, end, field, state.penguin.radius);
            if (fraction !== null && (!forceFieldHit || fraction < forceFieldHit.fraction)) {
                forceFieldHit = { field, index, fraction };
            }
        }

        let reflectiveHit = bumperHit
            ? { kind: 'bumper', ...bumperHit }
            : null;
        if (forceFieldHit && (!reflectiveHit || forceFieldHit.fraction < reflectiveHit.fraction)) {
            reflectiveHit = { kind: 'forceField', ...forceFieldHit };
        }

        if (planetHit && (!reflectiveHit || planetHit.fraction <= reflectiveHit.fraction)) {
            const planet = state.planets[planetHit.index];
            const impact = {
                x: start.x + (end.x - start.x) * planetHit.fraction,
                y: start.y + (end.y - start.y) * planetHit.fraction
            };
            traveled += distance(start, impact);
            const bounce = resolvePlanetBounce(impact, state.penguin.velocity, planet, state.penguin.radius);
            state.penguin.position = bounce.position;
            state.penguin.velocity = bounce.velocity;
            state.penguin.state = PenguinState.CRASHED;
            state.penguin.crashFramesRemaining = SIMULATION_CONFIG.collision.planetCrashFrames;
            state.counters.planetCollisions += 1;
            events.push({
                type: SimulationEventType.PLANET_COLLISION,
                planetId: planet.id,
                planetIndex: planetHit.index,
                position: clonePoint(state.penguin.position)
            });
            return { interactionStart: start, traveled, planetCollision: true };
        }

        if (!reflectiveHit) {
            traveled += distance(start, end);
            break;
        }

        const impact = {
            x: start.x + (end.x - start.x) * reflectiveHit.fraction,
            y: start.y + (end.y - start.y) * reflectiveHit.fraction
        };
        traveled += distance(start, impact);
        let nx;
        let ny;
        if (reflectiveHit.kind === 'bumper') {
            nx = impact.x - reflectiveHit.bumper.position.x;
            ny = impact.y - reflectiveHit.bumper.position.y;
            const normalLength = Math.hypot(nx, ny) || 1;
            nx /= normalLength;
            ny /= normalLength;
        } else {
            const angle = (reflectiveHit.field.rotation || 0) * Math.PI / 180;
            nx = Math.cos(angle);
            ny = Math.sin(angle);
        }
        const normal = { x: nx, y: ny };
        const incomingVelocity = clonePoint(state.penguin.velocity);
        const source = reflectiveHit.kind === 'bumper' ? reflectiveHit.bumper : reflectiveHit.field;
        const multiplier = source.restitution ?? 1;
        state.penguin.velocity = reflectVector(incomingVelocity, normal, multiplier);
        const remaining = { x: end.x - impact.x, y: end.y - impact.y };
        const reflectedRemaining = reflectVector(remaining, normal, multiplier);
        const padding = SIMULATION_CONFIG.collision.separationPadding;
        start = { x: impact.x + nx * padding, y: impact.y + ny * padding };
        end = { x: start.x + reflectedRemaining.x, y: start.y + reflectedRemaining.y };
        state.penguin.position = clonePoint(end);
        if (reflectiveHit.kind === 'bumper') {
            lastBumperId = source.id;
            events.push({
                type: SimulationEventType.DEFLECTOR_BOUNCED,
                deflectorBumperId: source.id,
                deflectorBumperIndex: reflectiveHit.index,
                position: impact, normal, incomingVelocity,
                velocity: clonePoint(state.penguin.velocity), playSound: source.playSound !== false
            });
        } else {
            lastForceFieldId = source.id;
            events.push({
                type: SimulationEventType.FORCE_FIELD_REFLECTED,
                forceFieldId: source.id,
                forceFieldIndex: reflectiveHit.index,
                position: impact, normal, incomingVelocity,
                velocity: clonePoint(state.penguin.velocity), playSound: source.playSound !== false
            });
        }
    }

    return {
        interactionStart: start,
        traveled: bumpers.length || forceFields.length ? traveled : distance(originalStart, end),
        planetCollision: false
    };
}

function toPortalLocal(point, portal) {
    const rotation = -(portal.rotation || 0) * Math.PI / 180;
    const dx = point.x - portal.position.x;
    const dy = point.y - portal.position.y;
    return {
        x: dx * Math.cos(rotation) - dy * Math.sin(rotation),
        y: dx * Math.sin(rotation) + dy * Math.cos(rotation)
    };
}

function pointInsidePortal(point, portal, padding = 0) {
    const local = toPortalLocal(point, portal);
    const rx = portal.width / 2 + padding;
    const ry = portal.height / 2 + padding;
    return (local.x * local.x) / (rx * rx) + (local.y * local.y) / (ry * ry) <= 1;
}

function pointInsideSpeedBooster(point, speedBooster, padding = 0) {
    const local = toPortalLocal(point, speedBooster);
    return Math.abs(local.x) <= speedBooster.width / 2 + padding &&
        Math.abs(local.y) <= speedBooster.height / 2 + padding;
}

function segmentSpeedBoosterEntry(start, end, speedBooster, padding) {
    if (pointInsideSpeedBooster(start, speedBooster, padding)) return null;
    const a = toPortalLocal(start, speedBooster);
    const b = toPortalLocal(end, speedBooster);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const halfWidth = speedBooster.width / 2 + padding;
    const halfHeight = speedBooster.height / 2 + padding;
    let enter = 0;
    let exit = 1;
    for (const [origin, delta, min, max] of [
        [a.x, dx, -halfWidth, halfWidth],
        [a.y, dy, -halfHeight, halfHeight]
    ]) {
        if (Math.abs(delta) < Number.EPSILON) {
            if (origin < min || origin > max) return null;
            continue;
        }
        const first = (min - origin) / delta;
        const second = (max - origin) / delta;
        enter = Math.max(enter, Math.min(first, second));
        exit = Math.min(exit, Math.max(first, second));
        if (enter > exit) return null;
    }
    return enter >= 0 && enter <= 1 ? enter : null;
}

function applySpeedBoosters(state, originalStart, events) {
    const speedBoosters = state.speedBoosters || [];
    if (!speedBoosters.length) return;
    const locked = speedBoosters.find(speedBooster => speedBooster.id === state.penguin.speedBoosterLockId);
    if (locked && !pointInsideSpeedBooster(originalStart, locked, state.penguin.radius + 1)) {
        state.penguin.speedBoosterLockId = null;
    }

    let hit = null;
    for (let index = 0; index < speedBoosters.length; index++) {
        const speedBooster = speedBoosters[index];
        if (speedBooster.id === state.penguin.speedBoosterLockId) continue;
        const fraction = segmentSpeedBoosterEntry(originalStart, state.penguin.position, speedBooster, state.penguin.radius);
        if (fraction !== null && (!hit || fraction < hit.fraction)) hit = { speedBooster, index, fraction };
    }
    if (!hit) return;

    const incomingVelocity = clonePoint(state.penguin.velocity);
    const incomingSpeed = Math.hypot(incomingVelocity.x, incomingVelocity.y);
    const angle = (hit.speedBooster.rotation || 0) * Math.PI / 180;
    const multiplier = hit.speedBooster.speedMultiplier ?? 1;
    state.penguin.velocity = {
        x: Math.cos(angle) * incomingSpeed * multiplier,
        y: Math.sin(angle) * incomingSpeed * multiplier
    };
    state.penguin.speedBoosterLockId = hit.speedBooster.id;
    events.push({
        type: SimulationEventType.SPEED_BOOSTER_ACTIVATED,
        speedBoosterId: hit.speedBooster.id,
        speedBoosterIndex: hit.index,
        position: {
            x: originalStart.x + (state.penguin.position.x - originalStart.x) * hit.fraction,
            y: originalStart.y + (state.penguin.position.y - originalStart.y) * hit.fraction
        },
        incomingVelocity,
        velocity: clonePoint(state.penguin.velocity),
        playSound: hit.speedBooster.playSound !== false
    });
}

function segmentPortalEntry(start, end, portal, padding) {
    if (pointInsidePortal(start, portal, padding)) return null;
    const a = toPortalLocal(start, portal);
    const b = toPortalLocal(end, portal);
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    // Entering must move against the outward normal. Keeping this test in
    // world space ties directional acceptance to the same convention used by
    // the editor arrow, including for non-cardinal rotations.
    const outward = getPortalOutwardDirection(portal);
    const approachSpeed = (end.x - start.x) * outward.x + (end.y - start.y) * outward.y;
    if (approachSpeed >= -Number.EPSILON) return null;

    const rx = portal.width / 2 + padding;
    const ry = portal.height / 2 + padding;
    const qa = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
    if (qa <= Number.EPSILON) return null;
    const qb = 2 * ((a.x * dx) / (rx * rx) + (a.y * dy) / (ry * ry));
    const qc = (a.x * a.x) / (rx * rx) + (a.y * a.y) / (ry * ry) - 1;
    const discriminant = qb * qb - 4 * qa * qc;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    const candidates = [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)]
        .filter(value => value >= 0 && value <= 1)
        .filter(value => a.y + dy * value <= Number.EPSILON);
    return candidates.length ? Math.min(...candidates) : null;
}

function rotateVector(vector, radians) {
    return {
        x: vector.x * Math.cos(radians) - vector.y * Math.sin(radians),
        y: vector.x * Math.sin(radians) + vector.y * Math.cos(radians)
    };
}

function portalBoundaryDistance(portal, direction, padding) {
    const rotation = -(portal.rotation || 0) * Math.PI / 180;
    const local = rotateVector(direction, rotation);
    const rx = portal.width / 2 + padding;
    const ry = portal.height / 2 + padding;
    const denominator = Math.sqrt((local.x * local.x) / (rx * rx) + (local.y * local.y) / (ry * ry));
    return denominator > Number.EPSILON ? 1 / denominator : Math.max(rx, ry);
}

function applyPortalTeleports(state, originalStart, events) {
    const portals = state.portals || [];
    if (portals.length < 2) return;
    const locked = portals.find(portal => portal.id === state.penguin.portalLockId);
    if (locked && !pointInsidePortal(originalStart, locked, state.penguin.radius + 1)) state.penguin.portalLockId = null;

    let start = clonePoint(originalStart);
    let end = clonePoint(state.penguin.position);
    for (let transit = 0; transit < 4; transit++) {
        let hit = null;
        for (const portal of portals) {
            if (portal.id === state.penguin.portalLockId) continue;
            const pair = portals.find(candidate => candidate.id === portal.pairedPortalId);
            if (!pair) continue;
            const fraction = segmentPortalEntry(start, end, portal, state.penguin.radius);
            if (fraction !== null && (!hit || fraction < hit.fraction)) hit = { portal, pair, fraction };
        }
        if (!hit) break;

        const impact = { x: start.x + (end.x - start.x) * hit.fraction, y: start.y + (end.y - start.y) * hit.fraction };
        const incomingVelocity = clonePoint(state.penguin.velocity);
        const turn = ((hit.pair.rotation || 0) - (hit.portal.rotation || 0) + 180) * Math.PI / 180;
        const remaining = rotateVector({ x: end.x - impact.x, y: end.y - impact.y }, turn);
        state.penguin.velocity = rotateVector(state.penguin.velocity, turn);
        const speed = Math.hypot(state.penguin.velocity.x, state.penguin.velocity.y);
        const direction = speed > Number.EPSILON
            ? { x: state.penguin.velocity.x / speed, y: state.penguin.velocity.y / speed }
            : rotateVector({ x: 1, y: 0 }, (hit.pair.rotation || 0) * Math.PI / 180);
        const clearance = portalBoundaryDistance(hit.pair, direction, state.penguin.radius + 1);
        const exit = { x: hit.pair.position.x + direction.x * clearance, y: hit.pair.position.y + direction.y * clearance };
        events.push({
            type: SimulationEventType.PORTAL_TELEPORTED,
            sourcePortalId: hit.portal.id,
            destinationPortalId: hit.pair.id,
            entryPosition: impact,
            exitPosition: clonePoint(exit),
            incomingVelocity,
            velocity: clonePoint(state.penguin.velocity),
            playSound: hit.portal.playSound !== false && hit.pair.playSound !== false
        });
        state.penguin.portalLockId = hit.pair.id;
        start = exit;
        end = { x: exit.x + remaining.x, y: exit.y + remaining.y };
    }
    state.penguin.position = end;
}

function stepCrashedPenguin(state, deltaTime, events, options) {
    state.penguin.crashFramesRemaining -= deltaTime * LEGACY_PHYSICS_FPS;
    if (!pointInRect(state.penguin.position, state.bounds.stage)) {
        state.penguin.velocity = { x: 0, y: 0 };
    } else {
        state.penguin.position.x += state.penguin.velocity.x * deltaTime;
        state.penguin.position.y += state.penguin.velocity.y * deltaTime;
        const collisionIndex = findPlanetCollision(state.penguin.position, state.planets, state.penguin.radius);
        if (collisionIndex >= 0) {
            const planet = state.planets[collisionIndex];
            const bounce = resolvePlanetBounce(state.penguin.position, state.penguin.velocity, planet, state.penguin.radius);
            state.penguin.position = bounce.position;
            state.penguin.velocity = bounce.velocity;
            events.push({ type: SimulationEventType.PLANET_BOUNCE, planetId: planet.id, planetIndex: collisionIndex, position: clonePoint(state.penguin.position) });
        }
        if (options.emitMovementEvents !== false) {
            events.push({ type: SimulationEventType.PENGUIN_MOVED, position: clonePoint(state.penguin.position), distance: 0, deltaTime });
        }
    }

    if (state.penguin.crashFramesRemaining <= 0 || !pointInRect(state.penguin.position, state.bounds.stage)) {
        events.push({ type: SimulationEventType.ATTEMPT_RESET_REQUIRED });
    }
}

function collectBonuses(state, events) {
    for (let index = 0; index < state.bonuses.length; index++) {
        const bonus = state.bonuses[index];
        if (bonus.collected) continue;
        if (circlesOverlap(state.penguin.position, 0, bonus.position, bonus.collectionRadius)) {
            bonus.collected = true;
            state.counters.currentAttemptScore += bonus.value;
            events.push({ type: SimulationEventType.BONUS_COLLECTED, bonusId: bonus.id, bonusIndex: index, value: bonus.value, position: clonePoint(bonus.position) });
        }
    }
}

function findPlanetCollision(position, planets, penguinRadius = 0) {
    return planets.findIndex(planet =>
        planet.collidable !== false &&
        planet.collisionRadius > 0 &&
        circlesOverlap(position, penguinRadius, planet.position, planet.collisionRadius)
    );
}

function findPlanetCollisionOnSegment(start, end, planets, penguinRadius = 0) {
    let closest = null;
    planets.forEach((planet, index) => {
        if (planet.collidable === false || planet.collisionRadius <= 0) return;
        const radius = penguinRadius + planet.collisionRadius;
        const fraction = circlesOverlap(start, 0, planet.position, radius)
            ? 0
            : segmentCircleEntry(start, end, planet.position, radius);
        if (fraction !== null && (!closest || fraction < closest.fraction)) {
            closest = { index, fraction };
        }
    });
    return closest;
}

export function resolvePlanetBounce(position, velocity, planet, penguinRadius = 0) {
    let normalX = position.x - planet.position.x;
    let normalY = position.y - planet.position.y;
    let normalLength = Math.hypot(normalX, normalY);
    if (normalLength === 0) {
        normalX = velocity.x === 0 && velocity.y === 0 ? 1 : -velocity.x;
        normalY = velocity.x === 0 && velocity.y === 0 ? 0 : -velocity.y;
        normalLength = Math.hypot(normalX, normalY) || 1;
    }
    const nx = normalX / normalLength;
    const ny = normalY / normalLength;
    const dot = velocity.x * nx + velocity.y * ny;
    let bouncedVelocity = {
        x: (velocity.x - 2 * dot * nx) * SIMULATION_CONFIG.collision.restitution,
        y: (velocity.y - 2 * dot * ny) * SIMULATION_CONFIG.collision.restitution
    };
    if (Math.hypot(bouncedVelocity.x, bouncedVelocity.y) < SIMULATION_CONFIG.collision.minimumBounceSpeed) {
        bouncedVelocity = { x: nx * SIMULATION_CONFIG.collision.minimumBounceSpeed, y: ny * SIMULATION_CONFIG.collision.minimumBounceSpeed };
    }
    const safeDistance = planet.collisionRadius + penguinRadius + SIMULATION_CONFIG.collision.separationPadding;
    return {
        position: { x: planet.position.x + nx * Math.max(normalLength, safeDistance), y: planet.position.y + ny * Math.max(normalLength, safeDistance) },
        velocity: bouncedVelocity
    };
}

export function evaluateFailureRules(state) {
    if (state.rules.maxTries !== null && state.counters.tries >= state.rules.maxTries) {
        return { rule: 'maxTries', reason: 'Maximum attempts reached!' };
    }
    if (state.rules.allowedMisses !== null && state.counters.planetCollisions > state.rules.allowedMisses) {
        return { rule: 'allowedMisses', reason: 'Too many planet collisions!' };
    }
    return null;
}

export function evaluateVictoryRules(state) {
    if (state.rules.requiredBonuses === null) return null;
    const collected = state.bonuses.filter(bonus => bonus.collected).length;
    if (collected >= state.rules.requiredBonuses) return null;
    return {
        rule: 'requiredBonuses',
        required: state.rules.requiredBonuses,
        collected,
        remaining: state.rules.requiredBonuses - collected,
        reason: `Collect ${state.rules.requiredBonuses - collected} more bonuses!`
    };
}

export function calculateLevelScore({ distance, level, tries, attemptBonus, totalScore, previousLevelContribution = 0, multiplier = 1 }) {
    const safeDistance = Number.isFinite(distance) ? distance : 0;
    const safeLevel = Number.isFinite(level) ? level : 1;
    const safeTries = Math.max(1, Number.isFinite(tries) ? tries : 1);
    const safeAttemptBonus = Number.isFinite(attemptBonus) ? attemptBonus : 0;
    const safeTotalScore = Number.isFinite(totalScore) ? totalScore : 0;
    const safePreviousLevelContribution = Number.isFinite(previousLevelContribution) ? previousLevelContribution : 0;
    const safeMultiplier = Number.isFinite(multiplier) ? multiplier : 1;
    const levelScore = Math.floor(safeDistance * safeLevel / safeTries);
    const scoreBeforeLevel = safeTotalScore - safePreviousLevelContribution;
    const scoreBeforeMultiplier = scoreBeforeLevel + levelScore + safeAttemptBonus;
    const candidateTotalScore = safeMultiplier === 1 ? scoreBeforeMultiplier : Math.floor(scoreBeforeMultiplier * safeMultiplier);
    const candidateLevelContribution = candidateTotalScore - scoreBeforeLevel;
    const levelContribution = Math.max(safePreviousLevelContribution, candidateLevelContribution);

    return { levelScore, levelContribution, scoreImprovement: levelContribution - safePreviousLevelContribution, totalScore: scoreBeforeLevel + levelContribution };
}
