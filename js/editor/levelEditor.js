import { GameState } from '../runtime/gameState.js';
import plog from '../diagnostics/penguinLogger.js';
import { LevelOrbitType, normalizeLevelObjectType } from '../levels/levelSchema.js';
import { STAGE_WIDTH, STAGE_HEIGHT, createWorldCamera, screenToStage, stageToScreen } from '../rendering/viewport.js';
import { EDITOR_CONFIG } from '../config/editorConfig.js';
import { LEVEL_DEFAULTS, PHYSICS_CONFIG } from '../config/gameConfig.js';
import {
    COMMON_OBJECT_PROPERTY_FIELDS,
    EDITOR_INSPECTOR_DEFAULTS,
    EDITOR_NUMERIC_FALLBACKS,
    EDITOR_SPRITE_OPTIONS,
    LEVEL_SETTING_FIELDS,
    ORBIT_PROPERTY_FIELDS,
    WAYPOINT_PROPERTY_FIELDS
} from '../config/editorInspectorConfig.js';
import {
    listEditableRuntimeClassNames,
    getEditorActionDefinition,
    getGameObjectDefinition
} from '../runtime/gameObjectRegistry.js';
import { createLiveEditHistory, LiveEditCommandType } from './commands/live/index.js';
import LevelEditorOverlayRenderer from './views/overlayRenderer.js';
import LevelEditorObjectListView from './views/objectListView.js';
import LevelEditorInspectorView from './views/inspectorView.js';
import LevelEditorToolbarView from './views/toolbarView.js';
import LevelEditorCanvasInputController from './controllers/canvasInputController.js';
import GravitySculptView from './views/gravitySculptView.js';
import GravitySculptController from './controllers/gravitySculptController.js';
import PublishMetadataPromptView from './views/publishMetadataPromptView.js';
import EditorEvents, { EditorEventType } from './state/editorEvents.js';
import EditorState, { EditorInteractionType } from './state/editorState.js';
import EditorSelection from './state/editorSelection.js';
import EditorObjectService from './services/editorObjectService.js';
import EditorRuntimeProjector from './services/editorRuntimeProjector.js';
import LevelDocument from './state/levelDocument.js';
import EditorToolManager from './controllers/editorToolManager.js';
import EditorCommandBus from './commands/editorCommandBus.js';
import {
    EditorCommandIntent,
    registerDeleteObjectCommandStrategies
} from './commands/deleteObjectCommandStrategies.js';
import DocumentMutationService from './services/documentMutationService.js';
import { projectDocumentDefinition } from './services/documentProjectionTransaction.js';
import { createButton } from '../ui/buttonFramework.js';
import * as runtimeEdits from './services/legacyRuntimeEdits.js';
import {
    INPUT_CONFIG,
    isCompactEditorViewport,
    isTouchViewport
} from '../config/inputConfig.js';

class LevelEditor {
    constructor(game) {
        this.game = game;
        this.events = new EditorEvents();
        this.state = new EditorState();
        this.runtimeProjector = new EditorRuntimeProjector(game);
        this.documentMutations = new DocumentMutationService({
            getPlayfieldCenter: () => this.getPlayfieldCenter()
        });
        this.objectService = new EditorObjectService(this);
        this.levelSettingsNode = { isLevelSettings: true };
        this.selection = new EditorSelection({
            events: this.events,
            resolveObject: id => this.objectService.find(id),
            levelSettingsNode: this.levelSettingsNode
        });
        Object.defineProperties(this, {
            active: {
                configurable: true,
                get: () => this.state.active,
                set: value => { this.state.active = Boolean(value); }
            },
            mode: {
                configurable: true,
                get: () => this.state.mode,
                set: value => {
                    if (this.state.mode === value) return;
                    this.state.mode = value;
                    this.events.emit('modeChanged', { mode: value });
                }
            },
            editorCamera: {
                configurable: true,
                get: () => this.state.camera,
                set: value => { this.state.camera = value; }
            },
            spacePan: {
                configurable: true,
                get: () => this.state.spacePan,
                set: value => { this.state.spacePan = Boolean(value); }
            },
            selectedObject: {
                configurable: true,
                get: () => this.selection.get(),
                set: value => { this.selection.selectValue(value); }
            },
            dragging: {
                configurable: true,
                get: () => this.state.interaction.type === EditorInteractionType.DRAG_OBJECT,
                set: () => {}
            },
            draggingOrbitCenter: {
                configurable: true,
                get: () => this.state.interaction.type === EditorInteractionType.DRAG_ORBIT_CENTER,
                set: () => {}
            },
            draggingWaypoint: {
                configurable: true,
                get: () => this.state.interaction.type === EditorInteractionType.DRAG_WAYPOINT,
                set: () => {}
            },
            panning: {
                configurable: true,
                get: () => this.state.interaction.type === EditorInteractionType.PAN,
                set: () => {}
            },
            orbitCenterObject: {
                configurable: true,
                get: () => this.state.interaction.type === EditorInteractionType.DRAG_ORBIT_CENTER
                    ? this.objectService.find(this.state.interaction.objectId)
                    : null,
                set: () => {}
            }
        });
        this.commandContext = {
            refresh: selection => this.refreshAfterHistory(selection),
            resolveObject: id => this.objectService.find(id),
            addObjectDefinition: (definition, index) => this.addDocumentObject(definition, index),
            removeObjectDefinition: id => this.removeDocumentObject(id),
            getObjectDefinition: id => this.getDocumentObjectSnapshot(id),
            applyDocumentPatches: patches => this.applyDocumentPatches(patches),
            documentDefinition: () => this.document.toDefinition(),
            applyDocumentDefinition: definition => this.applyDocumentDefinition(definition),
            mutateObjectProperty: (definition, id, property, value) =>
                this.documentMutations.setObjectProperty(definition, id, property, value),
            mutateObjectPosition: (definition, id, position) =>
                this.documentMutations.setObjectPosition(definition, id, position),
            mutateOrbitCenter: (definition, id, center) =>
                this.documentMutations.setOrbitCenter(definition, id, center),
            mutateWaypoint: (definition, id, index, position) =>
                this.documentMutations.setWaypoint(definition, id, index, position),
            mutateLevelSetting: (definition, property, value) =>
                this.documentMutations.setLevelSetting(definition, property, value),
            mutateObjectAction: (definition, id, action) => action === 'gravity-orbit.reset'
                ? this.documentMutations.resetGravityOrbit(definition, id)
                : null,
            mutatePlanetAdjustments: (definition, adjustments) =>
                this.documentMutations.applyPlanetAdjustments(definition, adjustments),
            levelSettingsTarget: this.levelSettingsNode,
            liveTransaction: false
        };
        const history = createLiveEditHistory(this.commandContext);
        this.commandBus = new EditorCommandBus({
            history,
            events: this.events,
            canExecute: () => !this.active || this.mode === 'edit',
            validate: () => this.document ? this.assertDocumentValid('editor command') : true
        });
        this.events.on(EditorEventType.DOCUMENT_CHANGED, () => {
            if (this.document) this.game.loadedLevelDefinition = this.document.toDefinition();
        });
        this.commandStrategyUnsubscribe = registerDeleteObjectCommandStrategies({
            commandBus: this.commandBus,
            findPortal: id => this.game.portals.find(portal => portal.id === id),
            logger: plog
        });
        this.propertyEditSession = 0;
        this.overlayRenderer = new LevelEditorOverlayRenderer(this);
        this.objectListView = new LevelEditorObjectListView(this);
        this.inspectorView = new LevelEditorInspectorView(this);
        this.toolbarView = new LevelEditorToolbarView(this);
        this.gravitySculptView = new GravitySculptView(this);
        this.gravitySculptController = new GravitySculptController(this);
        this.publishMetadataPromptView = new PublishMetadataPromptView(this);
        this.toolManager = new EditorToolManager(this);
        this.canvasInput = new LevelEditorCanvasInputController(this);
        this.previousGameState = null;
        this.propertiesPanel = null;
        this.createUI();
        // Note: Event listeners are managed by InputManager contexts.
    }
    
    createUI() {
        this.container = document.createElement('div');
        this.container.id = 'level-editor';
        this.container.className = 'level-editor-root';
        Object.assign(this, this.toolbarView.createElements());
        this.propertiesPanel = this.inspectorView.createElement();
        this.createObjectListPanel();
        this.gravitySculptPanel = this.gravitySculptView.createElement();
        this.container.append(
            this.toolbarWrapper,
            this.propertiesPanel,
            this.objectListPanel,
            this.mobileToolbar,
            this.gravitySculptPanel
        );
        document.body.appendChild(this.container);
    }

    createObjectListPanel() {
        this.objectListPanel = this.objectListView.createElement();
    }
    
    openCollapsibleSection() { this.toolbarView.open(); }
    closeCollapsibleSection() { this.toolbarView.close(); }

    showMobileAddMenu() {
        if (this.mode !== 'edit') return;
        const view = this.editorCamera?.viewRect || this.game.stageRect;
        const centerX = view.x + view.width / 2;
        const centerY = view.y + view.height / 2;
        this.showContextMenu(centerX, centerY);
    }
    
    deleteSelectedObject() {
        const object = this.selectedObject;
        if (!object) return false;
        return this.commandBus.emit(EditorCommandIntent.DELETE_SELECTED_OBJECT, { object });
    }
    
    async saveLevel() {
        if (this.saveButton.disabled) return;
        this.saveButton.disabled = true;
        this.toolbarView.showStatus('Saving…', 'pending');
        try {
            this.assertDocumentValid('editor save');
            const record = await this.game.saveEditedLevel();
            this.markClean();
            this.toolbarView.showStatus(`Saved “${record.name}” to this browser.`);
            return record;
        } catch (error) {
            plog.error('Failed to save level:', error);
            this.toolbarView.showStatus(error.message || 'Unable to save this level.', 'error');
            return null;
        } finally {
            this.saveButton.disabled = false;
        }
    }

    async publishLevel() {
        if (this.publishButton.disabled) return;
        const metadata = await this.promptForPublishMetadata();
        if (!metadata) return null;
        this.applyPublishMetadata(metadata);
        this.assertDocumentValid('editor publish');
        this.publishButton.disabled = true;
        this.toolbarView.showStatus('Publishing…', 'pending');
        try {
            const published = await this.game.publishEditedLevel();
            this.toolbarView.showStatus(`Published “${published.name || this.game.levelMetadata?.name}” to Community Levels.`);
            return published;
        } catch (error) {
            plog.error('Failed to publish level:', error);
            this.toolbarView.showStatus(error.message || 'Unable to publish this level.', 'error');
            return null;
        } finally {
            this.updatePublishAvailability();
        }
    }

    applyPublishMetadata({ name, description }) {
        if (this.commandBus && this.mode === 'edit') {
            this.commandBus.execute(LiveEditCommandType.SET_LEVEL_SETTING, {
                property: 'levelName',
                value: name,
                sessionId: ++this.propertyEditSession
            }, { source: 'publish-metadata' });
            this.commandBus.execute(LiveEditCommandType.SET_LEVEL_SETTING, {
                property: 'levelDescription',
                value: description,
                sessionId: ++this.propertyEditSession
            }, { source: 'publish-metadata' });
        } else {
            this.game.levelMetadata ||= {};
            this.game.levelMetadata.name = name;
            this.game.levelMetadata.description = description;
        }
        for (const definition of [
            this.game.completedRun?.level,
            this.game.recordedRunLevel,
            this.game.loadedLevelDefinition
        ]) {
            if (!definition) continue;
            definition.name = name;
            definition.description = description;
        }
    }

    promptForPublishMetadata() {
        return this.publishMetadataPromptView.prompt();
    }

    loadLevel() {
        this.game.showLevelBrowser({ mode: 'open' });
    }

    exitToMenu() {
        this.game.uiManager.closeAllScreens();
        this.exit();
        this.game.returnToMenu();
    }
    
    undo() {
        const undone = this.commandBus.undo();
        if (!undone) plog.info('Nothing to undo');
    }
    
    redo() {
        const redone = this.commandBus.redo();
        if (!redone) plog.info('Nothing to redo');
    }
    
    handleResize() {
        if (!this.active) return;
        this.toolbarView.resize();
        this.inspectorView.resize();
        this.objectListView.resize();
    }
    
    // Unified pointer event handlers (mouse + touch)
    handlePointerDown(event) { this.canvasInput.handlePointerDown(event); }
    handlePointerMove(event) { this.canvasInput.handlePointerMove(event); }
    handlePointerUp(event) { this.canvasInput.handlePointerUp(event); }
    handlePointerCancel(event) { this.canvasInput.handlePointerCancel(event); }
    handleRightClick(event) { this.canvasInput.handleContextMenu(event); }
    cancelLongPress() { this.canvasInput.cancelLongPress(); }

    getPlayfieldCenter() {
        const stage = this.game.stageRect;
        return { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 };
    }

    fitEditorCamera() {
        this.editorCamera = createWorldCamera(this.game.stageRect, { mode: 'fit' });
        if (this.active && this.mode === 'edit') {
            this.game.viewRect = this.editorCamera.viewRect;
            this.game.arrow?.setStageRect(this.editorCamera.viewRect);
        }
    }

    setEditorCamera(center, zoom = this.editorCamera?.scale || 1) {
        const limits = EDITOR_CONFIG.playfield;
        const clampedZoom = Math.max(limits.minimumZoom, Math.min(zoom, limits.maximumZoom));
        this.editorCamera = createWorldCamera(
            this.game.stageRect,
            { mode: 'follow', zoom: clampedZoom },
            center
        );
        this.game.viewRect = this.editorCamera.viewRect;
        this.game.arrow?.setStageRect(this.editorCamera.viewRect);
    }

    centerEditorOn(position) {
        if (!position) return;
        this.setEditorCamera(position, this.editorCamera?.scale || 1);
    }

    zoomEditorAt(screenX, screenY, direction) {
        if (!this.editorCamera) this.fitEditorCamera();
        const world = screenToStage(
            this.game.canvas,
            this.game.viewport,
            screenX,
            screenY,
            this.editorCamera
        );
        const logical = screenToStage(this.game.canvas, this.game.viewport, screenX, screenY);
        const factor = direction < 0
            ? EDITOR_CONFIG.playfield.wheelZoomFactor
            : 1 / EDITOR_CONFIG.playfield.wheelZoomFactor;
        const zoom = Math.max(
            EDITOR_CONFIG.playfield.minimumZoom,
            Math.min(this.editorCamera.scale * factor, EDITOR_CONFIG.playfield.maximumZoom)
        );
        this.setEditorCamera({
            x: world.x + (STAGE_WIDTH / 2 - logical.x) / zoom,
            y: world.y + (STAGE_HEIGHT / 2 - logical.y) / zoom
        }, zoom);
    }

    enter() {
        if (this.active) return;
        this.previousGameState = this.game.state;
        this.commandBus.clear();
        this.runtimeProjector.indexRuntimeObjects();
        this.objectService.ensureIdentities();
        if (!this.game.loadedLevelDefinition) {
            throw new Error('Cannot enter the level editor without an authored level definition');
        }
        this.document = LevelDocument.fromDefinition(this.game.loadedLevelDefinition);
        this.game.loadedLevelDefinition = this.document.toDefinition();
        this.active = true;
        this.container.style.display = 'block';
        if (typeof this.game.setState === 'function') this.game.setState(GameState.LEVEL_EDITOR);
        else this.game.state = GameState.LEVEL_EDITOR;
        this.mode = 'edit';
        this.fitEditorCamera();
        this.updateModeButton();
        this.populateObjectButtons();
        
        this.updateObjectList();
        this.markClean();
        
        // Notify fullscreen manager about level editor state change
        if (this.game.fullscreenManager) {
            this.game.fullscreenManager.setLevelEditorMode(true);
        }
    }
    
    exit() {
        if (!this.active) return;
        this.publishMetadataPromptView.cancel();
        this.gravitySculptController.close();
        this.canvasInput.cancelPointer();
        this.active = false;
        this.container.style.display = 'none';
        this.selectObject(null);
        this.game?.invalidateSimulationState?.();
        const nextState = this.previousGameState ?? GameState.PLAYING;
        this.previousGameState = null;
        if (typeof this.game.setState === 'function') this.game.setState(nextState);
        else this.game.state = nextState;
        
        // Notify fullscreen manager about level editor state change
        if (this.game.fullscreenManager) {
            this.game.fullscreenManager.setLevelEditorMode(false);
        }
    }
    
    toggle() {
        if (this.active) {
            this.exit();
        } else {
            this.enter();
        }
    }
    
    toggleMode() {
        if (this.mode === 'edit') {
            this.gravitySculptController.close();
            this.canvasInput.cancelPointer();
            const definition = this.currentDocumentDefinition();
            this.assertDocumentValid('editor play test');
            const metadata = structuredClone(this.game.levelMetadata || {});
            this.playDefinition = structuredClone(definition);
            this.game.loadLevel(structuredClone(this.playDefinition));
            this.game.recordedRunLevel = structuredClone(this.playDefinition);
            this.runtimeProjector.indexRuntimeObjects();
            this.game.levelMetadata = { ...metadata, name: definition.name, description: definition.description };
            this.mode = 'play';
            this.game?.invalidateSimulationState?.();
        } else {
            const definition = this.document?.toDefinition();
            if (definition) {
                const metadata = structuredClone(this.game.levelMetadata || {});
                const completedRun = this.game.completedRun
                    ? structuredClone(this.game.completedRun)
                    : null;
                const recordedRunLevel = this.game.recordedRunLevel
                    ? structuredClone(this.game.recordedRunLevel)
                    : null;
                this.runtimeProjector.rebuild(definition);
                this.game.levelMetadata = metadata;
                if (
                    completedRun &&
                    JSON.stringify(completedRun.level) === JSON.stringify(definition)
                ) {
                    this.game.completedRun = completedRun;
                    this.game.recordedRunLevel = recordedRunLevel;
                } else {
                    this.game.invalidateRecordedRun();
                }
            }
            this.playDefinition = null;
            this.mode = 'edit';
            this.fitEditorCamera();
        }
        this.updateModeButton();
        plog.info('Level editor mode changed to:', this.mode);
    }
    
    updateModeButton() {
        this.toolbarView.updateMode(this.mode);
        this.updatePublishAvailability();
    }

    updatePublishAvailability() {
        this.toolbarView.updatePublishAvailability();
    }

    onPlayTestCompleted() {
        this.updatePublishAvailability();
        this.toolbarView.showStatus(
            this.game.communityLevelClient
                ? 'Play-test complete. Publishing is unlocked.'
                : 'Play-test complete. You can keep editing or save this level.'
        );
    }
    
    populateObjectButtons() {
        this.toolbarView.populate(this.getEditableObjectClasses());
    }

    getEditableObjectClasses() {
        return listEditableRuntimeClassNames(this.gameObjectClasses);
    }
    
    getOrbitCenterAtPosition(x, y) {
        const allObjects = this.getAllGameObjects();
        
        // Check each object for orbit center hits
        for (let obj of allObjects) {
            if (obj.orbitSystem && obj.orbitSystem.orbitCenter && obj.orbitSystem.orbitRadius > 0) {
                const center = obj.orbitSystem.orbitCenter;
                const distance = Math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2);
                
                // Use larger hit area for mobile devices
                const isMobile = isCompactEditorViewport() || isTouchViewport();
                const hitRadius = isMobile
                    ? EDITOR_CONFIG.interaction.orbitCenterHitRadius.touch
                    : EDITOR_CONFIG.interaction.orbitCenterHitRadius.pointer;
                
                if (distance <= hitRadius) {
                    plog.debug('Selected orbit center for:', obj.constructor.name);
                    return { type: 'orbitCenter', object: obj };
                }
            }
        }
        
        return null;
    }
    
    isPointInObject(x, y, obj, displayPosition = null) {
        // Get object coordinates - handle both position.x/y and direct x/y properties
        let objX, objY;
        if (Number.isFinite(displayPosition?.x) && Number.isFinite(displayPosition?.y)) {
            objX = displayPosition.x;
            objY = displayPosition.y;
        } else if (typeof obj.x === 'number' && typeof obj.y === 'number') {
            // Penguin class uses direct x/y properties
            objX = obj.x;
            objY = obj.y;
        } else if (obj.position && typeof obj.position.x === 'number' && typeof obj.position.y === 'number') {
            // GameObject classes use position.x/y
            objX = obj.position.x;
            objY = obj.position.y;
        } else {
            plog.warn('Skipping object with invalid coordinates:', obj.constructor.name, obj.x, obj.y, obj.position);
            return false;
        }
        
        // Use larger hit areas for mobile devices for easier touch selection
        const isMobile = isCompactEditorViewport() || isTouchViewport();
        const baseRadius = obj.radius || obj.collisionRadius || 20;
        const radius = isMobile
            ? Math.max(baseRadius, EDITOR_CONFIG.interaction.minimumTouchTargetRadius)
            : baseRadius;
        
        const dx = x - objX;
        const dy = y - objY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const hit = distance <= radius;
        
        return hit;
    }
    
    selectObject(obj) {
        this.selectedObject = obj;
        plog.debug('Selected object:', obj?.isLevelSettings ? 'Level Settings' : (obj ? obj.constructor.name : 'null'));
        
        // Provide haptic feedback on mobile devices
        if (obj && 'vibrate' in navigator) {
            navigator.vibrate(INPUT_CONFIG.hapticsMs.selection);
        }
        
        this.updatePropertiesPanel();
        this.updateObjectList(); // Refresh list to show selection
        this.toolbarView?.updateContextActions?.(obj);
    }
    
    updatePropertiesPanel() {
        this.inspectorView.render();
    }

    getEditableProperties(obj) {
        const properties = [];
        const className = obj.constructor.name;

        properties.push({
            ...COMMON_OBJECT_PROPERTY_FIELDS.name,
            value: obj.name || this.objectService.allocateName(className, obj)
        });
        
        // Position properties (handled specially due to different coordinate systems)
        let objX, objY;
        if (typeof obj.x === 'number') {
            objX = obj.x;
            objY = obj.y;
        } else if (obj.position) {
            objX = obj.position.x;
            objY = obj.position.y;
        }
        
        if (objX !== undefined) {
            properties.push({ ...COMMON_OBJECT_PROPERTY_FIELDS.x, value: objX });
            properties.push({ ...COMMON_OBJECT_PROPERTY_FIELDS.y, value: objY });
        }
        
        if (obj.rotation !== undefined) {
            properties.push({ ...COMMON_OBJECT_PROPERTY_FIELDS.rotation, value: obj.rotation });
        }
        if (obj.alpha !== undefined) {
            properties.push({ ...COMMON_OBJECT_PROPERTY_FIELDS.alpha, value: obj.alpha });
        }
        if (obj.visible !== undefined) {
            properties.push({ ...COMMON_OBJECT_PROPERTY_FIELDS.visible, value: obj.visible });
        }
        
        // Class-specific properties using reflection
        const specificProps = this.getClassSpecificProperties(obj, className);
        properties.push(...specificProps);
        
        // Add orbit properties for objects that have orbit systems
        if (obj.orbitSystem) {
            const orbitProps = this.getOrbitProperties(obj);
            properties.push(...orbitProps);
        }
        properties.push(...this.getWaypointProperties(obj));
        
        return properties;
    }

    getLevelSettingsProperties() {
        const metadata = this.game.levelMetadata || {};
        const rules = this.game.levelRules || {};
        const start = this.game.slingshot?.position || this.game.penguin || { x: 0, y: 0 };
        const target = this.game.target?.position || { x: 0, y: 0 };
        const values = {
            levelName: metadata.name || '',
            levelDescription: metadata.description || '',
            playfieldWidth: this.game.stageRect.width,
            playfieldHeight: this.game.stageRect.height,
            cameraMode: this.game.cameraConfig?.mode || EDITOR_INSPECTOR_DEFAULTS.cameraMode,
            cameraZoom: this.game.cameraConfig?.zoom ?? EDITOR_INSPECTOR_DEFAULTS.cameraZoom,
            startX: start.x,
            startY: start.y,
            targetX: target.x,
            targetY: target.y,
            maxTries: rules.maxTries,
            timeLimit: rules.timeLimit,
            scoreMultiplier: rules.scoreMultiplier ?? EDITOR_INSPECTOR_DEFAULTS.scoreMultiplier,
            requiredBonuses: rules.requiredBonuses,
            allowedMisses: rules.allowedMisses,
            gravitationalConstant: rules.gravitationalConstant ?? EDITOR_INSPECTOR_DEFAULTS.gravitationalConstant
        };

        return LEVEL_SETTING_FIELDS.map(({ dynamicMax, ...field }) => ({
            ...field,
            value: values[field.key],
            ...(dynamicMax === 'bonusCount' ? { max: this.game.bonuses?.length ?? 0 } : {})
        }));
    }
    
    getAvailableObjectIds() {
        const selectedId = this.selection?.value?.id || this.selectedObject?.id;
        const targetIds = this.getAllGameObjects()
            .filter(object => (
                object?.id &&
                object.id !== selectedId &&
            getGameObjectDefinition(object.levelType ?? object.constructor?.name).capabilities.orbitTarget
            ))
            .map(object => object.id);
        return ['none', ...new Set(targetIds)];
    }
    
    getClassSpecificProperties(obj, className) {
        const properties = [];
        const classProps = getGameObjectDefinition(className).properties;
        
        classProps.forEach(propDef => {
            const { optionsFrom, ...field } = propDef;
            let value;
            
            // Handle special nested properties
            if (propDef.key === 'pointingAtX') {
                value = obj.pointingAt ? obj.pointingAt.x : 0;
            } else if (propDef.key === 'pointingAtY') {
                value = obj.pointingAt ? obj.pointingAt.y : 0;
            } else if (propDef.key === 'width' && className === 'TextObject') {
                // Auto-sized text mutates its rendered width. Show the stable
                // configured wrap width (including padding) in the editor.
                value = obj.maxWidth + (obj.padding * 2);
            } else if (obj[propDef.key] !== undefined) {
                value = obj[propDef.key];
            } else {
                return; // Skip if property doesn't exist
            }
            
            properties.push({
                ...field,
                value,
                options: optionsFrom
                    ? EDITOR_SPRITE_OPTIONS[optionsFrom]
                    : propDef.options
            });
        });
        
        return properties;
    }
    
    getOrbitProperties(obj) {
        const properties = [];
        const orbitSystem = obj.orbitSystem;
        
        if (orbitSystem) {
            const availableTargetIds = this.getAvailableObjectIds();
            properties.push({
                ...ORBIT_PROPERTY_FIELDS.targetType,
                value: orbitSystem.orbitTargetId ? 'object' : 'position',
                options: availableTargetIds.length > 1
                    ? ORBIT_PROPERTY_FIELDS.targetType.options
                    : ORBIT_PROPERTY_FIELDS.targetType.options.filter(option => option !== 'object')
            });
            
            if (orbitSystem.orbitTargetId) {
                properties.push({
                    ...ORBIT_PROPERTY_FIELDS.targetId,
                    value: orbitSystem.orbitTargetId,
                    options: availableTargetIds
                });
            } else {
                properties.push({
                    ...ORBIT_PROPERTY_FIELDS.centerX,
                    value: orbitSystem.orbitCenter?.x ?? 0
                });
                properties.push({
                    ...ORBIT_PROPERTY_FIELDS.centerY,
                    value: orbitSystem.orbitCenter?.y ?? 0
                });
            }
            
            properties.push({ ...ORBIT_PROPERTY_FIELDS.radius, value: orbitSystem.orbitRadius || 0 });
            properties.push({ ...ORBIT_PROPERTY_FIELDS.speed, value: orbitSystem.orbitSpeed || 0 });
            properties.push({
                ...ORBIT_PROPERTY_FIELDS.type,
                value: orbitSystem.orbitType || EDITOR_INSPECTOR_DEFAULTS.orbitType
            });
            
            if (orbitSystem.orbitType === LevelOrbitType.GRAVITY) {
                properties.push({
                    ...ORBIT_PROPERTY_FIELDS.gravityStrength,
                    value: orbitSystem.gravityStrength ?? PHYSICS_CONFIG.orbit.gravityStrength
                });
                properties.push({ ...ORBIT_PROPERTY_FIELDS.velocityX, value: orbitSystem.velocity?.x || 0 });
                properties.push({ ...ORBIT_PROPERTY_FIELDS.velocityY, value: orbitSystem.velocity?.y || 0 });
            }
            
            properties.push({ ...ORBIT_PROPERTY_FIELDS.validate });
        }
        
        return properties;
    }

    getWaypointProperties(obj) {
        const system = obj.waypointSystem;
        const properties = [{
            ...WAYPOINT_PROPERTY_FIELDS.mode,
            value: system?.mode || 'none'
        }];
        if (!system) return properties;
        properties.push({ ...WAYPOINT_PROPERTY_FIELDS.speed, value: system.speed });
        system.waypoints.forEach((point, index) => {
            properties.push({
                label: `Waypoint ${index + 1} X`, key: `waypoint${index}X`, type: 'number', value: point.x
            });
            properties.push({
                label: `Waypoint ${index + 1} Y`, key: `waypoint${index}Y`, type: 'number', value: point.y
            });
        });
        properties.push(WAYPOINT_PROPERTY_FIELDS.add);
        if (system.waypoints.length > 2) properties.push(WAYPOINT_PROPERTY_FIELDS.remove);
        return properties;
    }
    
    centerSelectedObjectOnCanvas() {
        if (!this.selectedObject || !this.game || !this.game.canvas) return;
        const centerX = this.game.stageRect.x + this.game.stageRect.width / 2;
        const centerY = this.game.stageRect.y + this.game.stageRect.height / 2;
        const object = this.selectedObject;
        const before = this.getObjectPosition(object);
        if (!before) return;
        const after = { x: centerX, y: centerY };
        if (this.commandBus.execute(LiveEditCommandType.MOVE_OBJECT, {
            objectId: object.id,
            before,
            after,
            label: 'Center object'
        }, { source: 'quick-action' })) {
            plog.debug('Centered object on canvas at', centerX, centerY);
        }
    }
    
    handlePropertyChange(e) {
        const property = e.target.dataset.property;
        let value;
        
        // Get the correct value based on input type
        switch (e.target.type) {
            case 'checkbox':
                value = e.target.checked;
                break;
            case 'number':
                if (e.target.dataset.nullable === 'true' && e.target.value === '') {
                    value = null;
                    break;
                }
                value = parseFloat(e.target.value);
                // Validate numeric values
                if (isNaN(value) || !isFinite(value)) {
                    plog.warn(`Invalid numeric value for ${property}: ${e.target.value}, using default`);
                    value = this.getDefaultValue(property);
                    e.target.value = value; // Update the input field
                }
                break;
            case 'text':
            case 'color':
            default:
                value = e.target.value;
                break;
        }
        
        const target = this.selectedObject;
        if (!target) return;
        const sessionId = Number(e.target.dataset.editSession) || ++this.propertyEditSession;
        this.commandBus.execute(
            target.isLevelSettings
                ? LiveEditCommandType.SET_LEVEL_SETTING
                : LiveEditCommandType.SET_OBJECT_PROPERTY,
            {
                objectId: target.id,
                property,
                value,
                sessionId
            },
            { source: 'inspector-live' }
        );
    }

    applyObjectProperty(object, property, value) {
        if (this.document && object?.id && this.mode === 'edit' && !this.transientProjection) {
            if (!this.commandBus) throw new Error('EditorCommandBus is required for authored changes');
            return this.commandBus.execute(LiveEditCommandType.SET_OBJECT_PROPERTY, {
                objectId: object.id,
                property,
                value,
                sessionId: ++this.propertyEditSession
            }, { source: 'facade' });
        }
        return runtimeEdits.applyObjectProperty(this, object, property, value);
    }

    updateLevelSetting(property, value) {
        if (this.document && this.mode === 'edit' && !this.transientProjection) {
            if (!this.commandBus) throw new Error('EditorCommandBus is required for authored changes');
            return this.commandBus.execute(LiveEditCommandType.SET_LEVEL_SETTING, {
                property,
                value,
                sessionId: ++this.propertyEditSession
            }, { source: 'facade' });
        }
        return runtimeEdits.updateLevelSetting(this, property, value);
    }

    synchronizeEditedObject(object) {
        if (this.document && this.mode === 'edit' && !this.transientProjection) {
            throw new Error('Authored editor objects must be changed through EditorCommandBus');
        }
        return runtimeEdits.synchronizeEditedObject(this, object);
    }

    resetGravityOrbit(obj) {
        if (!obj) return false;
        if (!this.commandBus) return this.applyGravityOrbitReset(obj);
        return this.commandBus.execute(LiveEditCommandType.OBJECT_ACTION, {
            objectId: obj.id,
            action: 'gravity-orbit.reset'
        }, { source: 'quick-action' });
    }

    applyGravityOrbitReset(obj) {
        if (this.document && obj?.id && this.mode === 'edit' && !this.transientProjection) {
            if (!this.commandBus) throw new Error('EditorCommandBus is required for authored changes');
            return this.commandBus.execute(LiveEditCommandType.OBJECT_ACTION, {
                objectId: obj.id,
                action: 'gravity-orbit.reset'
            }, { source: 'facade' });
        }
        return runtimeEdits.applyGravityOrbitReset(this, obj);
    }

    getDefaultValue(property) {
        const center = this.getPlayfieldCenter();
        const positionFallbacks = {
            x: center.x,
            y: center.y,
            'position.x': center.x,
            'position.y': center.y,
            orbitCenterX: center.x,
            orbitCenterY: center.y
        };

        return positionFallbacks[property] ?? EDITOR_NUMERIC_FALLBACKS[property] ?? 0;
    }
    
    refreshPlanetSprite(planet) {
        // Use the planet's built-in refreshSprite method
        if (typeof planet.refreshSprite === 'function') {
            planet.refreshSprite();
        } else {
            plog.warn('Planet object does not have refreshSprite method');
        }
    }
    
    refreshTargetSprite(target) {
        // Use the target's built-in refreshSprite method
        if (typeof target.refreshSprite === 'function') {
            target.refreshSprite();
        } else {
            plog.warn('Target object does not have refreshSprite method');
        }
    }
    
    setDisplayedPropertyValue(property, value) {
        const input = this.propertiesPanel?.querySelector(`[data-property="${property}"]`);
        if (input) input.value = String(value);
    }

    getObjectPosition(object) {
        if (!object) return null;
        if (typeof object.x === 'number' && typeof object.y === 'number') {
            return { x: object.x, y: object.y };
        }
        if (object.position && typeof object.position.x === 'number' && typeof object.position.y === 'number') {
            return { x: object.position.x, y: object.position.y };
        }
        return null;
    }

    addObject(className) {
        const view = this.editorCamera?.viewRect || this.game.stageRect;
        const centerX = view.x + view.width / 2;
        const centerY = view.y + view.height / 2;
        return this.addObjectAtPosition(className, centerX, centerY);
    }

    refreshAfterHistory(selection) {
        this.runtimeProjector?.indexRuntimeObjects();
        this.overlayRenderer?.runtimeController?.invalidatePreview();
        if (
            this.commandContext?.liveTransaction ||
            this.commandContext?.changeSource === 'inspector-live'
        ) return;
        this.selectObject(selection);
    }
    
    getRuntimeSingleton(className) {
        const key = getGameObjectDefinition(className).singleton;
        return key ? this.game[key] ?? null : null;
    }
    
    showContextMenu(x, y) {
        if (this.mode !== 'edit') return;
        
        // Remove existing context menu if any
        const existingMenu = document.getElementById('level-editor-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
        
        // Create context menu
        const menu = document.createElement('div');
        menu.id = 'level-editor-context-menu';
        menu.className = 'editor-context-menu';
        
        // Convert canvas coordinates to screen coordinates
        const screenPoint = stageToScreen(this.game.canvas, this.game.viewport, x, y, this.editorCamera);
        const screenX = screenPoint.x;
        const screenY = screenPoint.y;
        
        // Position menu, ensuring it stays on screen
        menu.style.left = Math.min(screenX, window.innerWidth - 200) + 'px';
        menu.style.top = Math.min(screenY, window.innerHeight - 300) + 'px';
        
        const hit = this.objectService.hitTestBody(x, y);
        if (hit) {
            this.selectObject(hit);
            const definition = getGameObjectDefinition(hit.levelType ?? hit.constructor.name);
            for (const actionName of definition.actions) {
                const action = getEditorActionDefinition(actionName);
                if (!action) continue;
                menu.appendChild(this.createContextMenuItem(action.label, () => {
                    action.execute(this, hit);
                    menu.remove();
                }, action.danger));
            }
        } else {
            for (const className of this.getEditableObjectClasses()) {
                menu.appendChild(this.createContextMenuItem(`Add ${className}`, () => {
                    this.addObjectAtPosition(className, x, y);
                    menu.remove();
                }));
            }
        }
        
        // Add menu to document
        document.body.appendChild(menu);
        
        // Remove menu when clicking elsewhere
        const removeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', removeMenu);
                document.removeEventListener('touchstart', removeMenu);
            }
        };
        
        // Delay adding event listeners to prevent immediate removal
        setTimeout(() => {
            document.addEventListener('click', removeMenu);
            document.addEventListener('touchstart', removeMenu);
        }, EDITOR_CONFIG.interaction.deferredListenerMs);
    }

    createContextMenuItem(label, action, danger = false) {
        const item = createButton(label, action, {
            backgroundColor: 'transparent',
            hoverColor: '#333',
            textColor: danger ? '#ffad9f' : 'white',
            borderColor: 'transparent'
        });
        item.classList.add('editor-context-menu-item');
        if (danger) item.classList.add('is-danger');
        return item;
    }
    
    addObjectAtPosition(className, x, y) {
        const descriptor = getGameObjectDefinition(className);
        if (!descriptor.createAuthoringDefinitions) {
            plog.error('Unknown or non-creatable editor object:', className);
            return false;
        }
        const existingSingleton = this.getRuntimeSingleton(className);
        if (existingSingleton) {
            plog.warn(`${className} is unique in a level; selecting the existing object`);
            this.selectObject(existingSingleton);
            return false;
        }

        try {
            const definitions = descriptor.createAuthoringDefinitions({
                x,
                y,
                allocatePairNumber: (prefix, suffixes) =>
                    this.objectService.allocateGroupNumber(prefix, suffixes)
            });
            for (const definition of definitions) {
                definition.properties ||= {};
                definition.properties.id ||= this.objectService.allocateId(className);
                definition.properties.name ||= this.objectService.allocateName(className);
            }
            const baseIndex = this.document.listObjects().length;
            const added = definitions.length === 1
                ? this.commandBus.execute(LiveEditCommandType.ADD_OBJECT, {
                    objectId: definitions[0].properties.id,
                    definition: definitions[0],
                    index: baseIndex
                })
                : this.commandBus.execute(LiveEditCommandType.OBJECT_GROUP, {
                    entries: definitions.map((definition, index) => ({
                        definition,
                        index: baseIndex + index
                    })),
                    operation: 'add'
                });
            if (!added) return false;
            this.selection.select(definitions[0].properties.id);
            plog.debug('Created new', className, 'at', x, y);
            return true;
        } catch (error) {
            plog.error('Failed to create', className, ':', error);
            return false;
        }
    }

    cloneRegisteredObjectGroup(selected, descriptor) {
        const selectedRecord = this.document?.getObject(selected.id);
        if (!selectedRecord) return false;
        const definitions = descriptor.cloneAuthoringDefinitions({
            source: selectedRecord,
            resolveDefinition: id => this.document.getObject(id),
            allocatePairNumber: (prefix, suffixes) =>
                this.objectService.allocateGroupNumber(prefix, suffixes)
        });
        if (!definitions.length) return false;
        const baseIndex = this.document.listObjects().length;
        const added = this.commandBus.execute(LiveEditCommandType.OBJECT_GROUP, {
            entries: definitions.map((definition, offsetIndex) => ({
                definition,
                index: baseIndex + offsetIndex
            })),
            operation: 'add'
        });
        if (added) this.selection.select(definitions[0].properties.id);
        return added;
    }

    exportLevel() {
        this.assertDocumentValid('editor export');
        const levelData = this.currentDocumentDefinition();
        const filename = `custom_level_${Date.now()}.json`;
        
        const blob = new Blob([JSON.stringify(levelData, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        plog.success('Level exported:', filename);
    }
    
    cloneSelected() {
        if (!this.selectedObject) {
            plog.warn('No object selected to clone');
            return;
        }
        if (this.selectedObject.isLevelSettings) {
            plog.warn('Level Settings cannot be cloned');
            return;
        }
        const selectedClassName = this.selectedObject.constructor.name;
        const descriptor = getGameObjectDefinition(selectedClassName);
        if (descriptor.cloneAuthoringDefinitions) {
            this.cloneRegisteredObjectGroup(this.selectedObject, descriptor);
            return;
        }
        if (this.getRuntimeSingleton(selectedClassName)) {
            plog.warn(`${selectedClassName} is unique in a level and cannot be cloned`);
            return;
        }
        
        const source = this.document?.getObject(this.selectedObject.id);
        if (!source) return;
        const clone = structuredClone(source);
        clone.position = {
            x: clone.position.x + EDITOR_CONFIG.cloneOffset.x,
            y: clone.position.y + EDITOR_CONFIG.cloneOffset.y
        };
        if (clone.properties?.orbit?.center) {
            clone.properties.orbit.center.x += EDITOR_CONFIG.cloneOffset.x;
            clone.properties.orbit.center.y += EDITOR_CONFIG.cloneOffset.y;
        }
        clone.properties.id = this.objectService.allocateId(selectedClassName);
        clone.properties.name = this.objectService.allocateName(selectedClassName);
        const added = this.commandBus.execute(LiveEditCommandType.ADD_OBJECT, {
            objectId: clone.properties.id,
            definition: clone,
            index: this.document.listObjects().length
        }, { source: 'clone' });
        if (!added) return;
        this.selection.select(clone.properties.id);
        plog.debug('Cloned', selectedClassName);
    }
    
    updateObjectList() {
        this.objectListView.render();
    }

    getAllGameObjects() {
        if (this.objectService && this.runtimeProjector) {
            return this.objectService.listRuntimeObjects();
        }
        const allObjects = [];
        
        // Add planets
        for (let planet of this.game.planets) {
            allObjects.push(planet);
        }
        
        // Add bonuses
        for (let bonus of this.game.bonuses) {
            allObjects.push(bonus);
        }
        
        // Add ALL game objects (avoiding duplicates)
        for (let obj of this.game.gameObjects) {
            if (!allObjects.includes(obj)) {
                allObjects.push(obj);
            }
        }
        
        return allObjects.filter(object => getGameObjectDefinition(
            object?.levelType ?? object?.constructor?.name
        ).editable);
    }

    getDocumentObjectSnapshot(id) {
        const object = this.document?.getObject(id);
        if (!object) return null;
        return {
            definition: structuredClone(object),
            index: this.document.listObjects().indexOf(object)
        };
    }

    addDocumentObject(definition, index) {
        return this.applyDocumentPatch({ type: 'object.add', object: definition, index });
    }

    removeDocumentObject(id) {
        return this.applyDocumentPatch({ type: 'object.remove', id });
    }

    applyDocumentPatch(patch) {
        const candidate = LevelDocument.fromDefinition(this.document.toDefinition());
        if (!candidate.applyPatch(patch)) return false;
        return this.applyDocumentDefinition(candidate.toDefinition());
    }

    applyDocumentPatches(patches) {
        if (!this.document || !patches?.length) return false;
        const candidate = LevelDocument.fromDefinition(this.document.toDefinition());
        for (const patch of patches) {
            if (!candidate.applyPatch(patch)) return false;
        }
        return this.applyDocumentDefinition(candidate.toDefinition());
    }

    applyDocumentDefinition(definition) {
        if (!this.document || !definition) return false;
        return projectDocumentDefinition({
            document: this.document,
            projector: this.runtimeProjector,
            definition,
            source: 'editor document mutation',
            onCommitted: () => this.finishDocumentProjection(),
            onRecoveryFailure: error => plog.error(
                'Unable to recover the last known-good editor projection:', error
            )
        });
    }

    finishDocumentProjection() {
        this.runtimeProjector.indexRuntimeObjects();
        this.overlayRenderer?.runtimeController?.invalidatePreview();
        this.game?.invalidateSimulationState?.();
        if (this.active && this.mode === 'edit') {
            this.game.setState?.(GameState.LEVEL_EDITOR);
            if (this.editorCamera) {
                this.game.viewRect = this.editorCamera.viewRect;
                this.game.arrow?.setStageRect?.(this.editorCamera.viewRect);
            }
        }
    }

    rebuildDocumentProjection() {
        try {
            this.document.validate('editor runtime projection');
            this.runtimeProjector.rebuild(this.document.toDefinition());
            if (this.active) this.game.setState?.(GameState.LEVEL_EDITOR);
            return true;
        } catch (error) {
            plog.error('Unable to rebuild the editor runtime projection:', error);
            return false;
        }
    }

    assertDocumentValid(source = 'editor document') {
        if (!this.document) return true;
        const selectedId = this.selection?.value?.id;
        if (selectedId && !this.document.getObject(selectedId)) {
            throw new Error(`The selected object no longer exists: ${selectedId}`);
        }
        return this.document.validate(source);
    }

    currentDocumentDefinition() {
        return this.document?.toDefinition() || this.game.exportCurrentLevel();
    }

    markClean() {
        this.cleanDocumentSnapshot = this.document?.fingerprint() ||
            JSON.stringify(this.currentDocumentDefinition());
    }

    isDirty() {
        if (!this.active || !this.cleanDocumentSnapshot) return false;
        const fingerprint = this.document?.fingerprint() || JSON.stringify(this.currentDocumentDefinition());
        return fingerprint !== this.cleanDocumentSnapshot;
    }
    
    selectLevelSettings() {
        this.selectObject(this.levelSettingsNode);
    }
    
    render(ctx) {
        this.overlayRenderer.render(ctx);
    }

    shouldDeferRuntimeObjectDraw(object) {
        return Boolean(
            this.active &&
            this.mode === 'edit' &&
            this.overlayRenderer?.runtimeController?.shouldRenderPreviewObject(object)
        );
    }

    getPlanetSpriteOptions() {
        return EDITOR_SPRITE_OPTIONS.planetSprites;
    }
    
    getShipSpriteOptions() {
        return EDITOR_SPRITE_OPTIONS.shipSprites;
    }
    
    getBonusSpriteOptions() {
        return EDITOR_SPRITE_OPTIONS.bonusSprites;
    }
}

export default LevelEditor;
