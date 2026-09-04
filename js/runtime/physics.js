// Runtime physics membership and trace state for Spaced Penguin.
// Gameplay integration/collision rules are authoritative in the Rust simulator;
// simulationEngine.js is the browser-facing compatibility fallback.

import { effectiveGravitationalReach, GRAVITATIONAL_CONSTANT } from '../config/legacyConstants.js';
import { RENDER_CONFIG } from '../config/renderConfig.js';

export class Physics {
    constructor() {
        this.gravitationalConstant = GRAVITATIONAL_CONSTANT;
        this.planets = [];
        this.bonuses = [];
        this.traceEnabled = true;
        this.traceColor = RENDER_CONFIG.penguin.trail.color;
        this.tracePoints = [];
    }

    addPlanet(planet) {
        if (this.planets.some(entry => entry.sprite === planet)) return;
        this.planets.push({
            sprite: planet,
            mass: planet.mass,
            collisionRadius: planet.collisionRadius,
            gravitationalReach: effectiveGravitationalReach(planet.gravitationalReach)
        });
    }

    removePlanet(planet) {
        this.planets = this.planets.filter(entry => entry.sprite !== planet);
    }

    refreshPlanet(planet) {
        const entry = this.planets.find(candidate => candidate.sprite === planet);
        if (!entry) return;
        entry.mass = planet.mass;
        entry.collisionRadius = planet.collisionRadius;
        entry.gravitationalReach = effectiveGravitationalReach(planet.gravitationalReach);
    }

    addBonus(bonus) {
        if (this.bonuses.some(entry => entry.sprite === bonus)) return;
        this.bonuses.push({ sprite: bonus, collected: false });
    }

    removeBonus(bonus) {
        this.bonuses = this.bonuses.filter(entry => entry.sprite !== bonus);
    }

    clear() {
        this.planets = [];
        this.bonuses = [];
        this.tracePoints = [];
    }

    addTracePoint(point) {
        this.tracePoints.push({ x: point.x, y: point.y, time: Date.now() });
        if (this.tracePoints.length > RENDER_CONFIG.penguin.trail.maximumPoints) {
            this.tracePoints.shift();
        }
    }

    clearTrace() {
        this.tracePoints = [];
    }

    drawTrace(ctx) {
        if (!this.traceEnabled || this.tracePoints.length < 2) return;

        ctx.strokeStyle = this.traceColor;
        ctx.lineWidth = RENDER_CONFIG.shotTrails.lineWidth;
        ctx.globalAlpha = RENDER_CONFIG.shotTrails.activeAlpha;
        ctx.beginPath();
        ctx.moveTo(this.tracePoints[0].x, this.tracePoints[0].y);
        for (let index = 1; index < this.tracePoints.length; index++) {
            ctx.lineTo(this.tracePoints[index].x, this.tracePoints[index].y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    setGravitationalConstant(constant) {
        this.gravitationalConstant = constant;
    }

    setTraceEnabled(enabled) {
        this.traceEnabled = enabled;
        if (!enabled) this.clearTrace();
    }

}
