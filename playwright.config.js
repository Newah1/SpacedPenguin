import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    globalSetup: './e2e/globalSetup.js',
    timeout: 60_000,
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    // Every page decodes the complete audio manifest during bootstrap. Letting
    // Playwright default to one worker per logical CPU overwhelms Chromium's
    // media threads and turns ordinary 5-15 second smoke flows into 30-second
    // whole-test timeouts on developer machines.
    workers: process.env.CI ? 1 : 4,
    reporter: process.env.CI
        ? [['github'], ['html', { open: 'never' }]]
        : [['list']],
    use: {
        baseURL: 'http://127.0.0.1:4173',
        viewport: { width: 1280, height: 900 },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    },
    projects: [
        {
            name: 'chromium',
            use: { browserName: 'chromium' }
        }
    ]
});
