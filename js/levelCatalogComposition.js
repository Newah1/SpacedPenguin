import { readAppConfig } from './appConfig.js';
import { LevelCatalogService, LocalLevelCatalogSource } from './levelCatalogService.js';
import { RemoteLevelCatalogSource } from './remoteLevelCatalogSource.js';

export function createConfiguredLevelCatalog(repository, {
    appConfig,
    fetchImpl = globalThis.fetch,
    location = globalThis.location,
    logger = globalThis.console
} = {}) {
    const config = readAppConfig(appConfig, { location, logger });
    const sources = [new LocalLevelCatalogSource(repository)];
    if (config.levelServer.baseUrl) {
        sources.push(new RemoteLevelCatalogSource({
            baseUrl: config.levelServer.baseUrl,
            requestTimeoutMs: config.levelServer.requestTimeoutMs,
            fetchImpl
        }));
    }
    return new LevelCatalogService({ sources, defaultSource: 'local' });
}
