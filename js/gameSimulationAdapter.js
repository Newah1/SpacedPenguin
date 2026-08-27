import { cloneOrbitState } from './orbitSimulation.js';
import {
    FIXED_TICK_SECONDS,
    stepSimulationMutable,
    stepSimulationTickMutable,
    SimulationEventType
} from './simulationEngine.js';
import { effectiveGravitationalReach } from './globalConstants.js';
import { LevelOrbitType } from './levelSchema.js';
import { LEVEL_DEFAULTS } from './config/gameConfig.js';
import { AudioCue, getAudioCue } from './config/audioConfig.js';

function orbitFromRuntime(system) {
    if (!system) return null;
    const meaningful = system.orbitTargetId || system.orbitCenter ||
        system.orbitRadius !== 0 || system.orbitSpeed !== 0 ||
        system.orbitType === LevelOrbitType.GRAVITY ||
        system.orbitType === LevelOrbitType.DIRECTOR_GRAVITY;
    if (!meaningful) return null;
    return cloneOrbitState({
        type: system.orbitType,
        center: system.orbitCenter,
        targetId: system.orbitTargetId,
        radius: system.orbitRadius,
        speed: system.orbitSpeed,
        angle: system.orbitAngle,
        params: system.orbitParams,
        velocity: system.velocity,
        gravityStrength: system.gravityStrength,
        maxGravityAccel: system.maxGravityAccel,
        frameAccumulator: system.frameAccumulator
    });
}

function applyOrbitToRuntime(system, orbit) {
    if (!system || !orbit) return;
    system.orbitAngle = orbit.angle;
    system.velocity ||= { x: 0, y: 0 };
    system.velocity.x = orbit.velocity.x;
    system.velocity.y = orbit.velocity.y;
    system.frameAccumulator = orbit.frameAccumulator ?? system.frameAccumulator;
}

function ensureStableRuntimeIds(objects, prefix) {
    const usedIds = new Set(objects.map(object => object.id).filter(Boolean));
    let nextId = 1;
    return objects.map(object => {
        if (object.id) return object.id;
        while (usedIds.has(`__${prefix}_${nextId}`)) nextId++;
        const id = `__${prefix}_${nextId++}`;
        object.id = id;
        usedIds.add(id);
        return id;
    });
}

function runtimeObjectsById(objects) {
    return new Map(objects.map(object => [object.id, object]));
}

function runtimeObjectForSimulationIndex(game, collectionName, index) {
    const stateObject = game._runtimeSimulationState?.[collectionName]?.[index];
    if (!stateObject) return null;
    return runtimeObjectsById(game[collectionName] || []).get(stateObject.id) || null;
}

export function captureGameSimulationState(game) {
    const planetIds = ensureStableRuntimeIds(game.planets, 'planet');
    const bonusIds = ensureStableRuntimeIds(game.bonuses, 'bonus');
    const portalIds = ensureStableRuntimeIds(game.portals || [], 'portal');
    const targetId = ensureStableRuntimeIds([game.target], 'target')[0];
    return {
        time: game.simulationTime || 0,
        runTick: game.runTick || 0,
        penguin: {
            position: { x: game.penguin.x, y: game.penguin.y },
            velocity: { x: game.penguin.vx, y: game.penguin.vy },
            radius: game.penguin.radius,
            state: game.penguin.state,
            crashFramesRemaining: game.penguin.crashedFrameCount || 0
        },
        planets: game.planets.map((planet, index) => ({
            id: planetIds[index],
            position: { ...planet.position },
            radius: planet.radius,
            collisionRadius: planet.collisionRadius,
            mass: planet.mass,
            gravitationalReach: effectiveGravitationalReach(planet.gravitationalReach),
            orbit: orbitFromRuntime(planet.orbitSystem)
        })),
        bonuses: game.bonuses.map((bonus, index) => ({
            id: bonusIds[index],
            position: { ...bonus.position },
            width: bonus.width,
            value: bonus.value,
            collected: bonus.state === 'Hit',
            collectionRadius: LEVEL_DEFAULTS.bonus.collectionPadding + bonus.width / 2,
            orbit: orbitFromRuntime(bonus.orbitSystem)
        })),
        portals: (game.portals || []).map((portal, index) => ({
            id: portalIds[index],
            position: { ...portal.position },
            width: portal.width,
            height: portal.height,
            rotation: portal.rotation,
            color: portal.color,
            pairedPortalId: portal.pairedPortalId,
            playSound: portal.playSound
        })),
        target: {
            id: targetId,
            position: { ...game.target.position },
            width: game.target.width,
            height: game.target.height,
            collisionRadius: game.target.collisionRadius ?? game.target.width / 2,
            orbit: orbitFromRuntime(game.target.orbitSystem)
        },
        slingshot: {
            position: { ...(game.slingshot.launchModel === 'director'
                ? game.slingshot.resetPosition
                : game.slingshot.anchor) },
            anchorPosition: { ...game.slingshot.anchor },
            launchModel: game.slingshot.launchModel ?? 'modern',
            sourceFrameRate: game.slingshot.sourceFrameRate ?? null,
            coordinateScale: game.slingshot.coordinateScale ?? 1,
            velocityMultiplier: game.slingshot.velocityMultiplier,
            maxPullback: game.slingshot.maxPullback,
            minPullback: game.slingshot.minPullback
        },
        bounds: {
            stage: { ...game.stageRect },
            flight: { ...game.flightRect }
        },
        rules: {
            maxTries: game.levelRules?.maxTries ?? null,
            requiredBonuses: game.levelRules?.requiredBonuses ?? null,
            allowedMisses: game.levelRules?.allowedMisses ?? null,
            scoreMultiplier: game.levelRules?.scoreMultiplier ?? LEVEL_DEFAULTS.rules.scoreMultiplier,
            gravitationalConstant: game.physics.gravitationalConstant
        },
        counters: {
            tries: game.tries,
            planetCollisions: game.planetCollisions,
            currentAttemptScore: game.currentAttemptScore,
            distance: game.distance
        }
    };
}

export function applyGameSimulationState(game, state) {
    game.simulationTime = state.time;
    game.runTick = state.runTick ?? game.runTick ?? 0;
    game.penguin.x = state.penguin.position.x;
    game.penguin.y = state.penguin.position.y;
    game.penguin.vx = state.penguin.velocity.x;
    game.penguin.vy = state.penguin.velocity.y;
    game.penguin.state = state.penguin.state;
    game.penguin.crashedFrameCount = state.penguin.crashFramesRemaining;
    game.distance = state.counters.distance;
    game.currentAttemptScore = state.counters.currentAttemptScore;
    game.planetCollisions = state.counters.planetCollisions;

    const planetsById = runtimeObjectsById(game.planets);
    const bonusesById = runtimeObjectsById(game.bonuses);
    state.planets.forEach(planetState => {
        const planet = planetsById.get(planetState.id);
        if (!planet) return;
        planet.position.x = planetState.position.x;
        planet.position.y = planetState.position.y;
        applyOrbitToRuntime(planet.orbitSystem, planetState.orbit);
    });
    state.bonuses.forEach(bonusState => {
        const bonus = bonusesById.get(bonusState.id);
        if (!bonus) return;
        bonus.position.x = bonusState.position.x;
        bonus.position.y = bonusState.position.y;
        applyOrbitToRuntime(bonus.orbitSystem, bonusState.orbit);
        if (bonusState.collected && bonus.state !== 'Hit') bonus.collect();
        else if (!bonusState.collected && bonus.state === 'Hit') bonus.reset();
    });
    game.target.position.x = state.target.position.x;
    game.target.position.y = state.target.position.y;
    applyOrbitToRuntime(game.target.orbitSystem, state.target.orbit);
}

export function stepGameSimulation(game, deltaTime) {
    const state = game._runtimeSimulationState ||= captureGameSimulationState(game);
    // Before launch, the slingshot interaction is the authoritative owner of
    // Kevin's position. Keep the reusable simulation state aligned so applying
    // it cannot snap an idle/pullback Penguin back to an older frame.
    if (game.penguin.state !== 'soaring' && game.penguin.state !== 'crashed') {
        state.penguin.position.x = game.penguin.x;
        state.penguin.position.y = game.penguin.y;
        state.penguin.velocity.x = game.penguin.vx;
        state.penguin.velocity.y = game.penguin.vy;
        state.penguin.state = game.penguin.state;
        state.penguin.crashFramesRemaining = game.penguin.crashedFrameCount || 0;
    }
    const result = Math.abs(deltaTime - FIXED_TICK_SECONDS) < Number.EPSILON
        ? stepSimulationTickMutable(state)
        : stepSimulationMutable(state, deltaTime);
    applyGameSimulationState(game, state);
    return result;
}

export function invalidateGameSimulationState(game) {
    game._runtimeSimulationState = null;
}

class GameSimulationEventStrategy {
    constructor(type) {
        this.type = type;
    }
}

class PenguinMovedEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.PENGUIN_MOVED);
    }

    execute(game, event, deltaTime) {
        game.penguin.update(event.deltaTime ?? deltaTime, false);
        game.recordPathPoint(game.penguin.x, game.penguin.y);
    }
}

class BonusCollectedEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.BONUS_COLLECTED);
    }

    execute(game, event) {
        const bonus = runtimeObjectForSimulationIndex(game, 'bonuses', event.bonusIndex);
        game.playSound(getAudioCue(AudioCue.BONUS).soundId);
        if (bonus && game.bonusPopup) game.bonusPopup.show(event.value, bonus.position);
    }
}

class PlanetCollisionEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.PLANET_COLLISION);
    }

    execute(game, event) {
        const planet = runtimeObjectForSimulationIndex(game, 'planets', event.planetIndex);
        game.penguin.beginCrash(planet, false);
        game.playSound(getAudioCue(AudioCue.HIT_PLANET).soundId);
        game.endRecordingShotPath();
        game.preserveCrashedPenguin();
        game.tryAgain({ recordAction: false });
    }
}

class PlanetBounceEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.PLANET_BOUNCE);
    }

    execute(game) {
        game.playSound(getAudioCue(AudioCue.HIT_PLANET).soundId);
    }
}

class PortalTeleportedEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.PORTAL_TELEPORTED);
    }

    execute(game, event) {
        if (event.playSound) game.playSound(getAudioCue(AudioCue.PORTAL_WOOSH).soundId);
        game.beginPortalTransition?.(event);
        game.recordPortalTransit?.(event.entryPosition, event.exitPosition);
        game.penguin.markTrailDiscontinuity?.(event.exitPosition);
    }
}

class TargetHitEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.TARGET_HIT);
    }

    execute(game) {
        game.endRecordingShotPath();
        game.target.onHit();
        game.handleTargetHit();
    }
}

class TargetBlockedEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.TARGET_BLOCKED);
    }

    execute(game, event) {
        game.endRecordingShotPath();
        game.showMessage(`Collect ${event.remaining} more bonuses!`);
    }
}

class OutOfBoundsEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.OUT_OF_BOUNDS);
    }

    execute(game) {
        game.endRecordingShotPath();
    }
}

class AttemptResetRequiredEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.ATTEMPT_RESET_REQUIRED);
    }

    execute(game) {
        game.tryAgain({ recordAction: false });
    }
}

class RuleFailureEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.RULE_FAILURE);
    }

    execute(game, event) {
        game.showMessage(event.reason);
        game.setState('gameOver');
    }
}

export class GameSimulationEventStrategyRegistry {
    constructor(strategies) {
        this.strategiesByType = new Map(strategies.map(strategy => [strategy.type, strategy]));
    }

    execute(game, event, deltaTime) {
        this.strategiesByType.get(event.type)?.execute(game, event, deltaTime);
    }
}

export const gameSimulationEventStrategies = Object.freeze([
    new PenguinMovedEventStrategy(),
    new BonusCollectedEventStrategy(),
    new PlanetCollisionEventStrategy(),
    new PlanetBounceEventStrategy(),
    new PortalTeleportedEventStrategy(),
    new TargetHitEventStrategy(),
    new TargetBlockedEventStrategy(),
    new OutOfBoundsEventStrategy(),
    new AttemptResetRequiredEventStrategy(),
    new RuleFailureEventStrategy()
]);

const gameSimulationEventStrategyRegistry = new GameSimulationEventStrategyRegistry(gameSimulationEventStrategies);

export function applyGameSimulationEvents(game, events, deltaTime) {
    for (const event of events) {
        gameSimulationEventStrategyRegistry.execute(game, event, deltaTime);
    }
    game.updateUI();
}
