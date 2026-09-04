import { Planet } from './gameObjects.js';
import { LEVEL_DEFAULTS, PHYSICS_CONFIG } from '../../config/gameConfig.js';

const REPULSOR_VISUALS = Object.freeze({
    particleCount: 26,
    particleTravelScale: 2.8,
    particleCyclesPerMs: 0.00042,
    haloScale: 2.45,
    rayCount: 12
});

/**
 * A bright, non-colliding gravity source whose signed simulation mass pushes
 * the penguin away. Particle motion is presentation-only.
 */
export class RepulsorStar extends Planet {
    constructor(
        x,
        y,
        radius = LEVEL_DEFAULTS.repulsorStar.radius,
        strength = LEVEL_DEFAULTS.repulsorStar.strength,
        repulsionReach = LEVEL_DEFAULTS.repulsorStar.repulsionReach,
        gameObjectLookup = null
    ) {
        super(x, y, radius, -Math.abs(strength), repulsionReach, null, null, gameObjectLookup);
        this.strength = Math.abs(strength);
        this.repulsionReach = repulsionReach;
        this.collidable = false;
        this.collisionRadius = 0;
        this.name = 'Repulsor Star';
    }

    setRepulsionStrength(value) {
        this.strength = Math.max(0, value);
        this.mass = -this.strength;
    }

    setRepulsionReach(value) {
        this.repulsionReach = value;
        this.gravitationalReach = value;
    }

    drawSprite(ctx) {
        const time = globalThis.performance?.now?.() ?? Date.now();
        const radius = this.radius;
        const seed = [...String(this.id || `${this.position.x}:${this.position.y}`)]
            .reduce((sum, char) => sum + char.charCodeAt(0), 0);

        const halo = ctx.createRadialGradient(0, 0, radius * 0.15, 0, 0, radius * REPULSOR_VISUALS.haloScale);
        halo.addColorStop(0, 'rgba(255, 255, 255, 1)');
        halo.addColorStop(0.28, 'rgba(230, 248, 255, 0.72)');
        halo.addColorStop(0.65, 'rgba(126, 211, 255, 0.20)');
        halo.addColorStop(1, 'rgba(126, 211, 255, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, radius * REPULSOR_VISUALS.haloScale, 0, Math.PI * 2);
        ctx.fill();

        // Short rays pulse independently, keeping the center crisp while the
        // silhouette reads as an energetic star rather than a pale planet.
        ctx.save();
        ctx.rotate(time * 0.00008 + seed * 0.01);
        for (let index = 0; index < REPULSOR_VISUALS.rayCount; index++) {
            const angle = index / REPULSOR_VISUALS.rayCount * Math.PI * 2;
            const pulse = 0.82 + 0.22 * Math.sin(time * 0.0023 + index * 1.7 + seed);
            const inner = radius * 0.72;
            const outer = radius * (1.32 + (index % 3) * 0.17) * pulse;
            ctx.strokeStyle = index % 2 === 0
                ? 'rgba(255, 255, 255, 0.78)'
                : 'rgba(194, 235, 255, 0.58)';
            ctx.lineWidth = index % 3 === 0 ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
            ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
            ctx.stroke();
        }
        ctx.restore();

        // Each particle repeatedly flicks outward from the center. Its streak
        // shortens and fades over its lifetime; no particle state enters the
        // deterministic simulation.
        for (let index = 0; index < REPULSOR_VISUALS.particleCount; index++) {
            const phaseOffset = ((index * 17) % REPULSOR_VISUALS.particleCount) /
                REPULSOR_VISUALS.particleCount;
            const life = (time * REPULSOR_VISUALS.particleCyclesPerMs *
                (0.82 + (index % 5) * 0.075) + phaseOffset) % 1;
            const angle = index / REPULSOR_VISUALS.particleCount * Math.PI * 2 +
                seed * 0.019 + Math.sin(index * 4.37) * 0.16;
            const distance = radius * REPULSOR_VISUALS.particleTravelScale * life * life;
            const streak = radius * (0.12 + 0.23 * (1 - life));
            const alpha = Math.pow(1 - life, 1.55) * (0.55 + 0.35 * Math.sin(time * 0.008 + index));
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            ctx.globalAlpha = Math.max(0, alpha);
            ctx.shadowColor = '#dff7ff';
            ctx.shadowBlur = 6;
            ctx.strokeStyle = index % 4 === 0 ? '#ffffff' : '#bfeaff';
            ctx.lineWidth = index % 4 === 0 ? 2 : 1.25;
            ctx.beginPath();
            ctx.moveTo(cos * Math.max(0, distance - streak), sin * Math.max(0, distance - streak));
            ctx.lineTo(cos * distance, sin * distance);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = Math.max(10, radius * 0.55);
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        core.addColorStop(0, '#ffffff');
        core.addColorStop(0.58, '#ffffff');
        core.addColorStop(0.82, '#dff7ff');
        core.addColorStop(1, 'rgba(167, 225, 255, 0.28)');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (this.gravitationalReach > 0 &&
            this.gravitationalReach < PHYSICS_CONFIG.defaultGravitationalReach) {
            ctx.strokeStyle = 'rgba(196, 239, 255, 0.28)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, radius + this.gravitationalReach, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}
