import { expect, test } from '@playwright/test';

test('browser initializes and runs the Rust/WebAssembly simulation backend', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.gameManager?.bootstrapComplete === true);
    await expect.poll(() => page.evaluate(() => window.gameManager.getSimulationBackend())).toBe('wasm');
});

