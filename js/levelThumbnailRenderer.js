import { LevelLoader } from './levelLoader.js';
import { Physics } from './physics.js';
import { STAGE_HEIGHT, STAGE_WIDTH } from './viewport.js';

const THUMBNAIL_WIDTH = 240;
const THUMBNAIL_HEIGHT = 160;

function createRenderWorld(assetLoader) {
    return {
        physics: new Physics(),
        gameObjects: [],
        planets: [],
        bonuses: [],
        textObjects: [],
        pointingArrows: [],
        arrow: null,
        tries: 0,
        distance: 0,
        planetCollisions: 0,
        simulationTime: 0,
        _cachedSortedObjects: null,
        _gameObjectsChanged: true,
        addGameObject(object) {
            this.gameObjects.push(object);
            this._gameObjectsChanged = true;
        },
        setState(state) {
            this.state = state;
        },
        assetLoader
    };
}

function drawStarfield(context, stars = []) {
    context.fillStyle = '#000';
    context.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    context.fillStyle = '#fff';
    for (const star of stars) {
        context.globalAlpha = Math.min(1, 0.35 + (star.size || 1) * 0.18);
        context.fillRect(star.x, star.y, star.size || 1, star.size || 1);
    }
    context.globalAlpha = 1;
}

/**
 * Builds an isolated world through the production level loader and renders its
 * real game objects. It never swaps or mutates the player's active world.
 */
export function createLevelThumbnail(level, {
    assetLoader,
    stars = [],
    width = THUMBNAIL_WIDTH,
    height = THUMBNAIL_HEIGHT
} = {}) {
    if (typeof document === 'undefined' || !assetLoader) return '';

    const stageCanvas = document.createElement('canvas');
    stageCanvas.width = STAGE_WIDTH;
    stageCanvas.height = STAGE_HEIGHT;
    const stageContext = stageCanvas.getContext('2d');
    if (!stageContext) return '';

    const loader = new LevelLoader(assetLoader);
    const world = createRenderWorld(assetLoader);
    const key = 'thumbnail';
    loader.levels.set(key, level);
    loader.loadLevel(key, world);

    drawStarfield(stageContext, stars);
    const objects = [...world.gameObjects].sort((left, right) =>
        (left.renderOrder || 0) - (right.renderOrder || 0));
    for (const object of objects) object.draw(stageContext);

    const thumbnail = document.createElement('canvas');
    thumbnail.width = width;
    thumbnail.height = height;
    const context = thumbnail.getContext('2d');
    if (!context) return '';
    context.drawImage(stageCanvas, 0, 0, width, height);
    return thumbnail.toDataURL('image/png');
}
