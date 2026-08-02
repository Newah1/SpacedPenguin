import { devices, expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { validateLevelDefinition } from '../js/levelValidation.js';

const deterministicLevel = {
    name: 'Browser Smoke Level',
    startPosition: { x: 100, y: 300 },
    targetPosition: { x: 350, y: 300 },
    objects: [],
    rules: {}
};

async function useDeterministicLevel(page) {
    await page.route('**/levels/level1.json', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(deterministicLevel)
    }));
}

async function waitForGame(page, state = 'menu') {
    await page.waitForFunction(expectedState => (
        window.gameManager?.assetsLoaded === true &&
        window.game?.state === expectedState
    ), state);
}

async function stageToClient(page, x, y) {
    return page.locator('#gameCanvas').evaluate((canvas, point) => {
        const rect = canvas.getBoundingClientRect();
        const viewport = canvas.viewport;
        return {
            x: rect.left + (point.x * viewport.scale + viewport.offsetX)
                * (rect.width / viewport.backingWidth),
            y: rect.top + (point.y * viewport.scale + viewport.offsetY)
                * (rect.height / viewport.backingHeight)
        };
    }, { x, y });
}

async function launchFromSlingshot(page) {
    const anchor = await stageToClient(page, 100, 300);
    const pullback = await stageToClient(page, 20, 300);
    await page.mouse.move(anchor.x, anchor.y);
    await page.mouse.down();
    await page.mouse.move(pullback.x, pullback.y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.game.tries)).toBe(1);
}

test.beforeEach(async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    pageErrorsByPage.set(page, pageErrors);
});

test.afterEach(async ({ page }) => {
    expect(pageErrorsByPage.get(page) || []).toEqual([]);
    pageErrorsByPage.delete(page);
});

const pageErrorsByPage = new WeakMap();

test('start, launch, pause, resume, render, and finish a level', async ({ page }) => {
    await useDeterministicLevel(page);
    await page.goto('/');
    await waitForGame(page);

    await expect(page.locator('#gameCanvas')).toBeVisible();
    await page.keyboard.press('Space');
    await waitForGame(page, 'playing');

    await launchFromSlingshot(page);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.game.state)).toBe('paused');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.game.state)).toBe('playing');

    await page.evaluate(() => {
        window.game.target.onHit();
        window.game.handleTargetHit();
    });
    await expect.poll(
        () => page.evaluate(() => window.game.state),
        { timeout: 10_000 }
    ).toBe('scoring');
    await expect.poll(() => page.evaluate(() => window.game.uiManager.activeScreens.length)).toBe(1);

    const renderedPixelCount = await page.locator('#gameCanvas').evaluate(canvas => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let visibleSamples = 0;
        for (let index = 0; index < pixels.length; index += 400) {
            if (pixels[index] || pixels[index + 1] || pixels[index + 2] || pixels[index + 3]) {
                visibleSamples++;
            }
        }
        return visibleSamples;
    });
    expect(renderedPixelCount).toBeGreaterThan(0);
});

test('audio request failures degrade without blocking bootstrap', async ({ page }) => {
    await page.route('**/*.wav', route => route.abort('failed'));
    await page.goto('/');
    await waitForGame(page);

    await expect(page.locator('#loadingScreen')).toBeHidden();
    await expect(page.locator('#gameCanvas')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(window.game?.assetLoader))).toBe(true);
});

test('editor exports a valid normalized level document', async ({ page }) => {
    await useDeterministicLevel(page);
    await page.goto('/');
    await waitForGame(page);
    await page.keyboard.press('Space');
    await waitForGame(page, 'playing');
    await page.keyboard.press('F1');

    const exportButton = page.getByRole('button', { name: 'Export Level', exact: true });
    await expect(exportButton).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();
    const download = await downloadPromise;
    const exportedLevel = JSON.parse(await readFile(await download.path(), 'utf8'));

    expect(download.suggestedFilename()).toMatch(/^custom_level_\d+\.json$/);
    expect(validateLevelDefinition(exportedLevel).valid).toBe(true);
    expect(exportedLevel.startPosition).toEqual(deterministicLevel.startPosition);
    expect(Array.isArray(exportedLevel.objects)).toBe(true);
});

test.describe('mobile viewport', () => {
    const pixel5 = devices['Pixel 5'];
    test.use({
        viewport: pixel5.viewport,
        userAgent: pixel5.userAgent,
        deviceScaleFactor: pixel5.deviceScaleFactor,
        isMobile: pixel5.isMobile,
        hasTouch: pixel5.hasTouch
    });

    test('maps displayed canvas coordinates to the logical stage', async ({ page }) => {
        await useDeterministicLevel(page);
        await page.goto('/');
        await waitForGame(page);

        const startButton = page.getByRole('button', { name: 'TAP TO LAUNCH', exact: true });
        await expect(startButton).toBeVisible();
        await startButton.click();
        await waitForGame(page, 'playing');
        await launchFromSlingshot(page);

        const position = await page.evaluate(() => ({
            x: window.game.penguin.x,
            y: window.game.penguin.y
        }));
        expect(position.x).toBeGreaterThan(20);
        expect(Math.abs(position.y - 300)).toBeLessThan(5);
    });
});
