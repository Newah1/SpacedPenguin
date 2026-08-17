export const API_VERSIONS = Object.freeze({
    apiVersion: 1,
    schemaVersion: 1,
    proofVersion: 1,
    simulationVersion: 1,
    scoreVersion: 1
});

export const SERVER_LIMITS = Object.freeze({
    publicationBodyBytes: 128 * 1024,
    scoreBodyBytes: 16 * 1024,
    maxObjects: 128,
    maxDepth: 12,
    maxNameLength: 80,
    maxDescriptionLength: 1000,
    maxSearchLength: 80,
    maxActions: 20,
    maxLaunches: 10,
    maxRunTicks: 10800,
    maxPageSize: 100,
    defaultLevelPageSize: 24,
    defaultScorePageSize: 10,
    retainedScoresPerLevel: 1000
});

export function loadServerConfig(env = process.env) {
    return {
        host: env.LEVEL_SERVER_HOST || '127.0.0.1',
        port: Number.parseInt(env.LEVEL_SERVER_PORT || '3000', 10),
        databasePath: env.LEVEL_SERVER_DATABASE || 'spaced-penguin-levels.sqlite',
        corsOrigin: env.LEVEL_SERVER_CORS_ORIGIN || null
    };
}
