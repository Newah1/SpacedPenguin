// Global constants
export const GRAVITATIONAL_CONSTANT = 3.0; // Increased for more noticeable effect
export const DEFAULT_GRAVITATIONAL_REACH = 5000;

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
export const TOTAL_LEVELS = 19;
