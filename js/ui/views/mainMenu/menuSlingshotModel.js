import { RENDER_CONFIG } from '../../../config/renderConfig.js';

const ANCHOR = Object.freeze({ x: 163, y: 439 });
const RESTING_POSITION = Object.freeze({ x: 124, y: 440 });
const START_BUTTON = Object.freeze({ x: 655, y: 512, radiusX: 92, radiusY: 48 });

export class MenuSlingshotModel {
    constructor(options = {}) {
        this.maxTrailLength = options.maxTrailLength ?? RENDER_CONFIG.penguin.trailLength;
        this.reset({ preserveFrameTime: false });
    }

    reset({ preserveFrameTime = true } = {}) {
        const previousFrameTime = preserveFrameTime ? this.lastFrameTime ?? null : null;
        this.anchor = { ...ANCHOR };
        this.restingPosition = { ...RESTING_POSITION };
        this.position = { ...RESTING_POSITION };
        this.velocity = { x: 0, y: 0 };
        this.dragging = false;
        this.launched = false;
        this.age = 0;
        this.lastFrameTime = previousFrameTime;
        this.suppressClick = false;
        this.trail = [];
    }

    beginDrag(point) {
        if (Math.hypot(point.x - this.position.x, point.y - this.position.y) > 32) return false;
        this.dragging = true;
        this.launched = false;
        this.velocity = { x: 0, y: 0 };
        this.suppressClick = true;
        this.dragTo(point);
        return true;
    }

    dragTo(point) {
        const dx = point.x - this.anchor.x;
        const dy = point.y - this.anchor.y;
        const distance = Math.hypot(dx, dy);
        const scale = distance > 72 ? 72 / distance : 1;
        this.position.x = this.anchor.x + dx * scale;
        this.position.y = this.anchor.y + dy * scale;
    }

    release(point) {
        if (!this.dragging) return false;
        this.dragTo(point);
        this.dragging = false;
        const pullX = this.anchor.x - this.position.x;
        const pullY = this.anchor.y - this.position.y;
        if (Math.hypot(pullX, pullY) < 4) {
            this.reset();
            this.suppressClick = true;
        } else {
            this.velocity = { x: pullX * 5.5, y: pullY * 5.5 };
            this.launched = true;
            this.age = 0;
            this.suppressClick = true;
        }
        return true;
    }

    clearClickSuppression() {
        this.suppressClick = false;
    }

    consumeClickSuppression() {
        if (!this.suppressClick) return false;
        this.suppressClick = false;
        return true;
    }

    containsStartButton(point) {
        const normalizedX = (point.x - START_BUTTON.x) / START_BUTTON.radiusX;
        const normalizedY = (point.y - START_BUTTON.y) / START_BUTTON.radiusY;
        return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
    }

    getStartPlanets(time) {
        const orbit = time * 2.2;
        return [0, Math.PI].map(offset => ({
            x: START_BUTTON.x + Math.cos(orbit + offset) * 74,
            y: START_BUTTON.y + Math.sin(orbit + offset) * 58,
            radius: 18
        }));
    }

    update(time) {
        const previous = this.lastFrameTime ?? time;
        const deltaTime = Math.min(0.05, Math.max(0, time - previous));
        this.lastFrameTime = time;
        if (!this.launched || this.dragging) return;

        for (const planet of this.getStartPlanets(time)) {
            const dx = planet.x - this.position.x;
            const dy = planet.y - this.position.y;
            const distanceSquared = Math.max(625, dx * dx + dy * dy);
            const distance = Math.sqrt(distanceSquared);
            const acceleration = Math.min(350, 900000 / distanceSquared);
            this.velocity.x += (dx / distance) * acceleration * deltaTime;
            this.velocity.y += (dy / distance) * acceleration * deltaTime;
        }
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        this.age += deltaTime;
        this.trail.push({ ...this.position });
        if (this.trail.length > this.maxTrailLength) this.trail.shift();

        if (this.age > 12 || this.position.x < -100 || this.position.x > 900 ||
            this.position.y < -100 || this.position.y > 700) {
            this.reset();
        }
    }
}
