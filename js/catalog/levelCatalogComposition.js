import { readAppConfig } from '../config/appConfig.js';
import { LevelCatalogService, LocalLevelCatalogSource } from './levelCatalogService.js';
import { RemoteLevelCatalogSource } from './remoteLevelCatalogSource.js';
import { OfficialLevelCatalogSource } from './officialLevelCatalogSource.js';

export function createConfiguredLevelCatalog(repository, {
    levelLoader,
    appConfig,
    fetchImpl = globalThis.fetch,
    location = globalThis.location,
    logger = globalThis.console
} = {}) {
    const config = readAppConfig(appConfig, { location, logger });
    const sources = [];
    if (levelLoader) sources.push(new OfficialLevelCatalogSource(levelLoader, { fetchImpl }));
    sources.push(new LocalLevelCatalogSource(repository));
    if (config.levelServer.baseUrl) {
        sources.push(new RemoteLevelCatalogSource({
            baseUrl: config.levelServer.baseUrl,
            requestTimeoutMs: config.levelServer.requestTimeoutMs,
            fetchImpl
        }));
    }
    return new LevelCatalogService({ sources, defaultSource: levelLoader ? 'official' : 'local' });
}
