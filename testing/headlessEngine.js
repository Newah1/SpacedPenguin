// Deterministic Node runner over the same simulation core used by the browser.

import { mockLogger } from './nodeShims.js';
import {
    calculateLaunchVelocity,
    launchSimulationPenguin,
    SimulationEventType,
    stepSimulation
} from '../js/simulationEngine.js';
import {
    cloneSimulationState,
    createSimulationStateFromLevel
} from '../js/simulationState.js';
import { distance, pointInRect } from '../js/simulationGeometry.js';

const NodeUtils = {
    distance,
    inside: pointInRect,
    clamp: (value, min, max) => Math.min(Math.max(value, min), max),
    validateLevel: (level, maxLevel = 25) => {
        const parsed = Number.parseInt(level, 10);
        return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxLevel ? parsed : null;
    }
};

class HeadlessPenguin {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.velocity = { x: 0, y: 0 };
        this.state = 'idle';
        this.radius = 16;
    }

    launch(angle, power, slingshot = {}) {
        this.velocity = calculateLaunchVelocity(angle, power, slingshot);
        this.state = 'soaring';
    }
}

class HeadlessPhysics {
    constructor() {
        this.gravitationalConstant = 3;
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
    constructor() {
        this.physics = new HeadlessPhysics();
        this.penguin = null;
        this.target = null;
        this.level = null;
        this.slingshot = null;
        this.state = null;
        this.initialState = null;
        this.maxSimulationTime = 30;
        this.timeStep = 1 / 60;
        this.logger = mockLogger;
    }

    getStartPosition() {
        return this.initialState
            ? { ...this.initialState.slingshot.position }
            : { x: 100, y: 300 };
    }

    loadLevel(levelData) {
        this.level = levelData;
        this.initialState = createSimulationStateFromLevel(levelData, { source: 'headless level' });
        this.state = cloneSimulationState(this.initialState);
        this.synchronizeFacade();
        return true;
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
        this.state = launchSimulationPenguin(this.state, angle, power);

        const simulationTime = maxTime ?? this.maxSimulationTime;
        const maxSteps = Math.max(0, Math.floor(simulationTime / this.timeStep));
        const result = {
            success: false,
            reason: 'timeout',
            steps: 0,
            finalPosition: { ...this.state.penguin.position },
            trajectory: [],
            distance: 0,
            collectedBonuses: [],
            events: []
        };

        for (let step = 0; step < maxSteps; step++) {
            if (step % 10 === 0) {
                result.trajectory.push({
                    ...this.state.penguin.position,
                    velocity: { ...this.state.penguin.velocity },
                    time: step * this.timeStep
                });
            }

            const stepped = stepSimulation(this.state, this.timeStep);
            this.state = stepped.state;
            result.steps = step + 1;
            result.events.push(...stepped.events);
            result.finalPosition = { ...this.state.penguin.position };
            result.distance = this.state.counters.distance;
            for (const event of stepped.events) {
                if (event.type === SimulationEventType.BONUS_COLLECTED) {
                    result.collectedBonuses.push(event.bonusId);
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

    findWorkingTrajectories(angleRange = [0, 360], powerRange = [10, 100], samples = 100, maxTime = null) {
        const results = [];
        const normalizedSamples = Math.max(1, Math.floor(samples));
        const gridSize = Math.ceil(Math.sqrt(normalizedSamples));
        this.logger.info(`Testing ${normalizedSamples} trajectory combinations...`);
        let tested = 0;

        for (let angleIndex = 0; angleIndex < gridSize && tested < normalizedSamples; angleIndex++) {
            const angleFraction = gridSize === 1 ? 0.5 : angleIndex / (gridSize - 1);
            const angle = angleRange[0] + (angleRange[1] - angleRange[0]) * angleFraction;
            for (let powerIndex = 0; powerIndex < gridSize && tested < normalizedSamples; powerIndex++) {
                const powerFraction = gridSize === 1 ? 0.5 : powerIndex / (gridSize - 1);
                const power = powerRange[0] + (powerRange[1] - powerRange[0]) * powerFraction;
                const result = this.simulateTrajectory(angle, power, maxTime);
                tested++;
                if (result.success) results.push({ angle, power, ...result });
                if (tested % 10 === 0) {
                    this.logger.info(`Tested ${tested} trajectories, found ${results.length} successful. ${angle} ${power}`);
                }
            }
        }

        this.logger.info(`Testing complete: ${results.length}/${tested} successful trajectories`);
        return results;
    }
}

export { HeadlessPhysics, HeadlessPenguin, NodeUtils };
