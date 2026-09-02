import { SIMULATION_CONFIG } from '../config/gameConfig.js';
import { EDITOR_CONFIG } from '../config/editorConfig.js';
import {
    calculateLaunchVelocity,
    SimulationEventType,
    stepSimulationMutable
} from './simulationEngine.js';
import { cloneSimulationState } from './simulationState.js';
import { createGravitySculptWasmEvaluator } from './wasmSimulationBridge.js';

const DEFAULT_OPTIONS = EDITOR_CONFIG.gravitySculpt;

function createAbortError() {
    if (typeof DOMException === 'function') return new DOMException('Gravity Sculpt was cancelled', 'AbortError');
    const error = new Error('Gravity Sculpt was cancelled');
    error.name = 'AbortError';
    return error;
}

function throwIfAborted(signal) {
    if (signal?.aborted) throw createAbortError();
}

const PARAMETER_KIND = Object.freeze({
    LAUNCH: 'launch',
    MASS: 'mass',
    POSITION: 'position',
    CUSTOM: 'custom'
});

const PLANET_PARAMETER_DEFINITIONS = Object.freeze([
    {
        property: 'x',
        kind: PARAMETER_KIND.POSITION,
        enabledBy: 'adjustPosition',
        read: planet => planet.position.x,
        bounds: (state, planet, config) => ({
            min: clamp(planet.position.x - config.positionRange, state.bounds.stage.x, state.bounds.stage.x + state.bounds.stage.width),
            max: clamp(planet.position.x + config.positionRange, state.bounds.stage.x, state.bounds.stage.x + state.bounds.stage.width)
        }),
        write: (planet, value) => { planet.position.x = value; }
    },
    {
        property: 'y',
        kind: PARAMETER_KIND.POSITION,
        enabledBy: 'adjustPosition',
        read: planet => planet.position.y,
        bounds: (state, planet, config) => ({
            min: clamp(planet.position.y - config.positionRange, state.bounds.stage.y, state.bounds.stage.y + state.bounds.stage.height),
            max: clamp(planet.position.y + config.positionRange, state.bounds.stage.y, state.bounds.stage.y + state.bounds.stage.height)
        }),
        write: (planet, value) => { planet.position.y = value; }
    },
    {
        property: 'mass',
        kind: PARAMETER_KIND.MASS,
        scale: 'log',
        enabledBy: 'adjustMass',
        read: planet => planet.mass,
        bounds: (_state, planet, config) => ({
            min: config.minimumMass,
            max: Math.max(config.minimumMass * config.maximumMassMultiplier, planet.mass * config.maximumMassMultiplier)
        }),
        write: (planet, value) => { planet.mass = value; }
    }
]);

const HARD_GOAL_RULES = Object.freeze([
    {
        id: 'target',
        enabled: goals => goals.requireTarget,
        violated: ({ state }) => state.penguin.state !== PenguinState.HIT_TARGET
    },
    {
        id: 'planet_collision',
        enabled: goals => goals.avoidPlanetCollisions,
        violated: ({ eventTypes }) => eventTypes.has(SimulationEventType.PLANET_COLLISION)
    },
    {
        id: 'out_of_bounds',
        enabled: goals => goals.stayInBounds,
        violated: ({ eventTypes }) => eventTypes.has(SimulationEventType.OUT_OF_BOUNDS)
    },
    {
        id: 'time_limit',
        enabled: goals => Number.isFinite(goals.maxFlightSeconds),
        violated: ({ elapsedSeconds, goals }) => elapsedSeconds > goals.maxFlightSeconds
    }
]);

const COMFORT_OBJECTIVE_TERMS = Object.freeze([
    {
        name: 'peakGravity',
        value: ({ peakGravityAcceleration, config }) =>
            Math.max(0, peakGravityAcceleration / config.peakGravityAccelerationSoftLimit - 1) ** 2 *
            config.peakGravityAccelerationWeight
    },
    {
        name: 'meanGravity',
        value: ({ meanGravityAcceleration, config }) =>
            Math.max(0, meanGravityAcceleration / config.meanGravityAccelerationSoftLimit - 1) ** 2 *
            config.meanGravityAccelerationWeight
    },
    {
        name: 'routeEfficiency',
        value: ({ pathEfficiency, config }) =>
            Math.max(0, pathEfficiency - 1) ** 2 * config.pathEfficiencyWeight
    }
]);

const ROBUST_SCORE_TERMS = Object.freeze([
    { name: 'central', weight: 'robustCentralWeight', value: ({ central }) => central.score },
    { name: 'average', weight: 'robustAverageWeight', value: ({ averageScore }) => averageScore },
    { name: 'worst', weight: 'robustWorstWeight', value: ({ worstScore }) => worstScore }
]);

const OPTIMIZATION_STAGE_DEFINITIONS = Object.freeze([
    { name: 'launch', accepts: variable => parameterKind(variable) === PARAMETER_KIND.LAUNCH, useInfluenceGuidance: true },
    { name: 'mass', accepts: variable => parameterKind(variable) === PARAMETER_KIND.MASS, useInfluenceGuidance: true },
    { name: 'position', accepts: variable => parameterKind(variable) === PARAMETER_KIND.POSITION, useInfluenceGuidance: true },
    { name: 'joint', accepts: () => true, useInfluenceGuidance: true }
]);

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function distance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
}

function routeCompletionGoalsSatisfied(state, goals = {}) {
    if (goals.requireTarget) return false;
    return (goals.requiredBonusIndices || []).every(index => state.bonuses[index]?.collected);
}

export function inferSculptLaunch(state, desiredPath, pullbackPower = state.slingshot.maxPullback) {
    const origin = state.slingshot.position;
    const directionPoint = desiredPath.find(point => distance(origin, point) >= 12) || desiredPath.at(-1);
    if (!directionPoint) throw new Error('Draw a path with a clear direction from the slingshot.');
    const angleDegrees = Math.atan2(directionPoint.y - origin.y, directionPoint.x - origin.x) * 180 / Math.PI;
    return {
        angleDegrees,
        pullbackPower,
        velocity: calculateLaunchVelocity(angleDegrees, pullbackPower, state.slingshot)
    };
}

export function createExistingPlanetVariables(state, planetIndices, options = {}) {
    const config = { ...DEFAULT_OPTIONS, ...options };
    return planetIndices.flatMap(index => {
        const planet = state.planets[index];
        if (!planet || planet.orbit) return [];
        return PLANET_PARAMETER_DEFINITIONS
            .filter(definition => config[definition.enabledBy] !== false)
            .map(definition => ({
                key: `planet.${index}.${definition.property}`,
                kind: definition.kind,
                scale: definition.scale || 'linear',
                group: `planet.${index}`,
                property: definition.property,
                initial: definition.read(planet),
                ...definition.bounds(state, planet, config),
                apply: (candidate, value) => definition.write(candidate.planets[index], value)
            }));
    });
}

export function createLaunchVariables(state, desiredPath, options = {}) {
    const config = { ...DEFAULT_OPTIONS, ...options };
    const inferred = inferSculptLaunch(state, desiredPath);
    const applyLaunch = (candidate, _value, parameters) => {
        candidate.penguin.velocity = calculateLaunchVelocity(
            parameters['launch.angleDegrees'],
            parameters['launch.pullbackPower'],
            candidate.slingshot
        );
    };
    return [
        {
            key: 'launch.angleDegrees',
            kind: PARAMETER_KIND.LAUNCH,
            group: 'launch',
            property: 'angleDegrees',
            initial: inferred.angleDegrees,
            min: inferred.angleDegrees - config.launchAngleRange,
            max: inferred.angleDegrees + config.launchAngleRange,
            apply: applyLaunch
        },
        {
            key: 'launch.pullbackPower',
            kind: PARAMETER_KIND.LAUNCH,
            group: 'launch',
            property: 'pullbackPower',
            initial: inferred.pullbackPower,
            min: Math.max(
                state.slingshot.minPullback,
                state.slingshot.maxPullback * config.minimumLaunchPowerFraction
            ),
            max: state.slingshot.maxPullback,
            apply: applyLaunch
        }
    ];
}

function applyValues(state, variables, values) {
    const parameters = Object.fromEntries(
        variables.map((variable, index) => [variable.key, values[index]])
    );
    variables.forEach((variable, index) => variable.apply(state, values[index], parameters));
}

function parameterKind(variable) {
    if (variable.kind) return variable.kind;
    if (variable.key.startsWith('launch.')) return PARAMETER_KIND.LAUNCH;
    if (variable.key.endsWith('.mass')) return PARAMETER_KIND.MASS;
    if (/^planet\.\d+\.[xy]$/.test(variable.key)) return PARAMETER_KIND.POSITION;
    return PARAMETER_KIND.CUSTOM;
}

function parameterPenalty(variable, config) {
    return {
        [PARAMETER_KIND.LAUNCH]: config.launchPenalty,
        [PARAMETER_KIND.MASS]: config.massPenalty,
        [PARAMETER_KIND.POSITION]: config.movementPenalty,
        [PARAMETER_KIND.CUSTOM]: config.movementPenalty
    }[parameterKind(variable)];
}

function toSearchCoordinate(variable, value) {
    return variable.scale === 'log' ? Math.log(Math.max(Number.MIN_VALUE, value)) : value;
}

function fromSearchCoordinate(variable, coordinate) {
    const value = variable.scale === 'log' ? Math.exp(coordinate) : coordinate;
    return clamp(value, variable.min, variable.max);
}

function searchSpan(variable) {
    return Math.max(
        Number.EPSILON,
        toSearchCoordinate(variable, variable.max) - toSearchCoordinate(variable, variable.min)
    );
}

function sumTerms(definitions, context) {
    return Object.fromEntries(definitions.map(definition => [definition.name, definition.value(context)]));
}

function totalTerms(terms) {
    return Object.values(terms).reduce((total, value) => total + value, 0);
}

function direction(points, index, radius = 2) {
    const before = points[Math.max(0, index - radius)];
    const after = points[Math.min(points.length - 1, index + radius)];
    return Math.atan2(after.y - before.y, after.x - before.x);
}

function matchWaypointsInOrder(trajectory, waypoints, config) {
    if (waypoints.length <= 1) return [];
    const originalLength = trajectory.length;
    const samples = trajectory.map(point => ({ ...point }));
    while (samples.length < waypoints.length) samples.push({ ...samples.at(-1) });
    const targets = waypoints.slice(1);
    const costs = targets.map(() => Array(samples.length).fill(Number.POSITIVE_INFINITY));
    const parents = targets.map(() => Array(samples.length).fill(-1));
    const matchCost = (sample, target, virtual = false) => {
        const matchDistance = virtual
            ? Math.max(config.unmatchedWaypointDistance, distance(sample, target))
            : distance(sample, target);
        return matchDistance ** 2 +
            (matchDistance > config.checkpointTolerance ? config.waypointConstraintPenalty : 0);
    };

    for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex++) {
        costs[0][sampleIndex] = matchCost(
            samples[sampleIndex], targets[0], sampleIndex >= originalLength
        );
    }
    for (let targetIndex = 1; targetIndex < targets.length; targetIndex++) {
        let bestPreviousCost = Number.POSITIVE_INFINITY;
        let bestPreviousIndex = -1;
        for (let sampleIndex = targetIndex + 1; sampleIndex < samples.length; sampleIndex++) {
            const previousIndex = sampleIndex - 1;
            if (costs[targetIndex - 1][previousIndex] < bestPreviousCost) {
                bestPreviousCost = costs[targetIndex - 1][previousIndex];
                bestPreviousIndex = previousIndex;
            }
            if (bestPreviousIndex < 0) continue;
            costs[targetIndex][sampleIndex] = bestPreviousCost + matchCost(
                samples[sampleIndex], targets[targetIndex], sampleIndex >= originalLength
            );
            parents[targetIndex][sampleIndex] = bestPreviousIndex;
        }
    }

    const lastCosts = costs.at(-1);
    let sampleIndex = lastCosts.indexOf(Math.min(...lastCosts));
    const matches = Array(targets.length);
    for (let targetIndex = targets.length - 1; targetIndex >= 0; targetIndex--) {
        const virtual = sampleIndex >= originalLength;
        matches[targetIndex] = {
            index: Math.min(sampleIndex, originalLength - 1),
            distance: virtual
                ? Math.max(config.unmatchedWaypointDistance, distance(samples[sampleIndex], targets[targetIndex]))
                : distance(samples[sampleIndex], targets[targetIndex]),
            virtual
        };
        sampleIndex = parents[targetIndex][sampleIndex];
    }
    return matches;
}

export function analyzeSculptTrajectory(trajectory, desiredPath, terminal, variables, values, options = {}) {
    const config = { ...DEFAULT_OPTIONS, ...options };
    if (trajectory.length === 0 || desiredPath.length === 0) {
        return { score: Number.POSITIVE_INFINITY, checkpointCoverage: 0 };
    }
    let score = 0;
    let checkpointsReached = 0;
    const matches = matchWaypointsInOrder(trajectory, desiredPath, config);
    const waypointCount = Math.max(1, desiredPath.length - 1);
    for (const match of matches) {
        const excess = Math.max(0, match.distance - config.checkpointTolerance);
        score += (
            excess * excess +
            match.distance * match.distance * config.waypointProximityWeight
        ) / waypointCount;
        if (!match.virtual && match.distance <= config.checkpointTolerance) checkpointsReached += 1;
    }
    const missedWaypointCount = waypointCount - checkpointsReached;
    score += missedWaypointCount * config.waypointConstraintPenalty;
    const endpointDelta = distance(trajectory.at(-1), desiredPath.at(-1));
    variables.forEach((variable, index) => {
        const normalized = (
            toSearchCoordinate(variable, values[index]) -
            toSearchCoordinate(variable, variable.initial)
        ) / searchSpan(variable);
        score += normalized * normalized * parameterPenalty(variable, config);
    });
    if (terminal && terminal !== PenguinState.HIT_TARGET) score += config.terminalPenalty;
    return {
        score,
        checkpointCoverage: checkpointsReached / waypointCount,
        missedWaypointCount,
        endpointDistance: endpointDelta,
        waypointMatches: matches
    };
}

export function scoreSculptTrajectory(trajectory, desiredPath, terminal, variables, values, options = {}) {
    return analyzeSculptTrajectory(trajectory, desiredPath, terminal, variables, values, options).score;
}

function evaluateHardGoals(state, eventTypes, elapsedSeconds, goals = {}) {
    const context = { state, eventTypes, elapsedSeconds, goals };
    const ruleViolations = HARD_GOAL_RULES
        .filter(rule => rule.enabled(goals) && rule.violated(context))
        .map(rule => rule.id);
    const bonusViolations = (goals.requiredBonusIndices || [])
        .filter(index => !state.bonuses[index]?.collected)
        .map(index => `bonus_${index}`);
    return [...ruleViolations, ...bonusViolations];
}

function minimumRouteDistance(desiredPath, state, config) {
    const route = desiredPath.map(point => ({ ...point }));
    if (
        config.goals?.requireTarget &&
        distance(route.at(-1), state.target.position) > config.checkpointTolerance
    ) {
        route.push({ ...state.target.position });
    }
    let total = 0;
    for (let index = 1; index < route.length; index++) {
        total += distance(route[index - 1], route[index]);
    }
    return Math.max(1, total);
}

function simulateSculptCandidate(
    baseState,
    desiredPath,
    variables,
    values,
    launch,
    config,
    velocityOverride = null
) {
    const state = cloneSimulationState(baseState);
    state.penguin.position = { ...state.slingshot.position };
    state.penguin.velocity = { ...launch.velocity };
    state.penguin.state = PenguinState.SOARING;
    state.penguin.crashFramesRemaining = 0;
    state.counters.tries += 1;
    // Parameter descriptors own how values affect a candidate. Existing
    // planets use this today; launch and generated-planet descriptors can use
    // the same seam without coupling the optimizer to their UI.
    applyValues(state, variables, values);
    if (velocityOverride) state.penguin.velocity = { ...velocityOverride };
    const trajectory = [{ ...state.penguin.position }];
    const eventTypes = new Set();
    const directDistance = minimumRouteDistance(desiredPath, state, config);
    const trajectoryDistanceBudget = directDistance * config.trajectoryDistanceBudgetMultiplier;
    const steps = Math.ceil(
        config.previewSeconds * config.trajectoryTimeSafetyMultiplier /
        SIMULATION_CONFIG.aimAssist.timeStep
    );
    let elapsedSeconds = 0;
    let pathLength = 0;
    let peakGravityAcceleration = 0;
    let gravityAccelerationTotal = 0;
    let gravitySamples = 0;
    let nextWaypointIndex = 1;
    for (let step = 1; step <= steps; step++) {
        const previousPosition = { ...state.penguin.position };
        const previousVelocity = { ...state.penguin.velocity };
        const wasSoaring = state.penguin.state === PenguinState.SOARING;
        const result = stepSimulationMutable(
            state,
            SIMULATION_CONFIG.aimAssist.timeStep,
            { emitMovementEvents: false }
        );
        result.events.forEach(event => eventTypes.add(event.type));
        elapsedSeconds += SIMULATION_CONFIG.aimAssist.timeStep;
        pathLength += distance(previousPosition, state.penguin.position);
        const collided = result.events.some(event =>
            event.type === SimulationEventType.PLANET_COLLISION ||
            event.type === SimulationEventType.PLANET_BOUNCE
        );
        if (wasSoaring && state.penguin.state === PenguinState.SOARING && !collided) {
            const acceleration = Math.hypot(
                state.penguin.velocity.x - previousVelocity.x,
                state.penguin.velocity.y - previousVelocity.y
            ) / SIMULATION_CONFIG.aimAssist.timeStep;
            peakGravityAcceleration = Math.max(peakGravityAcceleration, acceleration);
            gravityAccelerationTotal += acceleration;
            gravitySamples += 1;
        }
        if (step % config.sampleEverySteps === 0 || state.penguin.state !== PenguinState.SOARING) {
            trajectory.push({ ...state.penguin.position });
            if (
                nextWaypointIndex < desiredPath.length &&
                distance(state.penguin.position, desiredPath[nextWaypointIndex]) <= config.checkpointTolerance
            ) {
                nextWaypointIndex += 1;
            }
        }
        if (state.penguin.state !== PenguinState.SOARING) break;
        if (
            nextWaypointIndex >= desiredPath.length &&
            routeCompletionGoalsSatisfied(state, config.goals)
        ) {
            break;
        }
        if (pathLength >= trajectoryDistanceBudget) break;
    }
    const metrics = analyzeSculptTrajectory(
        trajectory, desiredPath, state.penguin.state, variables, values, config
    );
    const constraintViolations = evaluateHardGoals(
        state,
        eventTypes,
        elapsedSeconds,
        config.goals
    );
    const meanGravityAcceleration = gravitySamples > 0
        ? gravityAccelerationTotal / gravitySamples
        : 0;
    const pathEfficiency = pathLength / directDistance;
    const comfortTerms = sumTerms(COMFORT_OBJECTIVE_TERMS, {
        peakGravityAcceleration,
        meanGravityAcceleration,
        pathEfficiency,
        config
    });
    const physicsComfortPenalty = totalTerms(comfortTerms);
    const objectiveTerms = {
        waypointFit: metrics.score,
        hardConstraints: constraintViolations.length * config.hardConstraintPenalty,
        ...comfortTerms
    };
    return {
        ...metrics,
        score: totalTerms(objectiveTerms),
        trajectory,
        terminal: state.penguin.state,
        values: [...values],
        constraintViolations,
        elapsedSeconds,
        pathLength,
        directDistance,
        pathEfficiency,
        peakGravityAcceleration,
        meanGravityAcceleration,
        physicsComfortPenalty,
        objectiveTerms
    };
}

export function evaluateSculptCandidate(baseState, desiredPath, launch, variables, values, options = {}) {
    const config = { ...DEFAULT_OPTIONS, ...options };
    const central = simulateSculptCandidate(
        baseState, desiredPath, variables, values, launch, config
    );
    const parameters = Object.fromEntries(
        variables.map((variable, index) => [variable.key, values[index]])
    );
    const angle = parameters['launch.angleDegrees'];
    const power = parameters['launch.pullbackPower'];
    const offsets = Number.isFinite(angle) && Number.isFinite(power)
        ? config.robustLaunchOffsets
        : [];
    const neighbors = offsets.map(offset => {
        const perturbedPower = clamp(
            power * (1 + offset.powerFraction),
            baseState.slingshot.minPullback,
            baseState.slingshot.maxPullback
        );
        const velocity = calculateLaunchVelocity(
            angle + offset.angleDegrees,
            perturbedPower,
            baseState.slingshot
        );
        return simulateSculptCandidate(
            baseState, desiredPath, variables, values, launch, config, velocity
        );
    });
    if (neighbors.length === 0) return { ...central, simulationCount: 1 };
    const averageScore = neighbors.reduce((sum, result) => sum + result.score, 0) / neighbors.length;
    const worstScore = Math.max(...neighbors.map(result => result.score));
    const robustCheckpointCoverage = Math.min(
        central.checkpointCoverage,
        ...neighbors.map(result => result.checkpointCoverage)
    );
    const robustGoalSuccessRate = [central, ...neighbors]
        .filter(result => result.constraintViolations.length === 0).length / (neighbors.length + 1);
    const robustScoreTerms = sumTerms(ROBUST_SCORE_TERMS, {
        central,
        averageScore,
        worstScore
    });
    for (const definition of ROBUST_SCORE_TERMS) {
        robustScoreTerms[definition.name] *= config[definition.weight];
    }
    return {
        ...central,
        score: totalTerms(robustScoreTerms),
        robustScoreTerms,
        robustCheckpointCoverage,
        robustGoalSuccessRate,
        simulationCount: neighbors.length + 1
    };
}

function createSculptEvaluator(state, launch, variables) {
    let wasm = null;
    try {
        wasm = createGravitySculptWasmEvaluator({
            state,
            launch,
            variables,
            simulation: SIMULATION_CONFIG
        });
    } catch {
        // Unsupported or stale Wasm artifacts must not make the editor tool
        // unavailable. Browser bootstrap already treats JavaScript as the
        // authoritative compatibility fallback.
        wasm = null;
    }
    return {
        backend: wasm?.backend || 'javascript',
        evaluateMany(path, config, valueSets, options) {
            if (valueSets.length === 0) return [];
            if (wasm) return wasm.evaluateBatch(path, config, valueSets, options);
            return valueSets.map(values =>
                evaluateSculptCandidate(state, path, launch, variables, values, config)
            );
        },
        dispose() { wasm?.dispose(); }
    };
}

function variableIndices(variables, predicate) {
    return variables.flatMap((variable, index) => predicate(variable) ? [index] : []);
}

function randomizeActiveValues(seed, activeIndices, variables, path, config, random) {
    const values = [...seed];
    for (const index of activeIndices) {
        const variable = variables[index];
        const minimum = toSearchCoordinate(variable, variable.min);
        values[index] = fromSearchCoordinate(
            variable,
            minimum + random() * searchSpan(variable)
        );
    }

    // Planet positions seeded beside checkpoints are much more likely to bend
    // the shot usefully than uniformly random positions elsewhere on stage.
    const positionByPlanet = new Map();
    for (const index of activeIndices) {
        const variable = variables[index];
        if (parameterKind(variable) !== PARAMETER_KIND.POSITION) continue;
        const group = variable.group || variable.key.split('.').slice(0, -1).join('.');
        const property = variable.property || variable.key.split('.').at(-1);
        const entry = positionByPlanet.get(group) || {};
        entry[property] = index;
        positionByPlanet.set(group, entry);
    }
    for (const pair of positionByPlanet.values()) {
        if (pair.x === undefined || pair.y === undefined || path.length < 2) continue;
        const pathIndex = Math.min(
            path.length - 1,
            1 + Math.floor(random() * Math.max(1, path.length - 2))
        );
        const tangent = direction(path, pathIndex);
        const offsetRange = config.pathPlanetOffset;
        const offset = (random() < 0.5 ? -1 : 1) * (
            offsetRange.minimum + random() * (offsetRange.maximum - offsetRange.minimum)
        );
        values[pair.x] = clamp(
            path[pathIndex].x - Math.sin(tangent) * offset,
            variables[pair.x].min,
            variables[pair.x].max
        );
        values[pair.y] = clamp(
            path[pathIndex].y + Math.cos(tangent) * offset,
            variables[pair.y].min,
            variables[pair.y].max
        );
    }
    return values;
}

function distinctPopulationIndices(length, excluded, count, random) {
    const available = [];
    for (let index = 0; index < length; index++) {
        if (index !== excluded) available.push(index);
    }
    for (let index = available.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1));
        [available[index], available[swap]] = [available[swap], available[index]];
    }
    return available.slice(0, count);
}

function centralOnlyConfig(config) {
    return config.robustLaunchOffsets?.length
        ? { ...config, robustLaunchOffsets: [] }
        : config;
}

function stageRobustnessPlan(stageName, stageConfig, config, enabled) {
    const robust = enabled && stageName === 'joint' && config.robustLaunchOffsets?.length > 0;
    if (!robust) {
        return {
            enabled: false,
            startGeneration: Number.POSITIVE_INFINITY,
            initialConfig: centralOnlyConfig(config)
        };
    }
    const robustGenerations = Math.max(
        1,
        Math.ceil(stageConfig.generations * clamp(config.robustOptimizationFraction, 0, 1))
    );
    const startGeneration = Math.max(0, stageConfig.generations - robustGenerations);
    return {
        enabled: true,
        startGeneration,
        initialConfig: startGeneration === 0 ? config : centralOnlyConfig(config)
    };
}

function candidateTier(candidate) {
    return [
        candidate.constraintViolations?.length || 0,
        candidate.robustGoalSuccessRate ?? 1,
        candidate.missedWaypointCount ?? Number.POSITIVE_INFINITY,
        candidate.robustCheckpointCoverage ?? candidate.checkpointCoverage ?? 0
    ].join(':');
}

function meaningfullyImproved(previous, current, config) {
    if (!previous || compareSculptCandidates(current, previous) >= 0) return false;
    if (candidateTier(previous) !== candidateTier(current)) return true;
    const threshold = Math.max(1, Math.abs(previous.score)) * config.convergenceRelativeTolerance;
    return previous.score - current.score > threshold;
}

function populationSizeForStage(activeIndices, stageConfig, config) {
    const populationPerVariable = Math.max(2, Math.round(4 * config.budgetMultiplier));
    return Math.min(
        config.maximumPopulation,
        Math.max(stageConfig.population, activeIndices.length * populationPerVariable, 4)
    );
}

function mergeStageSeeds(primary, secondary, limit) {
    const unique = new Map();
    for (const candidate of [...primary, ...secondary]) {
        const signature = candidate.values.join('\u0000');
        if (!unique.has(signature)) unique.set(signature, candidate);
        if (unique.size >= limit) break;
    }
    return [...unique.values()];
}

export function compareSculptCandidates(left, right) {
    const hardGoalViolations = (left.constraintViolations?.length || 0) -
        (right.constraintViolations?.length || 0);
    if (hardGoalViolations !== 0) return hardGoalViolations;

    const robustGoalSuccess = (right.robustGoalSuccessRate ?? 1) -
        (left.robustGoalSuccessRate ?? 1);
    if (robustGoalSuccess !== 0) return robustGoalSuccess;

    const missedWaypoints = (left.missedWaypointCount ?? Number.POSITIVE_INFINITY) -
        (right.missedWaypointCount ?? Number.POSITIVE_INFINITY);
    if (missedWaypoints !== 0) return missedWaypoints;

    const robustCoverage = (right.robustCheckpointCoverage ?? right.checkpointCoverage ?? 0) -
        (left.robustCheckpointCoverage ?? left.checkpointCoverage ?? 0);
    if (robustCoverage !== 0) return robustCoverage;

    return left.score - right.score;
}

function candidateWaypointErrors(candidate, path, sampleIndices) {
    const indices = sampleIndices || (candidate.waypointMatches || []).map(match => match.index);
    return indices.map((sampleIndex, index) => {
        const point = candidate.waypointMatches?.[index]?.point ||
            candidate.trajectory[Math.min(sampleIndex, candidate.trajectory.length - 1)];
        const waypoint = path[index + 1];
        return {
            x: point.x - waypoint.x,
            y: point.y - waypoint.y
        };
    });
}

function solveInfluenceCorrections(base, perturbations, variableIndicesToSolve, variables, path, config) {
    const sampleIndices = (base.waypointMatches || []).map(match => match.index);
    const baseErrors = candidateWaypointErrors(base, path, sampleIndices);
    if (baseErrors.length === 0) return null;
    const sensitivities = perturbations.map(({ lower, upper, parameterDelta }) => {
        const lowerErrors = candidateWaypointErrors(lower, path, sampleIndices);
        const upperErrors = candidateWaypointErrors(upper, path, sampleIndices);
        return baseErrors.map((_error, index) => ({
            x: (upperErrors[index].x - lowerErrors[index].x) / parameterDelta,
            y: (upperErrors[index].y - lowerErrors[index].y) / parameterDelta
        }));
    });
    const corrections = variableIndicesToSolve.map(() => 0);
    const residuals = baseErrors.map(error => ({ ...error }));
    for (let pass = 0; pass < config.influenceCorrectionPasses; pass++) {
        variableIndicesToSolve.forEach((variableIndex, influenceIndex) => {
            const sensitivity = sensitivities[influenceIndex];
            const previousCorrection = corrections[influenceIndex];
            let projection = 0;
            let magnitudeSquared = config.influenceRegularization;
            sensitivity.forEach((effect, waypointIndex) => {
                const withoutCurrent = {
                    x: residuals[waypointIndex].x - effect.x * previousCorrection,
                    y: residuals[waypointIndex].y - effect.y * previousCorrection
                };
                projection += effect.x * withoutCurrent.x + effect.y * withoutCurrent.y;
                magnitudeSquared += effect.x ** 2 + effect.y ** 2;
            });
            const variable = variables[variableIndex];
            const baseCoordinate = toSearchCoordinate(variable, base.values[variableIndex]);
            const nextCorrection = clamp(
                -projection / magnitudeSquared,
                toSearchCoordinate(variable, variable.min) - baseCoordinate,
                toSearchCoordinate(variable, variable.max) - baseCoordinate
            );
            const correctionDelta = nextCorrection - previousCorrection;
            corrections[influenceIndex] = nextCorrection;
            sensitivity.forEach((effect, waypointIndex) => {
                residuals[waypointIndex].x += effect.x * correctionDelta;
                residuals[waypointIndex].y += effect.y * correctionDelta;
            });
        });
    }
    return corrections;
}

function selectInfluentialVariables(variableIndicesToRank, sensitivities, variables, config) {
    if (variableIndicesToRank.length <= config.influenceMinimumActiveVariables) {
        return [...variableIndicesToRank];
    }
    const ranked = variableIndicesToRank.map((variableIndex, influenceIndex) => {
        const effects = sensitivities[influenceIndex];
        const span = searchSpan(variables[variableIndex]);
        const leverage = effects.reduce((total, effect, waypointIndex) => {
            const recencyWeight = waypointIndex === effects.length - 1 ? 1 : 0.25;
            return total + Math.hypot(effect.x, effect.y) * span * recencyWeight;
        }, 0);
        return { variableIndex, leverage };
    }).sort((left, right) => right.leverage - left.leverage);
    const maximumLeverage = ranked[0]?.leverage || 0;
    const selected = ranked
        .filter(entry => entry.leverage >= maximumLeverage * config.influenceActivationThreshold)
        .map(entry => entry.variableIndex);
    for (const entry of ranked) {
        if (selected.length >= Math.min(config.influenceMinimumActiveVariables, ranked.length)) break;
        if (!selected.includes(entry.variableIndex)) selected.push(entry.variableIndex);
    }
    return selected;
}

async function createInfluenceGuidance({
    base,
    activeIndices,
    state,
    path,
    launch,
    variables,
    config,
    progress,
    evaluator
}) {
    if (activeIndices.length === 0) return { candidates: [], activeIndices: [] };
    const perturbationRequests = [];
    const probeConfig = { ...config, robustLaunchOffsets: [] };
    for (const variableIndex of activeIndices) {
        const variable = variables[variableIndex];
        const baseCoordinate = toSearchCoordinate(variable, base.values[variableIndex]);
        const requestedDelta = searchSpan(variable) * config.influencePerturbationFraction;
        const lowerValues = [...base.values];
        const upperValues = [...base.values];
        lowerValues[variableIndex] = fromSearchCoordinate(
            variable,
            baseCoordinate - requestedDelta
        );
        upperValues[variableIndex] = fromSearchCoordinate(
            variable,
            baseCoordinate + requestedDelta
        );
        const parameterDelta =
            toSearchCoordinate(variable, upperValues[variableIndex]) -
            toSearchCoordinate(variable, lowerValues[variableIndex]);
        if (parameterDelta === 0) continue;
        perturbationRequests.push({ lowerValues, upperValues, parameterDelta });
    }
    const probeResults = await evaluator.evaluateMany(
        path,
        probeConfig,
        perturbationRequests.flatMap(request => [request.lowerValues, request.upperValues])
    );
    const perturbations = perturbationRequests.map((request, index) => ({
        lower: probeResults[index * 2],
        upper: probeResults[index * 2 + 1],
        parameterDelta: request.parameterDelta
    }));
    progress.evaluations += probeResults.reduce((sum, candidate) => sum + candidate.simulationCount, 0);
    if (perturbations.length !== activeIndices.length) {
        return { candidates: [], activeIndices: [...activeIndices] };
    }
    const sampleIndices = (base.waypointMatches || []).map(match => match.index);
    const sensitivities = perturbations.map(({ lower, upper, parameterDelta }) => {
        const lowerErrors = candidateWaypointErrors(lower, path, sampleIndices);
        const upperErrors = candidateWaypointErrors(upper, path, sampleIndices);
        return lowerErrors.map((_error, index) => ({
            x: (upperErrors[index].x - lowerErrors[index].x) / parameterDelta,
            y: (upperErrors[index].y - lowerErrors[index].y) / parameterDelta
        }));
    });
    const influentialIndices = selectInfluentialVariables(
        activeIndices, sensitivities, variables, config
    );
    const influentialPerturbations = influentialIndices.map(index =>
        perturbations[activeIndices.indexOf(index)]
    );
    const corrections = solveInfluenceCorrections(
        base, influentialPerturbations, influentialIndices, variables, path, config
    );
    if (!corrections) return { candidates: [], activeIndices: influentialIndices };
    const candidateValues = [];
    for (const scale of config.influenceSeedScales) {
        const values = [...base.values];
        influentialIndices.forEach((variableIndex, influenceIndex) => {
            const variable = variables[variableIndex];
            values[variableIndex] = fromSearchCoordinate(
                variable,
                toSearchCoordinate(variable, base.values[variableIndex]) +
                corrections[influenceIndex] * scale
            );
        });
        if (candidateValues.some(existing => normalizedParameterDistance(existing, values, variables) < 1e-8)) {
            continue;
        }
        candidateValues.push(values);
    }
    const candidates = await evaluator.evaluateMany(path, config, candidateValues);
    progress.evaluations += candidates.reduce((sum, candidate) => sum + candidate.simulationCount, 0);
    return { candidates, activeIndices: influentialIndices };
}

async function runDifferentialEvolutionStage({
    name,
    stageName,
    seeds,
    activeIndices,
    stageConfig,
    state,
    path,
    launch,
    variables,
    config,
    random,
    progress,
    useInfluenceGuidance,
    evaluator,
    enableRobustness,
    signal
}) {
    if (activeIndices.length === 0) return seeds;
    throwIfAborted(signal);
    const populationSize = populationSizeForStage(activeIndices, stageConfig, config);
    const robustness = stageRobustnessPlan(stageName, stageConfig, config, enableRobustness);
    let evaluationConfig = robustness.initialConfig;
    const uniqueSeeds = [...new Map(
        seeds.map(candidate => [candidate.values.join('\u0000'), candidate])
    ).values()];
    const reevaluatedSeeds = await evaluator.evaluateMany(
        path,
        evaluationConfig,
        uniqueSeeds.map(candidate => candidate.values)
    );
    throwIfAborted(signal);
    progress.evaluations += reevaluatedSeeds.reduce(
        (sum, candidate) => sum + candidate.simulationCount,
        0
    );
    const rankedSeeds = reevaluatedSeeds
        .sort(compareSculptCandidates)
        .slice(0, populationSize);
    const eliteSeeds = rankedSeeds.slice(0, Math.min(config.eliteSeedCount, populationSize));
    const population = [...rankedSeeds];
    let mutationIndices = activeIndices;
    const initialValues = [];
    while (population.length < populationSize) {
        const seed = eliteSeeds[Math.floor(random() * eliteSeeds.length)] || seeds[0];
        const values = randomizeActiveValues(seed.values, activeIndices, variables, path, config, random);
        initialValues.push(values);
        population.push(null);
    }
    const initialCandidates = await evaluator.evaluateMany(path, evaluationConfig, initialValues);
    throwIfAborted(signal);
    population.splice(rankedSeeds.length, initialCandidates.length, ...initialCandidates);
    progress.evaluations += initialCandidates.reduce((sum, candidate) => sum + candidate.simulationCount, 0);
    if (
        useInfluenceGuidance &&
        config.influenceGuidanceEnabled !== false &&
        populationSize >= config.influenceMinimumPopulation
    ) {
        const maximumInformed = Math.max(
            1,
            Math.floor(Math.max(1, populationSize - eliteSeeds.length) * config.influencePopulationFraction)
        );
        const guidance = await createInfluenceGuidance({
            base: eliteSeeds[0],
            activeIndices,
            state,
            path,
            launch,
            variables,
            config: evaluationConfig,
            progress,
            evaluator
        });
        throwIfAborted(signal);
        mutationIndices = guidance.activeIndices.length > 0
            ? guidance.activeIndices
            : activeIndices;
        progress.influenceAnalyses.push({
            stage: name,
            waypointCount: path.length - 1,
            consideredVariables: activeIndices.map(index => variables[index].key),
            activeVariables: mutationIndices.map(index => variables[index].key)
        });
        const informed = guidance.candidates
            .sort(compareSculptCandidates)
            .slice(0, maximumInformed);
        for (const candidate of informed) {
            let worstIndex = 0;
            for (let index = 1; index < population.length; index++) {
                if (compareSculptCandidates(population[worstIndex], population[index]) < 0) {
                    worstIndex = index;
                }
            }
            if (compareSculptCandidates(candidate, population[worstIndex]) < 0) {
                population[worstIndex] = candidate;
            }
        }
    }

    let best = [...population].sort(compareSculptCandidates)[0];
    let stagnantGenerations = 0;
    for (let generation = 0; generation < stageConfig.generations; generation++) {
        throwIfAborted(signal);
        if (
            robustness.enabled &&
            generation === robustness.startGeneration &&
            evaluationConfig !== config
        ) {
            const robustPopulation = await evaluator.evaluateMany(
                path,
                config,
                population.map(candidate => candidate.values)
            );
            throwIfAborted(signal);
            progress.evaluations += robustPopulation.reduce(
                (sum, candidate) => sum + candidate.simulationCount,
                0
            );
            population.splice(0, population.length, ...robustPopulation);
            evaluationConfig = config;
            best = [...population].sort(compareSculptCandidates)[0];
            stagnantGenerations = 0;
        }
        const next = [...population];
        const trialValuesBatch = [];
        for (let targetIndex = 0; targetIndex < population.length; targetIndex++) {
            const [a, b, c] = distinctPopulationIndices(population.length, targetIndex, 3, random);
            const target = population[targetIndex];
            const trialValues = [...target.values];
            const forcedIndex = mutationIndices[Math.floor(random() * mutationIndices.length)];
            const influentialSet = new Set(mutationIndices);
            for (const index of activeIndices) {
                const crossoverRate = influentialSet.has(index)
                    ? config.crossoverRate
                    : config.influenceBackgroundCrossoverRate;
                if (index !== forcedIndex && random() > crossoverRate) continue;
                const variable = variables[index];
                trialValues[index] = fromSearchCoordinate(
                    variable,
                    toSearchCoordinate(variable, population[a].values[index]) +
                    config.differentialWeight * (
                        toSearchCoordinate(variable, population[b].values[index]) -
                        toSearchCoordinate(variable, population[c].values[index])
                    )
                );
            }
            trialValuesBatch.push(trialValues);
        }
        const trials = await evaluator.evaluateMany(path, evaluationConfig, trialValuesBatch);
        throwIfAborted(signal);
        for (let targetIndex = 0; targetIndex < population.length; targetIndex++) {
            const trial = trials[targetIndex];
            const target = population[targetIndex];
            progress.evaluations += trial.simulationCount;
            if (compareSculptCandidates(trial, target) <= 0) next[targetIndex] = trial;
        }
        population.splice(0, population.length, ...next);
        const nextBest = [...population].sort(compareSculptCandidates)[0];
        stagnantGenerations = meaningfullyImproved(best, nextBest, config)
            ? 0
            : stagnantGenerations + 1;
        best = nextBest;
        progress.generation += 1;
        progress.onProgress?.({
            stage: name,
            generation: progress.generation,
            total: progress.totalGenerations,
            evaluations: progress.evaluations,
            bestScore: best.score
        });
        const robustPhaseReached = !robustness.enabled || evaluationConfig === config;
        if (
            robustPhaseReached &&
            generation + 1 >= config.convergenceMinimumGenerations &&
            stagnantGenerations >= config.convergencePatience
        ) {
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    return population.sort(compareSculptCandidates);
}

function normalizedParameterDistance(left, right, variables) {
    let squared = 0;
    variables.forEach((variable, index) => {
        squared += ((
            toSearchCoordinate(variable, left[index]) -
            toSearchCoordinate(variable, right[index])
        ) / searchSpan(variable)) ** 2;
    });
    return Math.sqrt(squared / variables.length);
}

function selectDiverseCandidates(candidates, variables, config, requestedCount = config.candidateCount) {
    const sorted = [...candidates].sort(compareSculptCandidates);
    const best = sorted[0];
    const bestHardGoalTier = best?.constraintViolations?.length || 0;
    const bestRobustGoalTier = best?.robustGoalSuccessRate ?? 1;
    const bestWaypointTier = best?.missedWaypointCount;
    const eligible = sorted.filter(candidate =>
        (candidate.constraintViolations?.length || 0) === bestHardGoalTier &&
        (candidate.robustGoalSuccessRate ?? 1) === bestRobustGoalTier &&
        candidate.missedWaypointCount === bestWaypointTier
    );
    const selected = [];
    for (const candidate of eligible) {
        if (selected.every(existing =>
            normalizedParameterDistance(existing.values, candidate.values, variables) >= config.diversityThreshold
        )) {
            selected.push(candidate);
        }
        if (selected.length >= requestedCount) break;
    }
    if (selected.length >= requestedCount) return selected;
    for (const candidate of eligible) {
        if (selected.includes(candidate)) continue;
        selected.push(candidate);
        if (selected.length >= requestedCount) break;
    }
    return selected;
}

function allocateCurriculumGenerations(totalGenerations, prefixCount, config, prefixOffset = 0) {
    const allocations = Array(prefixCount).fill(0);
    if (prefixCount <= 1 || config.waypointCurriculumEnabled === false) {
        allocations[prefixCount - 1] = totalGenerations;
        return allocations;
    }
    const fullRouteGenerations = Math.max(
        1,
        Math.round(totalGenerations * config.waypointCurriculumFullRouteFraction)
    );
    allocations[prefixCount - 1] = Math.min(totalGenerations, fullRouteGenerations);
    let remaining = totalGenerations - allocations[prefixCount - 1];
    let prefixIndex = 0;
    while (remaining > 0) {
        allocations[(prefixIndex + prefixOffset) % (prefixCount - 1)] += 1;
        prefixIndex += 1;
        remaining -= 1;
    }
    return allocations;
}

function buildWaypointCurriculum(path, stageDefinitions, config) {
    const prefixCount = path.length - 1;
    const allocationsByStage = Object.fromEntries(stageDefinitions.map((definition, stageIndex) => [
        definition.name,
        allocateCurriculumGenerations(
            config.stages[definition.name].generations,
            prefixCount,
            config,
            stageIndex
        )
    ]));
    return Array.from({ length: prefixCount }, (_unused, prefixIndex) => ({
        waypointCount: prefixIndex + 1,
        path: path.slice(0, prefixIndex + 2),
        stageGenerations: Object.fromEntries(stageDefinitions.map(definition => [
            definition.name,
            allocationsByStage[definition.name][prefixIndex]
        ]))
    })).filter(phase => Object.values(phase.stageGenerations).some(generations => generations > 0));
}

function curriculumConfig(config, isCompleteRoute) {
    if (isCompleteRoute) return config;
    return {
        ...config,
        goals: {
            ...config.goals,
            requireTarget: false,
            requiredBonusIndices: []
        }
    };
}

function materializeCandidate(candidate, state, variables, planetIndices) {
    const adjusted = cloneSimulationState(state);
    applyValues(adjusted, variables, candidate.values);
    const parameterValues = Object.fromEntries(
        variables.map((variable, index) => [variable.key, candidate.values[index]])
    );
    const adjustments = planetIndices.flatMap(index => {
        const planet = state.planets[index];
        if (!planet || planet.orbit) return [];
        return [{
            index,
            position: { ...adjusted.planets[index].position },
            mass: adjusted.planets[index].mass
        }];
    });
    const launch = parameterValues['launch.angleDegrees'] === undefined
        ? null
        : {
            angleDegrees: parameterValues['launch.angleDegrees'],
            pullbackPower: parameterValues['launch.pullbackPower'],
            velocity: calculateLaunchVelocity(
                parameterValues['launch.angleDegrees'],
                parameterValues['launch.pullbackPower'],
                state.slingshot
            )
        };
    return { ...candidate, parameterValues, adjustments, launch };
}

export async function solveGravitySculpt({
    state,
    desiredPath,
    planetIndices = [],
    launch,
    variables: suppliedVariables,
    options = {},
    onProgress,
    evaluatorFactory,
    signal
}) {
    throwIfAborted(signal);
    const config = { ...DEFAULT_OPTIONS, ...options };
    const budgetMultiplier = clamp(
        Number(options.budgetMultiplier) || DEFAULT_OPTIONS.budgetMultiplier,
        DEFAULT_OPTIONS.budgetMultiplierRange.minimum,
        DEFAULT_OPTIONS.budgetMultiplierRange.maximum
    );
    config.budgetMultiplier = budgetMultiplier;
    config.maximumPopulation = Math.max(
        4,
        Math.round(config.maximumPopulation * budgetMultiplier)
    );
    config.stages = Object.fromEntries(
        Object.entries(DEFAULT_OPTIONS.stages).map(([name, defaults]) => [
            name,
            Object.fromEntries(
                Object.entries({ ...defaults, ...(options.stages?.[name] || {}) })
                    .map(([key, value]) => [key, Math.max(1, Math.round(value * budgetMultiplier))])
            )
        ])
    );
    const path = desiredPath.map(point => ({ ...point }));
    if (path.length < 2) throw new Error('Draw a longer desired trajectory before solving.');
    const planetVariables = createExistingPlanetVariables(state, planetIndices, config);
    const launchVariables = !launch && config.adjustLaunch !== false
        ? createLaunchVariables(state, path, config)
        : [];
    const variables = suppliedVariables || [...planetVariables, ...launchVariables];
    if (variables.length === 0) throw new Error('Select at least one stationary planet and an adjustable property.');
    const resolvedLaunch = launch || inferSculptLaunch(state, path);
    const evaluator = await evaluatorFactory?.({ state, launch: resolvedLaunch, variables, config }) ||
        createSculptEvaluator(state, resolvedLaunch, variables);
    const random = seededRandom(config.seed);
    try {
    throwIfAborted(signal);
    const [baseline] = await evaluator.evaluateMany(
        path, config, [variables.map(variable => variable.initial)]
    );
    throwIfAborted(signal);
    const stageDefinitions = OPTIMIZATION_STAGE_DEFINITIONS
        .map(definition => ({
            ...definition,
            activeIndices: variableIndices(variables, definition.accepts)
        }))
        .filter(definition => definition.activeIndices.length > 0);
    const progress = {
        generation: 0,
        totalGenerations: stageDefinitions.reduce(
            (total, definition) => total + config.stages[definition.name].generations,
            0
        ),
        evaluations: baseline.simulationCount,
        influenceAnalyses: [],
        onProgress
    };
    const curriculum = buildWaypointCurriculum(path, stageDefinitions, config);
    const prefixArchives = [];
    const stagePopulations = new Map();
    let archive = [baseline];
    let population = [baseline];
    for (const phase of curriculum) {
        throwIfAborted(signal);
        const isCompleteRoute = phase.path.length === path.length;
        const phaseConfig = curriculumConfig(config, isCompleteRoute);
        for (const { name, activeIndices, useInfluenceGuidance } of stageDefinitions) {
            const generations = phase.stageGenerations[name];
            if (generations <= 0) continue;
            const stageConfig = { ...config.stages[name], generations };
            const populationSize = populationSizeForStage(activeIndices, stageConfig, phaseConfig);
            const seeds = mergeStageSeeds(
                archive,
                stagePopulations.get(name) || [],
                populationSize
            );
            population = await runDifferentialEvolutionStage({
                name: `${name} · waypoint ${phase.waypointCount}/${path.length - 1}`,
                stageName: name,
                seeds,
                activeIndices,
                stageConfig,
                state,
                path: phase.path,
                launch: resolvedLaunch,
                variables,
                config: phaseConfig,
                random,
                progress,
                useInfluenceGuidance,
                evaluator,
                enableRobustness: isCompleteRoute,
                signal
            });
            stagePopulations.set(name, population);
            archive = selectDiverseCandidates(
                population,
                variables,
                phaseConfig,
                config.waypointCurriculumArchiveSize
            );
        }
        prefixArchives.push({
            waypointCount: phase.waypointCount,
            candidateCount: archive.length,
            bestMissedWaypointCount: archive[0]?.missedWaypointCount ?? phase.waypointCount
        });
    }
    const selectedCandidates = selectDiverseCandidates(
        [...archive, ...population], variables, config
    );
    const hydratedCandidates = await evaluator.evaluateMany(
        path,
        config,
        selectedCandidates.map(candidate => candidate.values),
        { captureTrajectories: evaluator.backend === 'wasm' }
    );
    throwIfAborted(signal);
    progress.evaluations += hydratedCandidates.reduce(
        (sum, candidate) => sum + candidate.simulationCount,
        0
    );
    const candidates = hydratedCandidates.map(candidate =>
        materializeCandidate(candidate, state, variables, planetIndices)
    );
    const best = candidates[0];
    return {
        ...best,
        baselineScore: baseline.score,
        path,
        variables,
        prefixArchives,
        influenceAnalyses: progress.influenceAnalyses,
        evaluationBackend: evaluator.backend,
        evaluationWorkers: evaluator.workerCount || 1,
        seed: config.seed,
        evaluations: progress.evaluations,
        candidates
    };
    } finally {
        evaluator.dispose();
    }
}

export { DEFAULT_OPTIONS as GRAVITY_SCULPT_DEFAULTS };
import { PenguinState } from '../runtime/penguinState.js';
