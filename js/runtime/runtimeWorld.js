import { WORLD_CONFIG } from '../config/gameConfig.js';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../rendering/viewport.js';
import { Physics } from './physics.js';
import RuntimeObjectMembership from './runtimeObjectMembership.js';

/** Owns the live browser projection of a level and every entity index. */
export class RuntimeWorld {
    constructor({ physics = new Physics(), onSimulationInvalidated = null } = {}) {
        this.physics = physics;
        this.onSimulationInvalidated = onSimulationInvalidated;
        this.stageRect = { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT };
        this.flightRect = { ...WORLD_CONFIG.flightBounds };
        this.cameraConfig = null;
        this.revision = 0;
        this.gameObjects = [];
        this.planets = [];
        this.bonuses = [];
        this.portals = [];
        this.speedBoosters = [];
        this.deflectorBumpers = [];
        this.forceFields = [];
        this.textObjects = [];
        this.pointingArrows = [];
        this.penguin = null;
        this.slingshot = null;
        this.target = null;
        this.arrow = null;
        this.bonusPopup = null;
        this.membership = new RuntimeObjectMembership(this);
    }

    touch({ simulation = true } = {}) {
        this.revision++;
        if (simulation) this.onSimulationInvalidated?.();
    }

    invalidateSimulationState() {
        this.onSimulationInvalidated?.();
    }

    addGameObject(object) {
        if (!object || this.gameObjects.includes(object)) return false;
        this.gameObjects.push(object);
        this.touch({ simulation: false });
        return true;
    }

    removeGameObject(object) {
        const index = this.gameObjects.indexOf(object);
        if (index < 0) return false;
        this.gameObjects.splice(index, 1);
        this.touch({ simulation: false });
        return true;
    }

    resetPresentationObjects() {
        this.arrow = null;
        this.bonusPopup = null;
    }

    renderables() {
        return this.gameObjects;
    }
}

export default RuntimeWorld;
