// Compatibility exports for callers that have not yet moved to domain config.
import { LEVEL_CATALOG_CONFIG, PHYSICS_CONFIG } from './config/gameConfig.js';

export const GRAVITATIONAL_CONSTANT = PHYSICS_CONFIG.gravitationalConstant;
export const DEFAULT_GRAVITATIONAL_REACH = PHYSICS_CONFIG.defaultGravitationalReach;

// Shipped editor exports historically wrote 0 for an unset reach while the
// runtime treated that value as the legacy default. Keep that compatibility
// rule explicit and shared by browser, headless, and registry facades.
export function effectiveGravitationalReach(value) {
    return typeof value === 'number' && value > 0
        ? value
        : DEFAULT_GRAVITATIONAL_REACH;
}
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
export const TOTAL_LEVELS = LEVEL_CATALOG_CONFIG.shippedLevelCount;
