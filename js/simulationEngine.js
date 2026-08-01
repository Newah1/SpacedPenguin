import { integratePlanetGravity, LEGACY_PHYSICS_FPS, MAX_PHYSICS_STEP } from './simulation.js';
import { advanceOrbitGraph } from './orbitSimulation.js';
import { cloneSimulationState } from './simulationState.js';
import { circlesOverlap, clonePoint, distance, pointInRect } from './simulationGeometry.js';

export const SimulationEventType = Object.freeze({
    PENGUIN_MOVED: 'penguin_moved',
    BONUS_COLLECTED: 'bonus_collected',
    PLANET_COLLISION: 'planet_collision',
    PLANET_BOUNCE: 'planet_bounce',
    TARGET_HIT: 'target_hit',
    TARGET_BLOCKED: 'target_blocked',
    OUT_OF_BOUNDS: 'out_of_bounds',
    ATTEMPT_RESET_REQUIRED: 'attempt_reset_required',
    RULE_FAILURE: 'rule_failure'
});

export function calculateLaunchVelocity(angleDegrees, pullbackPower, slingshot = {}) {
    const velocityMultiplier = slingshot.velocityMultiplier ?? 15;
    const maxPullback = slingshot.maxPullback ?? slingshot.stretchLimit ?? 100;
    const minPullback = slingshot.minPullback ?? 10;
    const pullback = Math.min(Math.max(pullbackPower, minPullback), maxPullback);
    const normalizedDistance = pullback / maxPullback;
    let scale;
    if (normalizedDistance <= 0.3) {
        scale = 0.5 + (normalizedDistance / 0.3) * 0.5;
    } else if (normalizedDistance <= 0.7) {
        scale = 1 + ((normalizedDistance - 0.3) / 0.4) * 0.5;
    } else {
        scale = 1.5 + Math.pow((normalizedDistance - 0.7) / 0.3, 1.5) * 0.5;
    }
    const scaledPullback = pullback * scale;
    const speed = (scaledPullback * scaledPullback / 250) * velocityMultiplier;
    const radians = angleDegrees * Math.PI / 180;
    return { x: Math.cos(radians) * speed, y: Math.sin(radians) * speed };
}

export function launchSimulationPenguin(stateInput, angleDegrees, pullbackPower) {
    const state = cloneSimulationState(stateInput);
    return launchSimulationPenguinMutable(state, angleDegrees, pullbackPower);
}

export function launchSimulationPenguinMutable(state, angleDegrees, pullbackPower) {
    state.penguin.position = clonePoint(state.slingshot.position);
    state.penguin.velocity = calculateLaunchVelocity(angleDegrees, pullbackPower, state.slingshot);
    state.penguin.state = 'soaring';
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

function stepSimulationSlice(state, deltaTime, events, options) {
    state.time += deltaTime;
    if (options.advanceWorld !== false) advanceWorldOrbits(state, deltaTime);
    if (state.penguin.state === 'soaring') {
        stepSoaringPenguin(state, deltaTime, events, options);
    } else if (state.penguin.state === 'crashed') {
        stepCrashedPenguin(state, deltaTime, events, options);
    }
    appendFailureEvent(state, events);
}

function appendFailureEvent(state, events) {
    // A successful arrival wins the attempt even when it consumes the last
    // allowed try. Failure rules describe an unfinished attempt, not a reason
    // to overwrite an already-completed outcome.
    if (state.penguin.state === 'hitTarget') return;
    const failure = evaluateFailureRules(state);
    // maxTries limits completed attempts; consuming the last launch must not
    // end a shot that is still in flight.
    if (failure?.rule === 'maxTries' && state.penguin.state === 'soaring') return;
    if (failure && !events.some(event => event.type === SimulationEventType.RULE_FAILURE && event.rule === failure.rule)) {
        events.push({ type: SimulationEventType.RULE_FAILURE, ...failure });
    }
}

function advanceWorldOrbits(state, deltaTime) {
    const entities = [
        ...state.planets.map((entity, index) => ({ ...entity, simulationKind: 'planet', simulationIndex: index })),
        ...state.bonuses.map((entity, index) => ({ ...entity, simulationKind: 'bonus', simulationIndex: index })),
        { ...state.target, simulationKind: 'target', simulationIndex: 0 }
    ];
    const advanced = advanceOrbitGraph(entities, deltaTime);
    for (const entity of advanced) {
        if (entity.simulationKind === 'planet') state.planets[entity.simulationIndex] = stripSimulationMetadata(entity);
        else if (entity.simulationKind === 'bonus') state.bonuses[entity.simulationIndex] = stripSimulationMetadata(entity);
        else state.target = stripSimulationMetadata(entity);
    }
}

function stripSimulationMetadata(entity) {
    const { simulationKind, simulationIndex, ...clean } = entity;
    return clean;
}

function stepSoaringPenguin(state, deltaTime, events, options) {
    const collisionIndex = findPlanetCollision(state.penguin.position, state.planets);
    if (collisionIndex >= 0) {
        const planet = state.planets[collisionIndex];
        const bounce = resolvePlanetBounce(state.penguin.position, state.penguin.velocity, planet);
        state.penguin.position = bounce.position;
        state.penguin.velocity = bounce.velocity;
        state.penguin.state = 'crashed';
        state.penguin.crashFramesRemaining = 150;
        state.counters.planetCollisions += 1;
        events.push({
            type: SimulationEventType.PLANET_COLLISION,
            planetId: planet.id,
            planetIndex: collisionIndex,
            position: clonePoint(state.penguin.position)
        });
        return;
    }

    const previousPosition = clonePoint(state.penguin.position);
    const gravity = integratePlanetGravity(
        state.penguin.position,
        state.penguin.velocity,
        state.planets.map(planet => ({
            x: planet.position.x,
            y: planet.position.y,
            mass: planet.mass,
            gravitationalReach: planet.gravitationalReach
        })),
        state.rules.gravitationalConstant,
        deltaTime
    );
    state.penguin.position = gravity.position;
    state.penguin.velocity = gravity.velocity;
    const traveled = distance(previousPosition, state.penguin.position);
    state.counters.distance += traveled;
    if (options.emitMovementEvents !== false) {
        events.push({
            type: SimulationEventType.PENGUIN_MOVED,
            from: previousPosition,
            position: clonePoint(state.penguin.position),
            distance: traveled,
            deltaTime
        });
    }

    collectBonuses(state, events);
    if (circlesOverlap(state.penguin.position, 0, state.target.position, state.target.width / 2)) {
        const victoryFailure = evaluateVictoryRules(state);
        if (victoryFailure) {
            state.penguin.state = 'crashed';
            state.penguin.crashFramesRemaining = 2;
            events.push({
                type: SimulationEventType.TARGET_BLOCKED,
                ...victoryFailure,
                position: clonePoint(state.penguin.position)
            });
        } else {
            state.penguin.state = 'hitTarget';
            state.penguin.velocity = { x: 0, y: 0 };
            events.push({
                type: SimulationEventType.TARGET_HIT,
                position: clonePoint(state.penguin.position)
            });
        }
        return;
    }

    if (!pointInRect(state.penguin.position, state.bounds.flight)) {
        state.penguin.state = 'crashed';
        state.penguin.crashFramesRemaining = 2;
        events.push({
            type: SimulationEventType.OUT_OF_BOUNDS,
            position: clonePoint(state.penguin.position)
        });
    }
}

function stepCrashedPenguin(state, deltaTime, events, options) {
    state.penguin.crashFramesRemaining -= deltaTime * LEGACY_PHYSICS_FPS;
    if (!pointInRect(state.penguin.position, state.bounds.stage)) {
        state.penguin.velocity = { x: 0, y: 0 };
    } else {
        state.penguin.position.x += state.penguin.velocity.x * deltaTime;
        state.penguin.position.y += state.penguin.velocity.y * deltaTime;
        const collisionIndex = findPlanetCollision(state.penguin.position, state.planets);
        if (collisionIndex >= 0) {
            const planet = state.planets[collisionIndex];
            const bounce = resolvePlanetBounce(state.penguin.position, state.penguin.velocity, planet);
            state.penguin.position = bounce.position;
            state.penguin.velocity = bounce.velocity;
            events.push({
                type: SimulationEventType.PLANET_BOUNCE,
                planetId: planet.id,
                planetIndex: collisionIndex,
                position: clonePoint(state.penguin.position)
            });
        }
        if (options.emitMovementEvents !== false) {
            events.push({
                type: SimulationEventType.PENGUIN_MOVED,
                position: clonePoint(state.penguin.position),
                distance: 0,
                deltaTime
            });
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
            events.push({
                type: SimulationEventType.BONUS_COLLECTED,
                bonusId: bonus.id,
                bonusIndex: index,
                value: bonus.value,
                position: clonePoint(bonus.position)
            });
        }
    }
}

function findPlanetCollision(position, planets) {
    return planets.findIndex(planet => circlesOverlap(position, 0, planet.position, planet.collisionRadius));
}

export function resolvePlanetBounce(position, velocity, planet) {
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
        x: (velocity.x - 2 * dot * nx) * 0.8,
        y: (velocity.y - 2 * dot * ny) * 0.8
    };
    if (Math.hypot(bouncedVelocity.x, bouncedVelocity.y) < 50) {
        bouncedVelocity = { x: nx * 50, y: ny * 50 };
    }
    const safeDistance = planet.collisionRadius + 5;
    return {
        position: {
            x: planet.position.x + nx * Math.max(normalLength, safeDistance),
            y: planet.position.y + ny * Math.max(normalLength, safeDistance)
        },
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

export function calculateLevelScore({ distance, level, tries, attemptBonus, totalScore, multiplier = 1 }) {
    const safeTries = Math.max(1, tries);
    const levelScore = Math.floor(distance * level / safeTries);
    const scoreBeforeMultiplier = totalScore + levelScore + attemptBonus;
    return {
        levelScore,
        totalScore: multiplier === 1
            ? scoreBeforeMultiplier
            : Math.floor(scoreBeforeMultiplier * multiplier)
    };
}
