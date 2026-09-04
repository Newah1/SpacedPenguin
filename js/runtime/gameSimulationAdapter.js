import { cloneOrbitState } from '../simulation/orbitSimulation.js';
import {
    advanceSimulationWorldMutable,
    FIXED_TICK_SECONDS,
    stepSimulationMutable,
    stepSimulationTickMutable,
    SimulationEventType
} from '../simulation/simulationEngine.js';
import {
    disposeWasmSimulationHandle,
    isWasmSimulationReady,
    stepSimulationSliceWasmMutable
} from '../simulation/wasmSimulationBridge.js';
import { effectiveGravitationalReach } from '../config/legacyConstants.js';
import { LevelOrbitType } from '../levels/levelSchema.js';
import { LEVEL_DEFAULTS } from '../config/gameConfig.js';
import { cloneWaypointPathState } from '../simulation/waypointSimulation.js';
import { GameEffectsCoordinator } from './gameEffectsCoordinator.js';

function effectsFor(game) {
    return game.effects ||= new GameEffectsCoordinator(game);
}

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

function waypointPathFromRuntime(system) {
    return system ? cloneWaypointPathState(system) : null;
}

function applyWaypointPathToRuntime(system, path) {
    if (!system || !path) return;
    system.phase = path.phase;
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
    const speedBoosterIds = ensureStableRuntimeIds(game.speedBoosters || [], 'speedbooster');
    const deflectorBumperIds = ensureStableRuntimeIds(game.deflectorBumpers || [], 'deflectorbumper');
    const forceFieldIds = ensureStableRuntimeIds(game.forceFields || [], 'onewayforcefield');
    const decorationObjects = [...(game.textObjects || []), ...(game.pointingArrows || [])];
    const decorationIds = ensureStableRuntimeIds(decorationObjects, 'decoration');
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
            collidable: planet.collidable !== false,
            mass: planet.mass,
            gravitationalReach: effectiveGravitationalReach(planet.gravitationalReach),
            orbit: orbitFromRuntime(planet.orbitSystem),
            waypointPath: waypointPathFromRuntime(planet.waypointSystem)
        })),
        bonuses: game.bonuses.map((bonus, index) => ({
            id: bonusIds[index],
            position: { ...bonus.position },
            width: bonus.width,
            value: bonus.value,
            collected: bonus.state === 'Hit',
            collectionRadius: LEVEL_DEFAULTS.bonus.collectionPadding + bonus.width / 2,
            orbit: orbitFromRuntime(bonus.orbitSystem),
            waypointPath: waypointPathFromRuntime(bonus.waypointSystem)
        })),
        portals: (game.portals || []).map((portal, index) => ({
            id: portalIds[index],
            position: { ...portal.position },
            width: portal.width,
            height: portal.height,
            rotation: portal.rotation,
            color: portal.color,
            pairedPortalId: portal.pairedPortalId,
            playSound: portal.playSound,
            waypointPath: waypointPathFromRuntime(portal.waypointSystem)
        })),
        speedBoosters: (game.speedBoosters || []).map((speedBooster, index) => ({
            id: speedBoosterIds[index],
            position: { ...speedBooster.position },
            width: speedBooster.width,
            height: speedBooster.height,
            rotation: speedBooster.rotation,
            speedMultiplier: speedBooster.speedMultiplier,
            playSound: speedBooster.playSound,
            waypointPath: waypointPathFromRuntime(speedBooster.waypointSystem)
        })),
        deflectorBumpers: (game.deflectorBumpers || []).map((bumper, index) => ({
            id: deflectorBumperIds[index],
            position: { ...bumper.position },
            radius: bumper.radius,
            restitution: bumper.restitution,
            playSound: bumper.playSound,
            waypointPath: waypointPathFromRuntime(bumper.waypointSystem)
        })),
        forceFields: (game.forceFields || []).map((field, index) => ({
            id: forceFieldIds[index],
            position: { ...field.position },
            width: field.width,
            height: field.height,
            rotation: field.rotation,
            restitution: field.restitution,
            playSound: field.playSound,
            waypointPath: waypointPathFromRuntime(field.waypointSystem)
        })),
        decorations: decorationObjects.map((object, index) => ({
            id: decorationIds[index],
            position: { ...object.position },
            waypointPath: waypointPathFromRuntime(object.waypointSystem)
        })),
        target: {
            id: targetId,
            position: { ...game.target.position },
            width: game.target.width,
            height: game.target.height,
            collisionRadius: game.target.collisionRadius ?? game.target.width / 2,
            orbit: orbitFromRuntime(game.target.orbitSystem),
            waypointPath: waypointPathFromRuntime(game.target.waypointSystem)
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
            minPullback: game.slingshot.minPullback,
            waypointPath: waypointPathFromRuntime(game.slingshot.waypointSystem)
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
        applyWaypointPathToRuntime(planet.waypointSystem, planetState.waypointPath);
    });
    state.bonuses.forEach(bonusState => {
        const bonus = bonusesById.get(bonusState.id);
        if (!bonus) return;
        bonus.position.x = bonusState.position.x;
        bonus.position.y = bonusState.position.y;
        applyOrbitToRuntime(bonus.orbitSystem, bonusState.orbit);
        applyWaypointPathToRuntime(bonus.waypointSystem, bonusState.waypointPath);
        if (bonusState.collected && bonus.state !== 'Hit') bonus.collect();
        else if (!bonusState.collected && bonus.state === 'Hit') bonus.reset();
    });
    game.target.position.x = state.target.position.x;
    game.target.position.y = state.target.position.y;
    applyOrbitToRuntime(game.target.orbitSystem, state.target.orbit);
    applyWaypointPathToRuntime(game.target.waypointSystem, state.target.waypointPath);
    const portalsById = runtimeObjectsById(game.portals || []);
    state.portals?.forEach(portalState => {
        const portal = portalsById.get(portalState.id);
        if (!portal) return;
        Object.assign(portal.position, portalState.position);
        applyWaypointPathToRuntime(portal.waypointSystem, portalState.waypointPath);
    });
    const speedBoostersById = runtimeObjectsById(game.speedBoosters || []);
    state.speedBoosters?.forEach(speedBoosterState => {
        const speedBooster = speedBoostersById.get(speedBoosterState.id);
        if (!speedBooster) return;
        Object.assign(speedBooster.position, speedBoosterState.position);
        applyWaypointPathToRuntime(speedBooster.waypointSystem, speedBoosterState.waypointPath);
    });
    const deflectorBumpersById = runtimeObjectsById(game.deflectorBumpers || []);
    state.deflectorBumpers?.forEach(bumperState => {
        const bumper = deflectorBumpersById.get(bumperState.id);
        if (!bumper) return;
        Object.assign(bumper.position, bumperState.position);
        applyWaypointPathToRuntime(bumper.waypointSystem, bumperState.waypointPath);
    });
    const forceFieldsById = runtimeObjectsById(game.forceFields || []);
    state.forceFields?.forEach(fieldState => {
        const field = forceFieldsById.get(fieldState.id);
        if (!field) return;
        Object.assign(field.position, fieldState.position);
        applyWaypointPathToRuntime(field.waypointSystem, fieldState.waypointPath);
    });
    const decorationsById = runtimeObjectsById([
        ...(game.textObjects || []),
        ...(game.pointingArrows || [])
    ]);
    state.decorations?.forEach(decorationState => {
        const decoration = decorationsById.get(decorationState.id);
        if (!decoration) return;
        Object.assign(decoration.position, decorationState.position);
        applyWaypointPathToRuntime(decoration.waypointSystem, decorationState.waypointPath);
    });
    if (state.slingshot?.waypointPath) {
        const anchorPosition = state.slingshot.anchorPosition || state.slingshot.position;
        Object.assign(game.slingshot.position, anchorPosition);
        Object.assign(game.slingshot.anchor, anchorPosition);
        Object.assign(game.slingshot.resetPosition, state.slingshot.position);
        applyWaypointPathToRuntime(game.slingshot.waypointSystem, state.slingshot.waypointPath);
        if (game.penguin.state === PenguinState.IDLE) {
            game.penguin.setPosition?.(state.slingshot.position.x, state.slingshot.position.y);
            state.penguin.position = { ...state.slingshot.position };
        }
    }
}

/**
 * @param {import('../game.js').Game} game
 * @param {number} deltaTime
 * @returns {number}
 */
export function stepGameSimulation(game, deltaTime) {
    const state = game._runtimeSimulationState ||= captureGameSimulationState(game);
    // Before launch, the slingshot interaction is the authoritative owner of
    // Kevin's position. Keep the reusable simulation state aligned so applying
    // it cannot snap an idle/pullback Penguin back to an older frame.
    if (game.penguin.state !== PenguinState.SOARING && game.penguin.state !== PenguinState.CRASHED) {
        state.penguin.position.x = game.penguin.x;
        state.penguin.position.y = game.penguin.y;
        state.penguin.velocity.x = game.penguin.vx;
        state.penguin.velocity.y = game.penguin.vy;
        state.penguin.state = game.penguin.state;
        state.penguin.crashFramesRemaining = game.penguin.crashedFrameCount || 0;
    }
    let result;
    if (isWasmSimulationReady()) {
        const events = [];
        let remainingTime = Math.max(0, deltaTime);
        const fixedTick = Math.abs(deltaTime - FIXED_TICK_SECONDS) < Number.EPSILON;
        if (remainingTime === 0) {
            result = stepSimulationSliceWasmMutable(state, 0, false);
            events.push(...result.events);
        } else {
            while (remainingTime > 0) {
                const step = Math.min(remainingTime, FIXED_TICK_SECONDS);
                advanceSimulationWorldMutable(state, step);
                result = stepSimulationSliceWasmMutable(state, step, fixedTick);
                events.push(...result.events);
                remainingTime -= step;
                if (remainingTime < Number.EPSILON) remainingTime = 0;
            }
        }
        result = { state, events };
    } else {
        result = Math.abs(deltaTime - FIXED_TICK_SECONDS) < Number.EPSILON
            ? stepSimulationTickMutable(state)
            : stepSimulationMutable(state, deltaTime);
    }
    applyGameSimulationState(game, state);
    return result;
}

/**
 * @param {import('../game.js').Game} game
 */
export function invalidateGameSimulationState(game) {
    if (game._runtimeSimulationState) disposeWasmSimulationHandle(game._runtimeSimulationState);
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
        effectsFor(game).penguinMoved(event, deltaTime);
    }
}

class BonusCollectedEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.BONUS_COLLECTED);
    }

    execute(game, event) {
        const bonus = runtimeObjectForSimulationIndex(game, 'bonuses', event.bonusIndex);
        effectsFor(game).bonusCollected(event, bonus);
    }
}

class PlanetCollisionEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.PLANET_COLLISION);
    }

    execute(game, event) {
        const planet = runtimeObjectForSimulationIndex(game, 'planets', event.planetIndex);
        effectsFor(game).planetCollision(event, planet);
    }
}

class PlanetBounceEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.PLANET_BOUNCE);
    }

    execute(game) {
        effectsFor(game).planetBounce();
    }
}

class PortalTeleportedEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.PORTAL_TELEPORTED);
    }

    execute(game, event) {
        effectsFor(game).portalTeleported(event);
    }
}

class SpeedBoosterActivatedEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.SPEED_BOOSTER_ACTIVATED);
    }

    execute(game, event) {
        effectsFor(game).speedBoosterActivated(event);
    }
}

class DeflectorBouncedEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.DEFLECTOR_BOUNCED);
    }

    execute(game, event) {
        const bumper = runtimeObjectForSimulationIndex(game, 'deflectorBumpers', event.deflectorBumperIndex);
        effectsFor(game).deflectorBounced(event, bumper);
    }
}

class ForceFieldReflectedEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.FORCE_FIELD_REFLECTED);
    }

    execute(game, event) {
        const field = runtimeObjectForSimulationIndex(game, 'forceFields', event.forceFieldIndex);
        effectsFor(game).forceFieldReflected(event, field);
    }
}

class TargetHitEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.TARGET_HIT);
    }

    execute(game) {
        effectsFor(game).targetHit();
    }
}

class TargetBlockedEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.TARGET_BLOCKED);
    }

    execute(game, event) {
        effectsFor(game).targetBlocked(event);
    }
}

class OutOfBoundsEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.OUT_OF_BOUNDS);
    }

    execute(game) {
        effectsFor(game).outOfBounds();
    }
}

class AttemptResetRequiredEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.ATTEMPT_RESET_REQUIRED);
    }

    execute(game) {
        effectsFor(game).attemptResetRequired();
    }
}

class RuleFailureEventStrategy extends GameSimulationEventStrategy {
    constructor() {
        super(SimulationEventType.RULE_FAILURE);
    }

    execute(game, event) {
        effectsFor(game).ruleFailure(event);
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
    new SpeedBoosterActivatedEventStrategy(),
    new DeflectorBouncedEventStrategy(),
    new ForceFieldReflectedEventStrategy(),
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
import { PenguinState } from './penguinState.js';
