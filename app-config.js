// Deployment-owned configuration. Set levelServer.baseUrl to opt into the
// community catalog; leaving it null keeps the game completely local-only.
globalThis.__SPACED_PENGUIN_APP_CONFIG__ = {
    levelServer: {
        baseUrl: null,
        requestTimeoutMs: 8000
    }
};
