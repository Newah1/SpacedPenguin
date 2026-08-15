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
    await page.route('**/levels/level01.json', route => route.fulfill({
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

test('start, launch, cancel the menu confirmation, render, and finish a level', async ({ page }) => {
    await useDeterministicLevel(page);
    await page.goto('/');
    await waitForGame(page);

    await expect(page.locator('#gameCanvas')).toBeVisible();
    await page.keyboard.press('Space');
    await waitForGame(page, 'playing');
    await launchFromSlingshot(page);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.game.state)).toBe('paused');
    await expect.poll(() => page.evaluate(() => window.game.uiManager.activeScreens.length)).toBe(1);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.game.state)).toBe('playing');
    await expect.poll(() => page.evaluate(() => window.game.uiManager.activeScreens.length)).toBe(0);

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

test('numeric selector loads the default original ports and manual prefix loads the archived catalog', async ({ page }) => {
    await page.goto('/?level=2');
    await waitForGame(page, 'playing');

    await expect.poll(() => page.evaluate(() => ({
        level: window.game.level,
        collection: window.game.levelLoader.activeCollection,
        name: window.game.levelMetadata.name,
        selector: new URL(window.location.href).searchParams.get('level'),
        tutorialText: window.game.textObjects.map(object => object.parsedContent.text),
        tutorialArrows: window.game.pointingArrows.length
    }))).toEqual({
        level: 2,
        collection: 'shipped',
        name: 'Original Level 02',
        selector: '2',
        tutorialText: [
            'Try to get Kevin back to the ship!',
            'Distance Bonus\nadds to your distance which boosts your score!'
        ],
        tutorialArrows: 2
    });

    await page.evaluate(() => window.game.nextLevel());
    await expect.poll(() => page.evaluate(() => ({
        level: window.game.level,
        name: window.game.levelMetadata.name,
        selector: new URL(window.location.href).searchParams.get('level')
    }))).toEqual({
        level: 3,
        name: 'Original Level 03',
        selector: '3'
    });

    await page.goto('/?level=manual:2');
    await waitForGame(page, 'playing');
    await expect.poll(() => page.evaluate(() => ({
        level: window.game.level,
        collection: window.game.levelLoader.activeCollection,
        name: window.game.levelMetadata.name,
        selector: new URL(window.location.href).searchParams.get('level')
    }))).toEqual({
        level: 2,
        collection: 'manual',
        name: 'Custom Level 2',
        selector: 'manual:2'
    });
});

test('Escape confirmation can return to the main menu', async ({ page }) => {
    await useDeterministicLevel(page);
    await page.goto('/');
    await waitForGame(page);
    await page.keyboard.press('Space');
    await waitForGame(page, 'playing');

    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.game.state)).toBe('paused');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');

    await waitForGame(page, 'menu');
    await expect.poll(() => page.evaluate(() => window.game.uiManager.activeScreens.length)).toBe(0);
});

test('settings are available from the main and pause menus and persist locally', async ({ page }) => {
    await useDeterministicLevel(page);
    await page.route('**/*.wav', route => route.abort());
    await page.goto('/');
    await waitForGame(page);

    await page.locator('#menuSettingsButton').click();
    await expect(page.getByRole('dialog', { name: 'SETTINGS' })).toBeVisible();
    await expect(page.getByLabel('Aim assist')).not.toBeChecked();
    await page.getByLabel('Aim assist').check();
    await page.getByLabel('Sound effects').uncheck();
    await page.getByLabel('Master volume').fill('0.35');
    await page.getByRole('button', { name: 'BACK' }).click();

    await page.reload();
    await waitForGame(page);
    await page.locator('#menuSettingsButton').click();
    await expect(page.getByLabel('Aim assist')).toBeChecked();
    await expect(page.getByLabel('Sound effects')).not.toBeChecked();
    await expect(page.getByLabel('Master volume')).toHaveValue('0.35');
    await page.getByRole('button', { name: 'BACK' }).click();

    await page.keyboard.press('Space');
    await waitForGame(page, 'playing');
    await page.keyboard.press('Backquote');
    const consoleInput = page.locator('#console input');
    await consoleInput.fill('/SetConfig simulation.aim');
    await consoleInput.press('Tab');
    await expect(consoleInput).toHaveValue('/SetConfig simulation.aimAssist.');
    await consoleInput.fill('/SetConfig simulation.aimAssist.previewSeconds 0.25');
    await consoleInput.press('Enter');
    await page.keyboard.press('Backquote');
    const anchor = await stageToClient(page, 100, 300);
    const pullback = await stageToClient(page, 35, 350);
    await page.mouse.move(anchor.x, anchor.y);
    await page.mouse.down();
    await page.mouse.move(pullback.x, pullback.y, { steps: 4 });
    await expect.poll(() => page.evaluate(() => window.game.aimAssistPoints.length)).toBeGreaterThan(2);
    await expect.poll(() => page.evaluate(() => window.game.aimAssistPoints.length)).toBeLessThanOrEqual(10);
    await page.mouse.up();
    await page.evaluate(() => window.game.tryAgain());
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.game.state)).toBe('paused');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'SETTINGS' })).toBeVisible();
    await page.getByRole('button', { name: 'BACK' }).click();
    await expect.poll(() => page.evaluate(() => window.game.uiManager.activeScreens.length)).toBe(1);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.game.state)).toBe('playing');
});

test('Stellar Mode accepts a selected MP3', async ({ page }) => {
    await page.goto('/');
    await waitForGame(page);
    await page.locator('#menuSettingsButton').click();

    const stellarMode = page.getByLabel('Stellar Mode');
    const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        stellarMode.check()
    ]);
    const buffer = await readFile(new URL('../assets/audio/bgm/penguins-ska.mp3', import.meta.url));
    await fileChooser.setFiles({ name: 'stellar.mp3', mimeType: 'audio/mpeg', buffer });

    await expect(stellarMode).toBeChecked();
    await expect.poll(() => page.evaluate(() => Boolean(window.game.audioManager.stellarMusicBuffer))).toBe(true);
});

test('slingshot pullback remains live-authoritative across animation frames', async ({ page }) => {
    await useDeterministicLevel(page);
    await page.goto('/');
    await waitForGame(page);
    await page.keyboard.press('Space');
    await waitForGame(page, 'playing');

    const anchor = await stageToClient(page, 100, 300);
    const pullback = await stageToClient(page, 20, 300);
    await page.mouse.move(anchor.x, anchor.y);
    await page.mouse.down();
    await page.mouse.move(pullback.x, pullback.y, { steps: 5 });

    await expect.poll(() => page.evaluate(() => (
        window.game.penguin.state === 'pullback' &&
        window.game.slingshot.isPulling &&
        window.game.penguin.x < 40
    ))).toBe(true);
    const pulledPosition = await page.evaluate(() => ({
        x: window.game.penguin.x,
        y: window.game.penguin.y
    }));

    // Let several update/render frames apply the reusable simulation state. A
    // regression would snap Kevin back to the anchor during this pause.
    await page.waitForTimeout(150);
    const heldPosition = await page.evaluate(() => ({
        x: window.game.penguin.x,
        y: window.game.penguin.y,
        state: window.game.penguin.state
    }));
    expect(heldPosition.state).toBe('pullback');
    expect(heldPosition.x).toBeCloseTo(pulledPosition.x, 8);
    expect(heldPosition.y).toBeCloseTo(pulledPosition.y, 8);

    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.game.tries)).toBe(1);
});

test('audio request failures degrade without blocking bootstrap', async ({ page }) => {
    await page.route('**/*.wav', route => route.abort('failed'));
    await page.goto('/');
    await waitForGame(page);

    await expect(page.locator('#loadingScreen')).toBeHidden();
    await expect(page.locator('#gameCanvas')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(window.game?.assetLoader))).toBe(true);
});

test('experimental background music persists, plays, and dims for menus', async ({ page }) => {
    await useDeterministicLevel(page);
    await page.goto('/');
    await waitForGame(page);

    await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
    const musicToggle = page.getByLabel('Experimental background music');
    await musicToggle.check();
    await expect.poll(() => page.evaluate(() => ({
        enabled: window.game.audioManager.backgroundMusicEnabled,
        playing: window.game.audioManager.isBackgroundMusicPlaying(),
        dimmed: window.game.audioManager.backgroundMusicDimmed
    }))).toEqual({
        enabled: true,
        playing: true,
        dimmed: true
    });
    expect(await page.evaluate(() => {
        const manager = window.game.audioManager;
        return manager.currentBackgroundTrack && manager.sounds.has(manager.currentBackgroundTrack);
    })).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.spacedPenguinSettings)
        .experimentalBackgroundMusic)).toBe(true);

    await page.getByRole('button', { name: 'BACK', exact: true }).click();
    await page.keyboard.press('Space');
    await waitForGame(page, 'playing');
    await expect.poll(() => page.evaluate(() => ({
        state: window.game.state,
        screens: window.game.uiManager.activeScreens.length,
        dimmed: window.game.audioManager.backgroundMusicDimmed
    }))).toEqual({ state: 'playing', screens: 0, dimmed: false });

    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.game.state)).toBe('paused');
    await expect.poll(() => page.evaluate(() => window.game.audioManager.backgroundMusicDimmed)).toBe(true);
});

test('menu uses the original black and orange title-card composition', async ({ page }, testInfo) => {
    await page.goto('/');
    await waitForGame(page);

    const colors = await page.locator('#gameCanvas').evaluate(canvas => {
        const ctx = canvas.getContext('2d');
        const viewport = canvas.viewport;
        const sample = (stageX, stageY) => {
            const x = Math.round(viewport.offsetX + stageX * viewport.scale);
            const y = Math.round(viewport.offsetY + stageY * viewport.scale);
            return Array.from(ctx.getImageData(x, y, 1, 1).data);
        };
        return {
            backdrop: sample(5, 5),
            howToCard: sample(400, 60),
            startButton: sample(655, 512)
        };
    });

    expect(colors.backdrop.slice(0, 3)).toEqual([0, 0, 0]);
    expect(colors.howToCard[0]).toBeGreaterThan(220);
    expect(colors.howToCard[1]).toBeGreaterThan(100);
    expect(colors.startButton[0]).toBeGreaterThan(220);

    const background = await stageToClient(page, 350, 500);
    await page.mouse.click(background.x, background.y);
    expect(await page.evaluate(() => window.game.state)).toBe('menu');

    const gravityResult = await page.evaluate(() => {
        const manager = window.gameManager;
        manager.menuSlingshot.position = { x: 500, y: 512 };
        manager.menuSlingshot.velocity = { x: 0, y: 0 };
        manager.menuSlingshot.launched = true;
        manager.menuSlingshot.age = 3;
        manager.menuSlingshot.lastFrameTime = 1;
        manager.updateMenuSlingshot(1.05);
        const result = {
            attractedTowardPlanets: manager.menuSlingshot.velocity.x > 0,
            stillFlyingOutsideVignette: manager.menuSlingshot.launched
        };
        manager.resetMenuSlingshot();
        return result;
    });
    expect(gravityResult).toEqual({
        attractedTowardPlanets: true,
        stillFlyingOutsideVignette: true
    });

    const kevin = await stageToClient(page, 124, 440);
    const pullback = await stageToClient(page, 76, 461);
    await page.mouse.move(kevin.x, kevin.y);
    await page.mouse.down();
    await page.mouse.move(pullback.x, pullback.y, { steps: 4 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.gameManager.menuSlingshot.launched)).toBe(true);
    expect(await page.evaluate(() => window.game.state)).toBe('menu');
    await page.locator('#gameCanvas').screenshot({ path: testInfo.outputPath('menu.png') });

    const start = await stageToClient(page, 655, 512);
    await page.mouse.click(start.x, start.y);
    await expect.poll(() => page.evaluate(() => window.game.state)).toBe('playing');
});

test('high-score button and final-game entry share the persisted leaderboard', async ({ page }) => {
    await page.goto('/');
    await waitForGame(page);

    const highScores = await stageToClient(page, 123, 544);
    await page.mouse.click(highScores.x, highScores.y);
    await expect(page.getByRole('heading', { name: 'HIGH SCORES' })).toBeVisible();
    await expect(page.getByText('No scores saved yet')).toBeVisible();
    await page.getByRole('button', { name: 'BACK' }).click();

    await page.evaluate(() => {
        window.game.score = 1234;
        window.game.highScore = 1234;
        window.game.endGame();
    });
    await expect(page.getByRole('heading', { name: 'A NEW HIGH SCORE!' })).toBeVisible();
    await page.getByLabel('First name').fill('Kevin');
    await page.getByLabel('Region').fill('NY');
    await page.getByRole('button', { name: 'SAVE SCORE' }).click();

    await expect(page.getByRole('heading', { name: 'HIGH SCORES' })).toBeVisible();
    await expect(page.locator('.high-score-list tbody tr')).toHaveCount(1);
    await expect(page.locator('.high-score-list tbody tr')).toContainText('Kevin');
    await expect(page.locator('.high-score-list tbody tr')).toContainText('1,234');
    expect(await page.evaluate(() => JSON.parse(localStorage.spacedPenguinHighScores).entries[0].score)).toBe(1234);

    await page.getByRole('button', { name: 'MAIN MENU' }).click();
    await waitForGame(page);
});

test('manual harness index and repository-relative modules remain available', async ({ page }) => {
    await page.goto('/testing/manual/');
    await expect(page.getByRole('heading', { name: 'Manual test harnesses' })).toBeVisible();
    await expect(page.locator('main, body').getByRole('link')).toHaveCount(15);

    await page.goto('/testing/manual/test_orbits.html');
    await expect(page.getByRole('heading', { name: 'Spaced Penguin - Orbit System Test' })).toBeVisible();
    await expect(page.locator('#orbitCanvas')).toBeVisible();
});

test('editor exports a valid normalized level document', async ({ page }) => {
    await useDeterministicLevel(page);
    await page.goto('/');
    await waitForGame(page);
    await page.keyboard.press('Space');
    await waitForGame(page, 'playing');
    await page.keyboard.press('F1');

    await page.evaluate(() => window.game.levelEditor.addObject('Planet'));
    await expect.poll(() => page.evaluate(() => ({
        planets: window.game.planets.length,
        physicsPlanets: window.game.physics.planets.length
    }))).toEqual({ planets: 1, physicsPlanets: 1 });
    await page.keyboard.press('Control+KeyZ');
    await expect.poll(() => page.evaluate(() => window.game.planets.length)).toBe(0);
    await page.keyboard.press('Control+Shift+KeyZ');
    await expect.poll(() => page.evaluate(() => window.game.planets.length)).toBe(1);
    const massInput = page.locator('input[data-property="mass"]');
    await massInput.fill('1234');
    await expect.poll(() => page.evaluate(() => window.game.planets[0].mass)).toBe(1234);
    await page.keyboard.press('Control+KeyZ');
    await expect.poll(() => page.evaluate(() => window.game.planets[0].mass)).toBe(1000);
    await page.keyboard.press('Control+Shift+KeyZ');
    await expect.poll(() => page.evaluate(() => window.game.planets[0].mass)).toBe(1234);

    const levelSettings = page.locator('.level-settings-item');
    await expect(levelSettings).toBeVisible();
    await expect(levelSettings).toContainText('Level Settings');
    expect(await levelSettings.evaluate(element => getComputedStyle(element).marginBottom)).toBe('16px');
    await levelSettings.click();

    await expect(page.locator('input[data-property="levelName"]')).toHaveValue('Browser Smoke Level');
    await page.locator('input[data-property="levelName"]').fill('Edited Browser Level');
    await page.locator('input[data-property="startX"]').fill('125');
    await page.locator('input[data-property="gravitationalConstant"]').fill('2.5');
    await page.keyboard.press('Control+KeyZ');
    await expect.poll(() => page.evaluate(() => window.game.physics.gravitationalConstant)).toBe(3);
    await page.keyboard.press('Control+Shift+KeyZ');
    await expect.poll(() => page.evaluate(() => window.game.physics.gravitationalConstant)).toBe(2.5);

    const exportButton = page.getByRole('button', { name: 'Export Level', exact: true });
    await expect(exportButton).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();
    const download = await downloadPromise;
    const exportedLevel = JSON.parse(await readFile(await download.path(), 'utf8'));

    expect(download.suggestedFilename()).toMatch(/^custom_level_\d+\.json$/);
    expect(validateLevelDefinition(exportedLevel).valid).toBe(true);
    expect(exportedLevel.name).toBe('Edited Browser Level');
    expect(exportedLevel.startPosition).toEqual({ x: 125, y: 300 });
    expect(exportedLevel.rules.gravitationalConstant).toBe(2.5);
    expect(Array.isArray(exportedLevel.objects)).toBe(true);
});

test('level_editor URL parameter boots directly into the editor', async ({ page }) => {
    await useDeterministicLevel(page);
    await page.goto('/?level_editor');
    await waitForGame(page, 'levelEditor');

    await expect(page.locator('#level-editor')).toBeVisible();
    expect(await page.evaluate(() => ({
        active: window.game.levelEditor.active,
        level: window.game.level,
        name: window.game.levelMetadata.name
    }))).toEqual({
        active: true,
        level: 1,
        name: 'Browser Smoke Level'
    });
});

test('Gravity Sculpt draws, solves, previews, applies, and undoes one planet batch', async ({ page }) => {
    await useDeterministicLevel(page);
    await page.goto('/');
    await waitForGame(page);
    await page.keyboard.press('Space');
    await waitForGame(page, 'playing');
    await page.keyboard.press('F1');
    await page.evaluate(() => window.game.levelEditor.addObject('Planet'));

    await page.getByRole('button', { name: 'Gravity Sculpt', exact: true }).click();
    await expect(page.locator('#gravity-sculpt-panel')).toBeVisible();
    await expect(page.getByLabel('Search budget')).toHaveValue('1');
    await expect(page.locator('#gravity-sculpt-panel')).toContainText('1× (~1× time)');
    await page.getByRole('button', { name: 'Set Waypoints', exact: true }).click();
    const points = await Promise.all([
        stageToClient(page, 105, 300),
        stageToClient(page, 260, 245),
        stageToClient(page, 470, 230),
        stageToClient(page, 690, 300)
    ]);
    for (const point of points.slice(1)) await page.mouse.click(point.x, point.y);
    await page.getByRole('button', { name: 'Done Adding', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Solve', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Apply Candidate', exact: true })).toBeEnabled({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Reroll', exact: true })).toBeEnabled();
    await expect(page.locator('#gravity-sculpt-panel')).toContainText('Candidate 1 / 4');
    const firstPreview = await page.evaluate(() => window.game.levelEditor.gravitySculptController.state.preview);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('#gravity-sculpt-panel')).toContainText('Candidate 2 / 4');
    const secondPreview = await page.evaluate(() => window.game.levelEditor.gravitySculptController.state.preview);
    expect(secondPreview).not.toEqual(firstPreview);
    const firstSeed = await page.evaluate(() =>
        window.game.levelEditor.gravitySculptController.state.result.seed
    );
    await page.getByRole('button', { name: 'Reroll', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Apply Candidate', exact: true })).toBeEnabled({ timeout: 15000 });
    await expect.poll(() => page.evaluate(
        seed => window.game.levelEditor.gravitySculptController.state.result.seed !== seed,
        firstSeed
    )).toBe(true);
    const before = await page.evaluate(() => ({
        position: { ...window.game.planets[0].position },
        mass: window.game.planets[0].mass
    }));
    await expect.poll(() => page.evaluate(() =>
        window.game.levelEditor.gravitySculptController.state.preview.length
    )).toBeGreaterThan(1);
    await page.getByRole('button', { name: 'Test Candidate', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.game.levelEditor.mode)).toBe('play');
    await expect.poll(() => page.evaluate(() => window.game.penguin.state)).toBe('soaring');
    await page.getByRole('button', { name: 'Reject & Restore', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.game.levelEditor.mode)).toBe('edit');
    await expect.poll(() => page.evaluate(() => ({
        position: { ...window.game.planets[0].position },
        mass: window.game.planets[0].mass
    }))).toEqual(before);
    await page.getByRole('button', { name: 'Test Candidate', exact: true }).click();
    await page.getByRole('button', { name: 'Accept Tested Layout', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.game.levelEditor.mode)).toBe('edit');
    const applied = await page.evaluate(() => ({
        position: { ...window.game.planets[0].position },
        mass: window.game.planets[0].mass
    }));
    expect(applied).not.toEqual(before);
    await page.keyboard.press('Control+KeyZ');
    await expect.poll(() => page.evaluate(() => ({
        position: { ...window.game.planets[0].position },
        mass: window.game.planets[0].mass
    }))).toEqual(before);
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

    test('confirmation actions remain usable through the scaled touch canvas', async ({ page }) => {
        await useDeterministicLevel(page);
        await page.goto('/');
        await waitForGame(page);

        const startButton = page.getByRole('button', { name: 'TAP TO LAUNCH', exact: true });
        await expect(startButton).toBeVisible();
        await startButton.click();
        await waitForGame(page, 'playing');

        await page.keyboard.press('Escape');
        await expect.poll(() => page.evaluate(() => window.game.state)).toBe('paused');
        const keepPlaying = await stageToClient(page, 485, 356);
        await page.touchscreen.tap(keepPlaying.x, keepPlaying.y);

        await expect.poll(() => page.evaluate(() => window.game.state)).toBe('playing');
        await expect.poll(() => page.evaluate(() => window.game.uiManager.activeScreens.length)).toBe(0);
    });
});
