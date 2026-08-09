import { SIMULATION_CONFIG } from './config/gameConfig.js';
import { EDITOR_CONFIG } from './config/editorConfig.js';
import {
    calculateLaunchVelocity,
    SimulationEventType,
    stepSimulationMutable
} from './simulationEngine.js';
import { cloneSimulationState } from './simulationState.js';

const DEFAULT_OPTIONS = EDITOR_CONFIG.gravitySculpt;

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
    const variables = [];
    for (const index of planetIndices) {
        const planet = state.planets[index];
        if (!planet || planet.orbit) continue;
        const movement = config.adjustPosition !== false;
        const mass = config.adjustMass !== false;
        if (movement) {
            variables.push({
                key: `planet.${index}.x`, initial: planet.position.x,
                min: clamp(planet.position.x - config.positionRange, state.bounds.stage.x, state.bounds.stage.x + state.bounds.stage.width),
                max: clamp(planet.position.x + config.positionRange, state.bounds.stage.x, state.bounds.stage.x + state.bounds.stage.width),
                apply: (candidate, value) => { candidate.planets[index].position.x = value; }
            });
            variables.push({
                key: `planet.${index}.y`, initial: planet.position.y,
                min: clamp(planet.position.y - config.positionRange, state.bounds.stage.y, state.bounds.stage.y + state.bounds.stage.height),
                max: clamp(planet.position.y + config.positionRange, state.bounds.stage.y, state.bounds.stage.y + state.bounds.stage.height),
                apply: (candidate, value) => { candidate.planets[index].position.y = value; }
            });
        }
        if (mass) {
            variables.push({
                key: `planet.${index}.mass`, initial: planet.mass,
                min: config.minimumMass,
                max: Math.max(
                    config.minimumMass * config.maximumMassMultiplier,
                    planet.mass * config.maximumMassMultiplier
                ),
                apply: (candidate, value) => { candidate.planets[index].mass = value; }
            });
        }
    }
    return variables;
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
            initial: inferred.angleDegrees,
            min: inferred.angleDegrees - config.launchAngleRange,
            max: inferred.angleDegrees + config.launchAngleRange,
            apply: applyLaunch
        },
        {
            key: 'launch.pullbackPower',
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
        const span = Math.max(1, variable.max - variable.min);
        const normalized = (values[index] - variable.initial) / span;
        let penalty = config.movementPenalty;
        if (variable.key.endsWith('.mass')) penalty = config.massPenalty;
        else if (variable.key.startsWith('launch.')) penalty = config.launchPenalty;
        score += normalized * normalized * penalty;
    });
    if (terminal && terminal !== 'hitTarget') score += config.terminalPenalty;
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
    const violations = [];
    if (goals.requireTarget && state.penguin.state !== 'hitTarget') violations.push('target');
    if (goals.avoidPlanetCollisions && eventTypes.has(SimulationEventType.PLANET_COLLISION)) {
        violations.push('planet_collision');
    }
    if (goals.stayInBounds && eventTypes.has(SimulationEventType.OUT_OF_BOUNDS)) {
        violations.push('out_of_bounds');
    }
    for (const index of goals.requiredBonusIndices || []) {
        if (!state.bonuses[index]?.collected) violations.push(`bonus_${index}`);
    }
    if (Number.isFinite(goals.maxFlightSeconds) && elapsedSeconds > goals.maxFlightSeconds) {
        violations.push('time_limit');
    }
    return violations;
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
    state.penguin.state = 'soaring';
    state.penguin.crashFramesRemaining = 0;
    state.counters.tries += 1;
    // Parameter descriptors own how values affect a candidate. Existing
    // planets use this today; launch and generated-planet descriptors can use
    // the same seam without coupling the optimizer to their UI.
    applyValues(state, variables, values);
    if (velocityOverride) state.penguin.velocity = { ...velocityOverride };
    const trajectory = [{ ...state.penguin.position }];
    const eventTypes = new Set();
    const steps = Math.ceil(config.previewSeconds / SIMULATION_CONFIG.aimAssist.timeStep);
    let elapsedSeconds = 0;
    for (let step = 1; step <= steps; step++) {
        const result = stepSimulationMutable(
            state,
            SIMULATION_CONFIG.aimAssist.timeStep,
            { emitMovementEvents: false }
        );
        result.events.forEach(event => eventTypes.add(event.type));
        elapsedSeconds += SIMULATION_CONFIG.aimAssist.timeStep;
        if (step % config.sampleEverySteps === 0 || state.penguin.state !== 'soaring') {
            trajectory.push({ ...state.penguin.position });
        }
        if (state.penguin.state !== 'soaring') break;
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
    return {
        ...metrics,
        score: metrics.score + constraintViolations.length * config.hardConstraintPenalty,
        trajectory,
        terminal: state.penguin.state,
        values: [...values],
        constraintViolations,
        elapsedSeconds
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
    return {
        ...central,
        score:
            central.score * config.robustCentralWeight +
            averageScore * config.robustAverageWeight +
            worstScore * config.robustWorstWeight,
        robustCheckpointCoverage,
        robustGoalSuccessRate,
        simulationCount: neighbors.length + 1
    };
}

function variableIndices(variables, predicate) {
    const indices = [];
    variables.forEach((variable, index) => {
        if (predicate(variable)) indices.push(index);
    });
    return indices;
}

function randomizeActiveValues(seed, activeIndices, variables, path, config, random) {
    const values = [...seed];
    for (const index of activeIndices) {
        const variable = variables[index];
        values[index] = variable.min + random() * (variable.max - variable.min);
    }

    // Planet positions seeded beside checkpoints are much more likely to bend
    // the shot usefully than uniformly random positions elsewhere on stage.
    const positionByPlanet = new Map();
    for (const index of activeIndices) {
        const match = /^planet\.(\d+)\.([xy])$/.exec(variables[index].key);
        if (!match) continue;
        const entry = positionByPlanet.get(match[1]) || {};
        entry[match[2]] = index;
        positionByPlanet.set(match[1], entry);
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

async function runDifferentialEvolutionStage({
    name,
    seeds,
    activeIndices,
    stageConfig,
    state,
    path,
    launch,
    variables,
    config,
    random,
    progress
}) {
    if (activeIndices.length === 0) return seeds;
    const populationSize = Math.min(
        config.maximumPopulation,
        Math.max(stageConfig.population, activeIndices.length * 4, 4)
    );
    const eliteSeeds = [...seeds]
        .sort((left, right) => left.score - right.score)
        .slice(0, Math.min(config.eliteSeedCount, populationSize));
    const population = [...eliteSeeds];
    while (population.length < populationSize) {
        const seed = eliteSeeds[Math.floor(random() * eliteSeeds.length)] || seeds[0];
        const values = randomizeActiveValues(seed.values, activeIndices, variables, path, config, random);
        const candidate = evaluateSculptCandidate(state, path, launch, variables, values, config);
        population.push(candidate);
        progress.evaluations += candidate.simulationCount;
    }

    for (let generation = 0; generation < stageConfig.generations; generation++) {
        const next = [...population];
        for (let targetIndex = 0; targetIndex < population.length; targetIndex++) {
            const [a, b, c] = distinctPopulationIndices(population.length, targetIndex, 3, random);
            const target = population[targetIndex];
            const trialValues = [...target.values];
            const forcedIndex = activeIndices[Math.floor(random() * activeIndices.length)];
            for (const index of activeIndices) {
                if (index !== forcedIndex && random() > config.crossoverRate) continue;
                const variable = variables[index];
                trialValues[index] = clamp(
                    population[a].values[index] + config.differentialWeight * (
                        population[b].values[index] - population[c].values[index]
                    ),
                    variable.min,
                    variable.max
                );
            }
            const trial = evaluateSculptCandidate(state, path, launch, variables, trialValues, config);
            progress.evaluations += trial.simulationCount;
            if (trial.score <= target.score) next[targetIndex] = trial;
        }
        population.splice(0, population.length, ...next);
        progress.generation += 1;
        progress.onProgress?.({
            stage: name,
            generation: progress.generation,
            total: progress.totalGenerations,
            evaluations: progress.evaluations,
            bestScore: Math.min(...population.map(candidate => candidate.score))
        });
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    return population.sort((left, right) => left.score - right.score);
}

function normalizedParameterDistance(left, right, variables) {
    let squared = 0;
    variables.forEach((variable, index) => {
        const span = Math.max(1, variable.max - variable.min);
        squared += ((left[index] - right[index]) / span) ** 2;
    });
    return Math.sqrt(squared / variables.length);
}

function selectDiverseCandidates(candidates, variables, config) {
    const sorted = [...candidates].sort((left, right) => left.score - right.score);
    const selected = [];
    for (const candidate of sorted) {
        if (selected.every(existing =>
            normalizedParameterDistance(existing.values, candidate.values, variables) >= config.diversityThreshold
        )) {
            selected.push(candidate);
        }
        if (selected.length >= config.candidateCount) break;
    }
    if (selected.length >= config.candidateCount) return selected;
    for (const candidate of sorted) {
        if (selected.includes(candidate)) continue;
        selected.push(candidate);
        if (selected.length >= config.candidateCount) break;
    }
    return selected;
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
    onProgress
}) {
    const config = { ...DEFAULT_OPTIONS, ...options };
    config.stages = Object.fromEntries(
        Object.entries(DEFAULT_OPTIONS.stages).map(([name, defaults]) => [
            name,
            { ...defaults, ...(options.stages?.[name] || {}) }
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
    const random = seededRandom(config.seed);
    const baseline = evaluateSculptCandidate(
        state, path, resolvedLaunch, variables, variables.map(variable => variable.initial), config
    );
    const launchIndices = variableIndices(variables, variable => variable.key.startsWith('launch.'));
    const massIndices = variableIndices(variables, variable => variable.key.endsWith('.mass'));
    const positionIndices = variableIndices(variables, variable => /^planet\.\d+\.[xy]$/.test(variable.key));
    const allIndices = variables.map((_variable, index) => index);
    const stageDefinitions = [
        ['launch', launchIndices],
        ['mass', massIndices],
        ['position', positionIndices],
        ['joint', allIndices]
    ].filter(([, indices]) => indices.length > 0);
    const progress = {
        generation: 0,
        totalGenerations: stageDefinitions.reduce(
            (total, [name]) => total + config.stages[name].generations,
            0
        ),
        evaluations: baseline.simulationCount,
        onProgress
    };
    let population = [baseline];
    for (const [name, activeIndices] of stageDefinitions) {
        population = await runDifferentialEvolutionStage({
            name,
            seeds: population,
            activeIndices,
            stageConfig: config.stages[name],
            state,
            path,
            launch: resolvedLaunch,
            variables,
            config,
            random,
            progress
        });
    }
    const candidates = selectDiverseCandidates(
        [baseline, ...population], variables, config
    ).map(candidate => materializeCandidate(candidate, state, variables, planetIndices));
    const best = candidates[0];
    return {
        ...best,
        baselineScore: baseline.score,
        path,
        variables,
        evaluations: progress.evaluations,
        candidates
    };
}

export { DEFAULT_OPTIONS as GRAVITY_SCULPT_DEFAULTS };
