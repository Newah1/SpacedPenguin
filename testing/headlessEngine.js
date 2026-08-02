// Deterministic Node runner over the same simulation core used by the browser.

import { mockLogger } from './nodeShims.js';
import {
    calculateLaunchVelocity,
    launchSimulationPenguinMutable,
    SimulationEventType,
    stepSimulationMutable
} from '../js/simulationEngine.js';
import { LevelObjectType, normalizeLevelObjectType } from '../js/levelSchema.js';
import {
    cloneSimulationState,
    createSimulationStateFromLevel
} from '../js/simulationState.js';
import { distance, pointInRect } from '../js/simulationGeometry.js';
import { CompiledWorldTimeline } from '../js/compiledWorldTimeline.js';
import {
    LEVEL_CATALOG_CONFIG,
    LEVEL_DEFAULTS,
    PHYSICS_CONFIG,
    SIMULATION_CONFIG,
    WORLD_CONFIG
} from '../js/config/gameConfig.js';
import { TRAJECTORY_CONFIG } from './trajectoryConfig.js';

const NodeUtils = {
    distance,
    inside: pointInRect,
    clamp: (value, min, max) => Math.min(Math.max(value, min), max),
    validateLevel: (level, maxLevel = LEVEL_CATALOG_CONFIG.maxGeneratedLevel) => {
        const parsed = Number.parseInt(level, 10);
        return Number.isInteger(parsed) && parsed >= LEVEL_CATALOG_CONFIG.firstLevel && parsed <= maxLevel
            ? parsed
            : null;
    }
};

export const DEFAULT_MAX_SIMULATION_TIME = TRAJECTORY_CONFIG.simulation.maximumTimeSeconds;

class HeadlessPenguin {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.velocity = { x: 0, y: 0 };
        this.state = 'idle';
        this.radius = LEVEL_DEFAULTS.penguin.radius;
    }

    launch(angle, power, slingshot = {}) {
        this.velocity = calculateLaunchVelocity(angle, power, slingshot);
        this.state = 'soaring';
    }
}

class HeadlessPhysics {
    constructor() {
        this.gravitationalConstant = PHYSICS_CONFIG.gravitationalConstant;
        this.planets = [];
        this.bonuses = [];
    }

    synchronize(state) {
        this.gravitationalConstant = state.rules.gravitationalConstant;
        this.planets = state.planets.map(planet => ({
            sprite: {
                ...planet,
                x: planet.position.x,
                y: planet.position.y,
                orbitTime: planet.orbit?.angle ?? 0,
                initialOrbitTime: planet.orbit?.angle ?? 0,
                orbit: planet.orbit
            },
            mass: planet.mass,
            collisionRadius: planet.collisionRadius,
            gravitationalReach: planet.gravitationalReach
        }));
        this.bonuses = state.bonuses.map(bonus => ({ sprite: bonus, collected: bonus.collected }));
    }
}

export class HeadlessGameEngine {
    constructor(options = {}) {
        this.physics = new HeadlessPhysics();
        this.penguin = null;
        this.target = null;
        this.level = null;
        this.slingshot = null;
        this.state = null;
        this.initialState = null;
        this.maxSimulationTime = DEFAULT_MAX_SIMULATION_TIME;
        this.timeStep = 1 / SIMULATION_CONFIG.legacyPhysicsFps;
        this.worldTimeline = null;
        this.logger = mockLogger;
        this.requireAllBonuses = options.requireAllBonuses ?? false;
    }

    getStartPosition() {
        return this.initialState
            ? { ...this.initialState.slingshot.position }
            : { ...WORLD_CONFIG.defaultStartPosition };
    }

    loadLevel(levelData, options = {}) {
        this.requireAllBonuses = options.requireAllBonuses ?? this.requireAllBonuses;
        this.level = this.requireAllBonuses
            ? requireEveryBonus(levelData)
            : levelData;
        this.initialState = createSimulationStateFromLevel(this.level, { source: 'headless level' });
        this.state = cloneSimulationState(this.initialState);
        this.worldTimeline = null;
        this.synchronizeFacade();
        return true;
    }

    ensureWorldTimeline(maxSteps) {
        if (!this.worldTimeline ||
            this.worldTimeline.timeStep !== this.timeStep ||
            this.worldTimeline.maxSteps < maxSteps) {
            this.worldTimeline = new CompiledWorldTimeline(this.initialState, this.timeStep, maxSteps);
        }
        return this.worldTimeline;
    }

    synchronizeFacade() {
        if (!this.state) return;
        this.physics.synchronize(this.state);
        this.penguin = new HeadlessPenguin(
            this.state.penguin.position.x,
            this.state.penguin.position.y
        );
        this.penguin.velocity = { ...this.state.penguin.velocity };
        this.penguin.state = this.state.penguin.state;
        this.target = {
            x: this.state.target.position.x,
            y: this.state.target.position.y,
            width: this.state.target.width,
            height: this.state.target.height
        };
        this.slingshot = { ...this.state.slingshot };
    }

    simulateTrajectory(angle, power, maxTime = null) {
        if (!this.initialState) throw new Error('Level not loaded properly');
        // Every candidate is an independent experiment. Browser retries retain
        // attempt counters, but a search candidate must not consume the rule
        // budget of candidates evaluated later in the grid.
        this.state = cloneSimulationState(this.initialState);
        launchSimulationPenguinMutable(this.state, angle, power);

        const simulationTime = maxTime ?? this.maxSimulationTime;
        const maxSteps = Math.max(0, Math.floor(simulationTime / this.timeStep));
        const worldTimeline = this.ensureWorldTimeline(maxSteps);
        const result = {
            success: false,
            reason: 'timeout',
            steps: 0,
            finalPosition: { ...this.state.penguin.position },
            trajectory: [],
            distance: 0,
            collectedBonuses: [],
            totalBonuses: this.state.bonuses.length,
            requiredBonuses: this.state.rules.requiredBonuses,
            bonusScore: 0,
            events: []
        };

        for (let step = 0; step < maxSteps; step++) {
            if (step % TRAJECTORY_CONFIG.simulation.captureStrideSteps === 0) {
                result.trajectory.push({
                    ...this.state.penguin.position,
                    velocity: { ...this.state.penguin.velocity },
                    time: step * this.timeStep
                });
            }

            worldTimeline.applyFrame(this.state, step);
            const stepped = stepSimulationMutable(this.state, this.timeStep, {
                advanceWorld: false,
                emitMovementEvents: false
            });
            result.steps = step + 1;
            result.events.push(...stepped.events);
            result.finalPosition = { ...this.state.penguin.position };
            result.distance = this.state.counters.distance;
            for (const event of stepped.events) {
                if (event.type === SimulationEventType.BONUS_COLLECTED) {
                    result.collectedBonuses.push(event.bonusId);
                    result.bonusScore += event.value;
                } else if (event.type === SimulationEventType.TARGET_HIT) {
                    result.success = true;
                    result.reason = 'target_hit';
                    result.finalPosition = { ...event.position };
                    this.synchronizeFacade();
                    return result;
                } else if (event.type === SimulationEventType.TARGET_BLOCKED) {
                    result.reason = 'target_blocked';
                    this.synchronizeFacade();
                    return result;
                } else if (event.type === SimulationEventType.PLANET_COLLISION) {
                    result.reason = 'planet_collision';
                    this.synchronizeFacade();
                    return result;
                } else if (event.type === SimulationEventType.OUT_OF_BOUNDS) {
                    result.reason = 'out_of_bounds';
                    this.synchronizeFacade();
                    return result;
                } else if (event.type === SimulationEventType.RULE_FAILURE) {
                    result.reason = `rule_failure:${event.rule}`;
                    this.synchronizeFacade();
                    return result;
                }
            }
        }

        this.synchronizeFacade();
        return result;
    }

    findWorkingTrajectories(
        angleRange = TRAJECTORY_CONFIG.sweep.angleRange,
        powerRange = TRAJECTORY_CONFIG.sweep.powerRange,
        samples = TRAJECTORY_CONFIG.sweep.samples,
        maxTime = null
    ) {
        const candidates = buildTrajectoryCandidates(angleRange, powerRange, samples);
        const progressInterval = Math.max(
            TRAJECTORY_CONFIG.sweep.minimumProgressInterval,
            Math.ceil(candidates.length / TRAJECTORY_CONFIG.sweep.progressBuckets)
        );
        this.logger.info(`Testing ${candidates.length} trajectory combinations...`);
        const results = this.simulateCandidates(candidates, maxTime, (tested, successful) => {
            if (tested % progressInterval === 0) {
                this.logger.info(`Tested ${tested} trajectories, found ${successful} successful.`);
            }
        });
        this.logger.info(`Testing complete: ${results.length}/${candidates.length} successful trajectories`);
        return results.map(withoutCandidateIndex);
    }

    simulateCandidates(candidates, maxTime = null, onProgress = null) {
        const results = [];
        for (let index = 0; index < candidates.length; index++) {
            const candidate = candidates[index];
            const result = this.simulateTrajectory(candidate.angle, candidate.power, maxTime);
            if (result.success) results.push({ ...candidate, ...result });
            onProgress?.(index + 1, results.length);
        }
        return results;
    }

    async findWorkingTrajectoriesAsync(
        angleRange = TRAJECTORY_CONFIG.sweep.angleRange,
        powerRange = TRAJECTORY_CONFIG.sweep.powerRange,
        samples = TRAJECTORY_CONFIG.sweep.samples,
        maxTime = null,
        options = {}
    ) {
        const candidates = buildTrajectoryCandidates(angleRange, powerRange, samples);
        const { resolveTrajectoryWorkerCount, runTrajectoryWorkers } = await import('./parallelTrajectoryRunner.js');
        const workerCount = resolveTrajectoryWorkerCount(options.workers, candidates.length);
        if (workerCount === 1) {
            return this.findWorkingTrajectories(angleRange, powerRange, samples, maxTime);
        }

        this.logger.info(`Testing ${candidates.length} trajectory combinations across ${workerCount} workers...`);
        const results = await runTrajectoryWorkers({
            level: this.level,
            candidates,
            maxTime: maxTime ?? this.maxSimulationTime,
            timeStep: this.timeStep,
            workerCount
        });
        this.logger.info(`Testing complete: ${results.length}/${candidates.length} successful trajectories`);
        return results;
    }
}

export function requireEveryBonus(levelData) {
    const bonusCount = (levelData.objects || [])
        .filter(object => normalizeLevelObjectType(object.type) === LevelObjectType.BONUS)
        .length;
    return {
        ...levelData,
        rules: {
            ...(levelData.rules || {}),
            requiredBonuses: bonusCount
        }
    };
}

export function buildTrajectoryCandidates(angleRange, powerRange, samples) {
    const normalizedSamples = Math.max(1, Math.floor(samples));
    const gridSize = Math.ceil(Math.sqrt(normalizedSamples));
    const candidates = [];
    for (let angleIndex = 0; angleIndex < gridSize && candidates.length < normalizedSamples; angleIndex++) {
        const angleFraction = gridSize === 1 ? 0.5 : angleIndex / (gridSize - 1);
        const angle = angleRange[0] + (angleRange[1] - angleRange[0]) * angleFraction;
        for (let powerIndex = 0; powerIndex < gridSize && candidates.length < normalizedSamples; powerIndex++) {
            const powerFraction = gridSize === 1 ? 0.5 : powerIndex / (gridSize - 1);
            candidates.push({
                candidateIndex: candidates.length,
                angle,
                power: powerRange[0] + (powerRange[1] - powerRange[0]) * powerFraction
            });
        }
    }
    return candidates;
}

function withoutCandidateIndex(result) {
    const { candidateIndex, ...publicResult } = result;
    return publicResult;
}

export { HeadlessPhysics, HeadlessPenguin, NodeUtils };
