import { advanceOrbitGraphMutable, compileOrbitGraph } from '../orbitSimulation.js';
import { LevelOrbitType } from '../levelSchema.js';
import { PHYSICS_CONFIG } from '../config/gameConfig.js';

const MAX_PREVIEW_STEP_SECONDS = 1 / 20;
const PREVIEW_ALPHA = 0.62;

function clonePoint(point) {
    return point ? { x: point.x, y: point.y } : null;
}

function objectPosition(object) {
    if (!object) return null;
    if (object.position && Number.isFinite(object.position.x) && Number.isFinite(object.position.y)) {
        return clonePoint(object.position);
    }
    if (Number.isFinite(object.x) && Number.isFinite(object.y)) {
        return { x: object.x, y: object.y };
    }
    return null;
}

function cloneOrbitParams(params = {}) {
    return {
        ...params,
        ...(params.initialPosition ? { initialPosition: clonePoint(params.initialPosition) } : {}),
        ...(params.initialVelocity ? { initialVelocity: clonePoint(params.initialVelocity) } : {}),
        ...(Array.isArray(params.gravitySources)
            ? {
                gravitySources: params.gravitySources.map(source => ({
                    ...source,
                    ...(source.position ? { position: clonePoint(source.position) } : {})
                }))
            }
            : {})
    };
}

export function prepareCloneForInsertion(clone) {
    if (!clone) return clone;
    // A clone is a new authored entity. Runtime identity and generated display
    // name belong to the source object and must never be copied across.
    if ('id' in clone) clone.id = null;
    if ('name' in clone) clone.name = '';
    return clone;
}

export function findObjectBodyAtPosition(editor, x, y) {
    const objects = editor.getAllGameObjects();
    for (let index = objects.length - 1; index >= 0; index--) {
        const object = objects[index];
        if (editor.isPointInObject(x, y, object)) return object;
    }
    return null;
}

function isMovingOrbit(orbitSystem) {
    if (!orbitSystem) return false;
    if (orbitSystem.orbitType === LevelOrbitType.DIRECTOR_GRAVITY) {
        return Array.isArray(orbitSystem.orbitParams?.gravitySources) &&
            orbitSystem.orbitParams.gravitySources.length > 0;
    }
    if (!orbitSystem.orbitCenter && !orbitSystem.orbitTargetId) return false;
    if (orbitSystem.orbitType === LevelOrbitType.GRAVITY) return true;
    return Number.isFinite(orbitSystem.orbitRadius) && orbitSystem.orbitRadius > 0 &&
        Number.isFinite(orbitSystem.orbitSpeed) && orbitSystem.orbitSpeed !== 0;
}

function orbitSnapshot(orbitSystem, targetId) {
    if (!isMovingOrbit(orbitSystem)) return null;
    const params = cloneOrbitParams(orbitSystem.orbitParams || {});
    const initialVelocity = params.initialVelocity || orbitSystem.velocity || { x: 0, y: 0 };
    return {
        type: orbitSystem.orbitType,
        center: clonePoint(orbitSystem.orbitCenter),
        targetId,
        radius: orbitSystem.orbitRadius ?? 0,
        speed: orbitSystem.orbitSpeed ?? 0,
        angle: orbitSystem.orbitAngle ?? 0,
        params,
        velocity: clonePoint(initialVelocity),
        frameAccumulator: 0,
        gravityStrength: params.gravityStrength ?? orbitSystem.gravityStrength ?? PHYSICS_CONFIG.orbit.gravityStrength,
        maxGravityAccel: orbitSystem.maxGravityAccel ?? PHYSICS_CONFIG.orbit.maxGravityAcceleration
    };
}

function authoredSignature(objects) {
    return JSON.stringify(objects.map(object => {
        const orbit = object.orbitSystem;
        return {
            type: object.constructor?.name || '',
            id: object.id ?? null,
            position: objectPosition(object),
            orbit: orbit ? {
                center: clonePoint(orbit.orbitCenter),
                targetId: orbit.orbitTargetId ?? null,
                radius: orbit.orbitRadius ?? 0,
                speed: orbit.orbitSpeed ?? 0,
                angle: orbit.orbitAngle ?? 0,
                type: orbit.orbitType ?? null,
                params: cloneOrbitParams(orbit.orbitParams || {}),
                velocity: clonePoint(orbit.velocity || { x: 0, y: 0 }),
                gravityStrength: orbit.gravityStrength ?? null,
                maxGravityAccel: orbit.maxGravityAccel ?? null
            } : null
        };
    }));
}

export class EditorRuntimeController {
    constructor(editor, options = {}) {
        this.editor = editor;
        this.now = options.now || (() => (globalThis.performance?.now?.() ?? Date.now()) / 1000);
        this.previewEntities = [];
        this.previewObjects = [];
        this.previewIndexByObject = new WeakMap();
        this.previewGraph = null;
        this.signature = null;
        this.lastPreviewTime = null;
        this.installEditorHooks();
    }

    installEditorHooks() {
        const editor = this.editor;
        if (editor.__runtimeControllerHooksInstalled) return;
        editor.__runtimeControllerHooksInstalled = true;

        const cloneObject = editor.cloneObject.bind(editor);
        editor.cloneObject = object => prepareCloneForInsertion(cloneObject(object));

        // Object bodies are the primary editing target. Orbit-center handles
        // remain selectable only where they are not hidden underneath a body.
        editor.getObjectAtPosition = (x, y) =>
            findObjectBodyAtPosition(editor, x, y) || editor.getOrbitCenterAtPosition(x, y);

        const updateDragging = editor.updateDragging.bind(editor);
        editor.updateDragging = (x, y) => {
            updateDragging(x, y);
            editor.game?.invalidateSimulationState?.();
            this.invalidatePreview();
        };

        const updateOrbitCenterDragging = editor.updateOrbitCenterDragging.bind(editor);
        editor.updateOrbitCenterDragging = (x, y) => {
            updateOrbitCenterDragging(x, y);
            editor.game?.invalidateSimulationState?.();
            this.invalidatePreview();
        };
    }

    invalidatePreview() {
        this.signature = null;
        this.lastPreviewTime = null;
    }

    rebuildPreview(objects, signature) {
        this.previewObjects = objects;
        this.previewEntities = [];
        this.previewIndexByObject = new WeakMap();

        const syntheticIdByObject = new WeakMap();
        const objectByAuthoredId = new Map();
        objects.forEach((object, index) => {
            syntheticIdByObject.set(object, `__editor_preview_${index + 1}`);
            if (object.id && !objectByAuthoredId.has(object.id)) objectByAuthoredId.set(object.id, object);
        });

        for (const object of objects) {
            const position = objectPosition(object);
            if (!position) continue;
            const targetObject = object.orbitSystem?.orbitTargetId
                ? objectByAuthoredId.get(object.orbitSystem.orbitTargetId)
                : null;
            const targetId = targetObject ? syntheticIdByObject.get(targetObject) : null;
            const orbit = orbitSnapshot(object.orbitSystem, targetId);
            const startPosition = orbit?.type === LevelOrbitType.GRAVITY && orbit.params?.initialPosition
                ? clonePoint(orbit.params.initialPosition)
                : position;
            const entity = {
                id: syntheticIdByObject.get(object),
                position: startPosition,
                radius: object.radius,
                mass: object.mass,
                gravitationalReach: object.gravitationalReach,
                orbit
            };
            this.previewIndexByObject.set(object, this.previewEntities.length);
            this.previewEntities.push(entity);
        }

        // Director-gravity sources refer to authored IDs. Translate them onto
        // preview-only IDs so the shared orbit graph can resolve them safely.
        for (const object of objects) {
            const index = this.previewIndexByObject.get(object);
            if (index === undefined) continue;
            const orbit = this.previewEntities[index].orbit;
            if (orbit?.type !== LevelOrbitType.DIRECTOR_GRAVITY) continue;
            orbit.params.gravitySources = (orbit.params.gravitySources || []).map(source => {
                const target = source.targetId ? objectByAuthoredId.get(source.targetId) : null;
                return {
                    ...source,
                    targetId: target ? syntheticIdByObject.get(target) : null
                };
            });
        }

        this.previewGraph = compileOrbitGraph(this.previewEntities);
        this.signature = signature;
        this.lastPreviewTime = this.now();
    }

    syncPreview() {
        const objects = this.editor.getAllGameObjects();
        const signature = authoredSignature(objects);
        if (signature !== this.signature) this.rebuildPreview(objects, signature);
        return objects;
    }

    advancePreview() {
        this.syncPreview();
        const now = this.now();
        if (this.lastPreviewTime === null) {
            this.lastPreviewTime = now;
            return;
        }
        const deltaTime = Math.min(
            MAX_PREVIEW_STEP_SECONDS,
            Math.max(0, now - this.lastPreviewTime)
        );
        this.lastPreviewTime = now;
        if (deltaTime > 0 && this.previewGraph) {
            advanceOrbitGraphMutable(this.previewEntities, deltaTime, this.previewGraph);
        }
    }

    getPreviewPosition(object) {
        this.advancePreview();
        const index = this.previewIndexByObject.get(object);
        if (index === undefined) return null;
        const entity = this.previewEntities[index];
        return entity?.orbit ? clonePoint(entity.position) : null;
    }

    draw(ctx) {
        this.advancePreview();
        const editor = this.editor;
        for (const object of this.previewObjects) {
            if (!isMovingOrbit(object.orbitSystem)) continue;
            if (editor.dragging && editor.selectedObject === object) continue;
            if (editor.draggingOrbitCenter && editor.orbitCenterObject === object) continue;
            const index = this.previewIndexByObject.get(object);
            const position = index === undefined ? null : this.previewEntities[index]?.position;
            if (!position || typeof object.draw !== 'function') continue;

            const authoredPosition = objectPosition(object);
            const originalPosition = object.position;
            const originalX = object.x;
            const originalY = object.y;
            const originalAlpha = object.alpha;

            try {
                if (object.position) object.position = clonePoint(position);
                else {
                    object.x = position.x;
                    object.y = position.y;
                }
                if (typeof object.alpha === 'number') object.alpha = originalAlpha * PREVIEW_ALPHA;
                object.draw(ctx);

                ctx.save();
                ctx.globalAlpha = 0.8;
                ctx.strokeStyle = '#7fe7ff';
                ctx.lineWidth = 1.5 / (editor.editorCamera?.scale || 1);
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(position.x, position.y, Math.max(5, (object.radius || 12) * 0.35), 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            } finally {
                if (originalPosition) object.position = originalPosition;
                else {
                    object.x = originalX;
                    object.y = originalY;
                }
                if (typeof originalAlpha === 'number') object.alpha = originalAlpha;
            }

            // Keep the authoring anchor visually meaningful when the preview
            // has moved away from it.
            if (authoredPosition && Math.hypot(position.x - authoredPosition.x, position.y - authoredPosition.y) > 1) {
                ctx.save();
                ctx.globalAlpha = 0.45;
                ctx.fillStyle = '#7fe7ff';
                ctx.beginPath();
                ctx.arc(authoredPosition.x, authoredPosition.y, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
    }
}

export default EditorRuntimeController;
