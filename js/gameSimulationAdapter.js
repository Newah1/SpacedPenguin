import { cloneOrbitState } from './orbitSimulation.js';
import { stepSimulationMutable, SimulationEventType } from './simulationEngine.js';
import { effectiveGravitationalReach } from './globalConstants.js';
import { LevelOrbitType } from './levelSchema.js';
import { LEVEL_DEFAULTS } from './config/gameConfig.js';
import { AudioCue, getAudioCue } from './config/audioConfig.js';

function orbitFromRuntime(system) {
    if (!system) return null;
    const meaningful = system.orbitTargetId || system.orbitCenter ||
        system.orbitRadius !== 0 || system.orbitSpeed !== 0 || system.orbitType === LevelOrbitType.GRAVITY;
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
        maxGravityAccel: system.maxGravityAccel
    });
}

function applyOrbitToRuntime(system, orbit) {
    if (!system || !orbit) return;
    system.orbitAngle = orbit.angle;
    system.velocity ||= { x: 0, y: 0 };
    system.velocity.x = orbit.velocity.x;
    system.velocity.y = orbit.velocity.y;
}

export function captureGameSimulationState(game) {
    const planetIds = game.planets.map((planet, index) => planet.id || `__planet_${index + 1}`);
    const bonusIds = game.bonuses.map((bonus, index) => bonus.id || `__bonus_${index + 1}`);
    return {
        time: game.simulationTime || 0,
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
        target: {
            id: game.target.id || '__target_1',
            position: { ...game.target.position },
            width: game.target.width,
            height: game.target.height,
            orbit: orbitFromRuntime(game.target.orbitSystem)
        },
        slingshot: {
            position: { ...game.slingshot.anchor },
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
    game.penguin.x = state.penguin.position.x;
    game.penguin.y = state.penguin.position.y;
    game.penguin.vx = state.penguin.velocity.x;
    game.penguin.vy = state.penguin.velocity.y;
    game.penguin.state = state.penguin.state;
    game.penguin.crashedFrameCount = state.penguin.crashFramesRemaining;
    game.distance = state.counters.distance;
    game.currentAttemptScore = state.counters.currentAttemptScore;
    game.planetCollisions = state.counters.planetCollisions;

    state.planets.forEach((planetState, index) => {
        const planet = game.planets[index];
        if (!planet) return;
        planet.position.x = planetState.position.x;
        planet.position.y = planetState.position.y;
        applyOrbitToRuntime(planet.orbitSystem, planetState.orbit);
    });
    state.bonuses.forEach((bonusState, index) => {
        const bonus = game.bonuses[index];
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
    const result = stepSimulationMutable(state, deltaTime);
    applyGameSimulationState(game, state);
    return result;
}

export function invalidateGameSimulationState(game) {
    game._runtimeSimulationState = null;
}

export function applyGameSimulationEvents(game, events, deltaTime) {
    for (const event of events) {
        switch (event.type) {
            case SimulationEventType.PENGUIN_MOVED:
                game.penguin.update(event.deltaTime ?? deltaTime, false);
                game.recordPathPoint(game.penguin.x, game.penguin.y);
                break;
            case SimulationEventType.BONUS_COLLECTED: {
                const bonus = game.bonuses[event.bonusIndex];
                game.playSound(getAudioCue(AudioCue.BONUS).soundId);
                if (bonus && game.bonusPopup) game.bonusPopup.show(event.value, bonus.position);
                break;
            }
            case SimulationEventType.PLANET_COLLISION: {
                const planet = game.planets[event.planetIndex];
                game.penguin.beginCrash(planet, false);
                game.playSound(getAudioCue(AudioCue.HIT_PLANET).soundId);
                game.endRecordingShotPath();
                break;
            }
            case SimulationEventType.PLANET_BOUNCE:
                game.playSound(getAudioCue(AudioCue.HIT_PLANET).soundId);
                break;
            case SimulationEventType.TARGET_HIT:
                game.endRecordingShotPath();
                game.target.onHit();
                game.handleTargetHit();
                break;
            case SimulationEventType.TARGET_BLOCKED:
                game.endRecordingShotPath();
                game.showMessage(`Collect ${event.remaining} more bonuses!`);
                break;
            case SimulationEventType.OUT_OF_BOUNDS:
                game.endRecordingShotPath();
                break;
            case SimulationEventType.ATTEMPT_RESET_REQUIRED:
                game.tryAgain();
                break;
            case SimulationEventType.RULE_FAILURE:
                game.showMessage(event.reason);
                game.setState('gameOver');
                break;
        }
    }
    game.updateUI();
}
