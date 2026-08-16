import { GameState } from './game.js';
import plog from './penguinLogger.js';
import { LEVEL_ORBIT_TYPES, LevelOrbitType } from './levelSchema.js';
import { STAGE_WIDTH, STAGE_HEIGHT, stageToScreen } from './viewport.js';
import { EDITOR_CONFIG } from './config/editorConfig.js';
import { LEVEL_DEFAULTS, PHYSICS_CONFIG } from './config/gameConfig.js';
import { OrbitSystem } from './gameObjects.js';
import { getEditableClassNames } from './editorObjectRegistry.js';
import LiveLevelMutator from './liveLevelMutator.js';
import { createLiveEditHistory, LiveEditCommandType } from './editorCommands/index.js';
import LevelEditorOverlayRenderer from './levelEditor/overlayRenderer.js';
import LevelEditorObjectListView from './levelEditor/objectListView.js';
import LevelEditorInspectorView from './levelEditor/inspectorView.js';
import LevelEditorToolbarView from './levelEditor/toolbarView.js';
import LevelEditorCanvasInputController from './levelEditor/canvasInputController.js';
import GravitySculptView from './levelEditor/gravitySculptView.js';
import GravitySculptController from './levelEditor/gravitySculptController.js';
import { createButton } from './buttonFramework.js';
import {
    INPUT_CONFIG,
    isCompactEditorViewport,
    isTouchViewport
} from './config/inputConfig.js';

const EDITABLE_STATE_PROPERTIES = Object.freeze([
    'name', 'rotation', 'alpha', 'visible', 'radius', 'width', 'height', 'mass',
    'collisionRadius', 'gravitationalReach', 'color', 'planetType', 'value',
    'rotationSpeed', 'state', 'spriteType', 'maxPullback', 'stretchLimit',
    'velocityMultiplier', 'content', 'fontSize', 'fontFamily', 'textAlign',
    'backgroundColor', 'padding', 'maxWidth', 'autoSize', 'baseWidth',
    'glowColor', 'scaleWithDistance'
]);
const ORBIT_EDITOR_PROPERTIES = new Set([
    'orbitTargetType', 'orbitTargetId', 'orbitCenterX', 'orbitCenterY',
    'orbitRadius', 'orbitSpeed', 'orbitType', 'gravityStrength',
    'velocityX', 'velocityY', 'validateObject'
]);

function cloneEditValue(value) {
    return value === undefined ? undefined : structuredClone(value);
}

class LevelEditor {
    constructor(game) {
        this.game = game;
        this.mutator = new LiveLevelMutator(game);
        this.history = createLiveEditHistory({
            mutator: this.mutator,
            refresh: selection => this.refreshAfterHistory(selection),
            updateOrbitSystem: object => this.updateOrbitSystem(object),
            restoreObjectPropertyState: (object, state) => this.restoreObjectPropertyState(object, state),
            restoreLevelSettingsState: state => this.restoreLevelSettingsState(state)
        });
        this.propertyEditSession = 0;
        this.overlayRenderer = new LevelEditorOverlayRenderer(this);
        this.objectListView = new LevelEditorObjectListView(this);
        this.inspectorView = new LevelEditorInspectorView(this);
        this.toolbarView = new LevelEditorToolbarView(this);
        this.canvasInput = new LevelEditorCanvasInputController(this);
        this.gravitySculptView = new GravitySculptView(this);
        this.gravitySculptController = new GravitySculptController(this);
        this.active = false;
        this.previousGameState = null;
        this.mode = 'edit'; // 'edit' or 'play'
        this.selectedObject = null;
        this.levelSettingsNode = { isLevelSettings: true };
        this.dragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.dragStartPosition = null;
        this.propertiesPanel = null;
        
        // Orbit center drag support
        this.draggingOrbitCenter = false;
        this.orbitCenterObject = null; // The object whose orbit center we're dragging
        this.orbitCenterDragStart = null;
        this.createUI();
        // Note: Event listeners now managed by InputActionManager
    }
    
    createUI() {
        this.container = document.createElement('div');
        this.container.id = 'level-editor';
        this.container.style.cssText = 'position: fixed; inset: 0; pointer-events: none; z-index: 100; display: none;';
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
        
        // Show context menu at center of screen
        const centerX = STAGE_WIDTH / 2;
        const centerY = STAGE_HEIGHT / 2;
        this.showContextMenu(centerX, centerY);
    }
    
    deleteSelectedObject() {
        if (!this.selectedObject) return;
        if (this.selectedObject.isLevelSettings) {
            plog.warn('Level Settings cannot be deleted');
            return;
        }
        
        const obj = this.selectedObject;
        const className = obj.constructor.name;
        
        plog.debug(`Deleting ${className}...`);
        
        this.history.execute(LiveEditCommandType.REMOVE_OBJECT, { object: obj, className });
        
        plog.success(`Successfully deleted ${className}`);
    }
    
    saveLevel() {
        this.game.saveEditedLevel().catch(error => {
            plog.error('Failed to save level:', error);
            this.game.showMessage(error.message || 'Unable to save this level.');
        });
    }

    loadLevel() {
        this.game.showLevelBrowser();
    }

    exitToMenu() {
        this.game.uiManager.closeAllScreens();
        this.exit();
        this.game.returnToMenu();
    }
    
    undo() {
        if (!this.history.undo()) plog.info('Nothing to undo');
    }
    
    redo() {
        if (!this.history.redo()) plog.info('Nothing to redo');
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
    handleMouseDown(event) { this.canvasInput.handlePointerDown(event); }
    handleMouseMove(event) { this.canvasInput.handlePointerMove(event); }
    handleMouseUp(event) { this.canvasInput.handlePointerUp(event); }
    handleRightClick(event) { this.canvasInput.handleContextMenu(event); }
    cancelLongPress() { this.canvasInput.cancelLongPress(); }

    enter() {
        if (this.active) return;
        this.previousGameState = this.game.state;
        this.history.clear();
        this.active = true;
        this.container.style.display = 'block';
        if (typeof this.game.setState === 'function') this.game.setState(GameState.LEVEL_EDITOR);
        else this.game.state = GameState.LEVEL_EDITOR;
        this.mode = 'edit';
        this.updateModeButton();
        this.populateObjectButtons();
        
        // Assign names to existing objects that don't have them
        this.assignNamesToExistingObjects();
        
        this.updateObjectList();
        
        // Notify fullscreen manager about level editor state change
        if (this.game.fullscreenManager) {
            this.game.fullscreenManager.setLevelEditorMode(true);
        }
    }
    
    assignNamesToExistingObjects() {
        const allObjects = this.getAllGameObjects();
        const typeCounters = {};
        
        allObjects.forEach(obj => {
            if (!obj.name) {
                const className = obj.constructor.name;
                
                // Initialize counter for this type if it doesn't exist
                if (!typeCounters[className]) {
                    typeCounters[className] = 0;
                }
                
                typeCounters[className]++;
                obj.name = `${className} ${typeCounters[className]}`;
            }
        });
    }
    
    exit() {
        if (!this.active) return;
        this.gravitySculptController.close();
        this.active = false;
        this.container.style.display = 'none';
        this.cancelLongPress();
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
            this.mode = 'play';
            this.game?.invalidateSimulationState?.();
            this.selectObject(null); // Clear selection when entering play mode
            this.stopDragging(); // Stop any ongoing drag operation
        } else {
            this.mode = 'edit';
        }
        this.updateModeButton();
        plog.info('Level editor mode changed to:', this.mode);
    }
    
    updateModeButton() {
        this.toolbarView.updateMode(this.mode);
    }
    
    populateObjectButtons() {
        this.toolbarView.populate(this.getEditableObjectClasses());
    }

    getEditableObjectClasses() {
        return getEditableClassNames(this.gameObjectClasses);
    }
    
    getObjectAtPosition(x, y) {
        // First check if we clicked on an orbit center
        const orbitCenterResult = this.getOrbitCenterAtPosition(x, y);
        if (orbitCenterResult) {
            return orbitCenterResult;
        }
        
        // Create a list of all objects to check, avoiding duplicates
        const allObjects = [];
        
        // Add planets
        for (let planet of this.game.planets) {
            allObjects.push(planet);
        }
        
        // Add bonuses
        for (let bonus of this.game.bonuses) {
            allObjects.push(bonus);
        }
        
        // Add ALL game objects (including penguin, targets, slingshots, etc.)
        for (let obj of this.game.gameObjects) {
            if (!allObjects.includes(obj)) {
                allObjects.push(obj);
            }
        }
        
        // Check in reverse order so topmost objects are selected first
        for (let i = allObjects.length - 1; i >= 0; i--) {
            const obj = allObjects[i];
            if (this.isPointInObject(x, y, obj)) {
                plog.debug('Selected:', obj.constructor.name);
                return obj;
            }
        }
        return null;
    }
    
    getOrbitCenterAtPosition(x, y) {
        // Check all objects for orbit centers that could be clicked
        const allObjects = [];
        
        // Add planets
        for (let planet of this.game.planets) {
            allObjects.push(planet);
        }
        
        // Add bonuses
        for (let bonus of this.game.bonuses) {
            allObjects.push(bonus);
        }
        
        // Add ALL game objects
        for (let obj of this.game.gameObjects) {
            if (!allObjects.includes(obj)) {
                allObjects.push(obj);
            }
        }
        
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
    
    isPointInObject(x, y, obj) {
        // Get object coordinates - handle both position.x/y and direct x/y properties
        let objX, objY;
        if (typeof obj.x === 'number' && typeof obj.y === 'number') {
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
        
        // Name property (always first)
        properties.push({ 
            label: 'Name', 
            key: 'name', 
            value: obj.name || this.generateObjectName(obj, className), 
            type: 'text' 
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
            properties.push({ label: 'X Position', key: 'x', value: objX, type: 'number' });
            properties.push({ label: 'Y Position', key: 'y', value: objY, type: 'number' });
        }
        
        // Common GameObject properties
        if (obj.rotation !== undefined) {
            properties.push({ label: 'Rotation', key: 'rotation', value: obj.rotation, type: 'number' });
        }
        if (obj.alpha !== undefined) {
            properties.push({ label: 'Alpha', key: 'alpha', value: obj.alpha, type: 'number', min: 0, max: 1, step: 0.1 });
        }
        if (obj.visible !== undefined) {
            properties.push({ label: 'Visible', key: 'visible', value: obj.visible, type: 'checkbox' });
        }
        
        // Class-specific properties using reflection
        const specificProps = this.getClassSpecificProperties(obj, className);
        properties.push(...specificProps);
        
        // Add orbit properties for objects that have orbit systems
        if (obj.orbitSystem) {
            const orbitProps = this.getOrbitProperties(obj);
            properties.push(...orbitProps);
        }
        
        return properties;
    }

    getLevelSettingsProperties() {
        const metadata = this.game.levelMetadata || {};
        const rules = this.game.levelRules || {};
        const start = this.game.slingshot?.position || this.game.penguin || { x: 0, y: 0 };
        const target = this.game.target?.position || { x: 0, y: 0 };

        return [
            { label: 'Level Name', key: 'levelName', value: metadata.name || '', type: 'text' },
            { label: 'Description', key: 'levelDescription', value: metadata.description || '', type: 'text' },
            { label: 'Start X', key: 'startX', value: start.x, type: 'number' },
            { label: 'Start Y', key: 'startY', value: start.y, type: 'number' },
            { label: 'Target X', key: 'targetX', value: target.x, type: 'number' },
            { label: 'Target Y', key: 'targetY', value: target.y, type: 'number' },
            { label: 'Max Tries', key: 'maxTries', value: rules.maxTries, type: 'nullableNumber', min: 1, step: 1 },
            { label: 'Time Limit', key: 'timeLimit', value: rules.timeLimit, type: 'nullableNumber', min: 0.01 },
            { label: 'Score Multiplier', key: 'scoreMultiplier', value: rules.scoreMultiplier ?? 1, type: 'number', min: 0.01 },
            { label: 'Required Bonuses', key: 'requiredBonuses', value: rules.requiredBonuses, type: 'nullableNumber', min: 0, max: this.game.bonuses?.length ?? 0, step: 1 },
            { label: 'Allowed Misses', key: 'allowedMisses', value: rules.allowedMisses, type: 'nullableNumber', min: 0, step: 1 },
            { label: 'Gravitational Constant', key: 'gravitationalConstant', value: rules.gravitationalConstant ?? 3, type: 'number', min: 0 }
        ];
    }
    
    getAvailableObjectIds() {
        const objectIds = ['none'];
        
        // Get all game objects with IDs
        if (this.game && this.game.gameObjects) {
            for (const obj of this.game.gameObjects) {
                if (obj.id && obj !== this.selectedObject) {
                    objectIds.push(obj.id);
                }
            }
        }
        
        // Add default names if no IDs are set yet
        if (objectIds.length === 1) {
            if (this.game) {
                this.game.gameObjects.forEach((obj, index) => {
                    if (obj !== this.selectedObject) {
                        const className = obj.constructor.name.toLowerCase();
                        objectIds.push(`${className}_${index + 1}`);
                    }
                });
            }
        }
        
        return objectIds;
    }
    
    getClassSpecificProperties(obj, className) {
        const properties = [];
        
        // Define editable properties for each class
        const propertyMaps = {
            'Planet': [
                { key: 'radius', label: 'Radius', type: 'number', min: 1 },
                { key: 'width', label: 'Width', type: 'number', min: 1 },
                { key: 'height', label: 'Height', type: 'number', min: 1 },
                { key: 'mass', label: 'Mass', type: 'number', min: 1 },
                { key: 'collisionRadius', label: 'Collision Radius', type: 'number', min: 1 },
                { key: 'gravitationalReach', label: 'Gravitational Reach', type: 'number', min: 0 },
                { key: 'color', label: 'Color', type: 'color' },
                { key: 'planetType', label: 'Planet Sprite', type: 'select', options: this.getPlanetSpriteOptions() }
            ],
            'Bonus': [
                { key: 'width', label: 'Width', type: 'number', min: 1 },
                { key: 'height', label: 'Height', type: 'number', min: 1 },
                { key: 'value', label: 'Value', type: 'number', min: 1 },
                { key: 'rotationSpeed', label: 'Rotation Speed', type: 'number' },
                { key: 'state', label: 'State', type: 'select', options: ['notHit', 'Hit'] }
            ],
            'Target': [
                { key: 'width', label: 'Width', type: 'number', min: 1 },
                { key: 'height', label: 'Height', type: 'number', min: 1 },
                { key: 'spriteType', label: 'Ship Sprite', type: 'select', options: this.getShipSpriteOptions() }
            ],
            'Slingshot': [
                { key: 'width', label: 'Width', type: 'number', min: 1 },
                { key: 'height', label: 'Height', type: 'number', min: 1 },
                { key: 'maxPullback', label: 'Max Pullback', type: 'number', min: 10 },
                { key: 'velocityMultiplier', label: 'Velocity Multiplier', type: 'number', min: 1 }
            ],
            'TextObject': [
                { key: 'content', label: 'Text Content', type: 'text' },
                { key: 'width', label: 'Width / Wrap Limit', type: 'number', min: 1 },
                { key: 'height', label: 'Height', type: 'number', min: 1 },
                { key: 'fontSize', label: 'Font Size', type: 'number', min: 8, max: 72 },
                { key: 'color', label: 'Color', type: 'color' },
                { key: 'fontFamily', label: 'Font Family', type: 'text' },
                { key: 'textAlign', label: 'Text Align', type: 'select', options: ['left', 'center', 'right'] },
                { key: 'backgroundColor', label: 'Background Color', type: 'color' },
                { key: 'autoSize', label: 'Auto Size', type: 'checkbox' },
                { key: 'visible', label: 'Visible', type: 'checkbox' }
            ],
            'PointingArrow': [
                { key: 'pointingAtX', label: 'Target X', type: 'number' },
                { key: 'pointingAtY', label: 'Target Y', type: 'number' },
                { key: 'width', label: 'Width', type: 'number', min: 1 },
                { key: 'height', label: 'Height', type: 'number', min: 1 },
                { key: 'color', label: 'Color', type: 'color' },
                { key: 'glowColor', label: 'Glow Color', type: 'color' },
                { key: 'baseWidth', label: 'Base Width', type: 'number', min: 10 },
                { key: 'scaleWithDistance', label: 'Scale with Distance', type: 'checkbox' },
                { key: 'visible', label: 'Visible', type: 'checkbox' }
            ]
        };
        
        const classProps = propertyMaps[className] || [];
        
        classProps.forEach(propDef => {
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
                label: propDef.label,
                key: propDef.key,
                value: value,
                type: propDef.type,
                min: propDef.min,
                max: propDef.max,
                step: propDef.step,
                options: propDef.options
            });
        });
        
        return properties;
    }
    
    getOrbitProperties(obj) {
        const properties = [];
        const orbitSystem = obj.orbitSystem;
        
        if (orbitSystem) {
            // Orbit target selection (object vs fixed position)
            properties.push({ 
                label: 'Orbit Target', 
                key: 'orbitTargetType', 
                value: orbitSystem.orbitTargetId ? 'object' : 'position', 
                type: 'select',
                options: ['none', 'position', 'object']
            });
            
            // Object target selection
            if (orbitSystem.orbitTargetId) {
                properties.push({ 
                    label: 'Target Object ID', 
                    key: 'orbitTargetId', 
                    value: orbitSystem.orbitTargetId, 
                    type: 'select',
                    options: this.getAvailableObjectIds()
                });
            } else if (orbitSystem.orbitCenter) {
                // Fixed position orbit
                properties.push({ 
                    label: 'Orbit Center X', 
                    key: 'orbitCenterX', 
                    value: orbitSystem.orbitCenter.x, 
                    type: 'number' 
                });
                properties.push({ 
                    label: 'Orbit Center Y', 
                    key: 'orbitCenterY', 
                    value: orbitSystem.orbitCenter.y, 
                    type: 'number' 
                });
            } else {
                // Default to position mode
                properties.push({ 
                    label: 'Orbit Center X', 
                    key: 'orbitCenterX', 
                    value: 0, 
                    type: 'number' 
                });
                properties.push({ 
                    label: 'Orbit Center Y', 
                    key: 'orbitCenterY', 
                    value: 0, 
                    type: 'number' 
                });
            }
            
            // Orbit properties
            properties.push({ 
                label: 'Orbit Radius', 
                key: 'orbitRadius', 
                value: orbitSystem.orbitRadius || 0, 
                type: 'number', 
                min: 0 
            });
            properties.push({ 
                label: 'Orbit Speed', 
                key: 'orbitSpeed', 
                value: orbitSystem.orbitSpeed || 0, 
                type: 'number' 
            });
            properties.push({ 
                label: 'Orbit Type', 
                key: 'orbitType', 
                value: orbitSystem.orbitType || LevelOrbitType.CIRCULAR,
                type: 'select', 
                options: LEVEL_ORBIT_TYPES
            });
            
            // Add gravity-specific properties
            if (orbitSystem.orbitType === LevelOrbitType.GRAVITY) {
                properties.push({ 
                    label: 'Gravity Strength', 
                    key: 'gravityStrength', 
                    value: orbitSystem.gravityStrength ?? PHYSICS_CONFIG.orbit.gravityStrength,
                    type: 'number',
                    min: 100,
                    max: 10000,
                    step: 100
                });
                properties.push({ 
                    label: 'Initial Velocity X', 
                    key: 'velocityX', 
                    value: orbitSystem.velocity?.x || 0, 
                    type: 'number'
                });
                properties.push({ 
                    label: 'Initial Velocity Y', 
                    key: 'velocityY', 
                    value: orbitSystem.velocity?.y || 0, 
                    type: 'number'
                });
                // Reset button added as quick action instead
            }
            
            // Add validation button for all orbit types
            properties.push({
                label: 'Validate & Fix Values',
                key: 'validateObject',
                type: 'button',
                buttonText: 'Fix Invalid Values'
            });
        }
        
        return properties;
    }
    
    centerSelectedObjectOnCanvas() {
        if (!this.selectedObject || !this.game || !this.game.canvas) return;
        const centerX = STAGE_WIDTH / 2;
        const centerY = STAGE_HEIGHT / 2;
        const object = this.selectedObject;
        const before = this.getObjectPosition(object);

        if (typeof this.selectedObject.x === 'number' && typeof this.selectedObject.y === 'number') {
            this.selectedObject.x = centerX;
            this.selectedObject.y = centerY;
        } else if (this.selectedObject.position && typeof this.selectedObject.position.x === 'number' && typeof this.selectedObject.position.y === 'number') {
            this.selectedObject.position.x = centerX;
            this.selectedObject.position.y = centerY;
        }

        plog.debug('Centered object on canvas at', centerX, centerY);
        const after = this.getObjectPosition(object);
        this.recordPositionChange(object, before, after, 'Center object');
        this.updatePropertiesPanel();
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

        if (target.isLevelSettings) {
            const before = this.captureLevelSettingsState();
            this.updateLevelSetting(property, value);
            const after = this.captureLevelSettingsState();
            if (this.history && !this.editStatesEqual(before, after)) {
                this.history.recordExecuted(LiveEditCommandType.SET_LEVEL_SETTING, {
                    target,
                    property,
                    before,
                    after,
                    sessionId
                });
            }
        } else {
            const before = this.captureObjectPropertyState(target);
            this.applyObjectProperty(target, property, value);
            const after = this.captureObjectPropertyState(target);
            if (this.history && !this.editStatesEqual(before, after)) {
                this.history.recordExecuted(LiveEditCommandType.SET_OBJECT_PROPERTY, {
                    object: target,
                    property,
                    before,
                    after,
                    sessionId
                });
            }
        }
    }

    applyObjectProperty(object, property, value) {
        if (property === 'name') {
            object.name = value;
            this.updateObjectList();
            plog.debug(`Updated object name to: ${value}`);
        } else if (property === 'x' || property === 'y') {
            if (typeof object.x === 'number') {
                object[property] = value;
            } else if (object.position) {
                object.position[property] = value;
            }
        } else if (ORBIT_EDITOR_PROPERTIES.has(property)) {
            this.updateOrbitProperty(property, value, object);
        } else if (property === 'planetType' || property === 'spriteType') {
            this.updateSpriteProperty(property, value, object);
        } else if (property === 'pointingAtX' || property === 'pointingAtY') {
            this.updatePointingAtProperty(property, value, object);
        } else if (property === 'content' && object.constructor.name === 'TextObject') {
            object.content = value;
            object.parsedContent = object.parseHTMLContent(value);
            plog.debug(`Updated text content to: ${value}`);
        } else if (property === 'width' && object.constructor.name === 'TextObject') {
            object.width = value;
            object.maxWidth = Math.max(
                1,
                value - (object.padding * 2)
            );
            plog.debug(`Updated text wrap width to ${object.maxWidth}`);
        } else if ((property === 'width' || property === 'height') && object.constructor.name === 'Planet') {
            object[property] = value;
            const newRadius = Math.min(object.width, object.height) / 2;
            object.radius = newRadius;
            plog.debug(`Updated planet ${property} to ${value}, adjusted radius to ${newRadius}`);
        } else if (property in object) {
            object[property] = value;
            plog.debug(`Updated ${property} to ${value}`);
        }
        this.synchronizeEditedObject(object);
    }

    updateLevelSetting(property, value) {
        this.game.levelMetadata ||= { name: '', description: '' };

        if (property === 'levelName') {
            this.game.levelMetadata.name = value;
        } else if (property === 'levelDescription') {
            this.game.levelMetadata.description = value;
        } else if (property === 'startX' || property === 'startY') {
            const axis = property === 'startX' ? 'x' : 'y';
            if (this.game.slingshot?.position) this.game.slingshot.position[axis] = value;
            if (this.game.penguin) this.game.penguin[axis] = value;
        } else if (property === 'targetX' || property === 'targetY') {
            const axis = property === 'targetX' ? 'x' : 'y';
            if (this.game.target?.position) this.game.target.position[axis] = value;
        } else if (this.game.levelRules && property in this.game.levelRules) {
            this.game.levelRules[property] = value;
            if (property === 'gravitationalConstant' && this.game.physics) {
                this.game.physics.gravitationalConstant = value;
            }
        }
        this.game?.invalidateSimulationState?.();
    }

    captureObjectPropertyState(object) {
        const direct = {};
        for (const property of EDITABLE_STATE_PROPERTIES) {
            if (property in object) direct[property] = cloneEditValue(object[property]);
        }
        const orbit = object.orbitSystem ? {
            orbitCenter: cloneEditValue(object.orbitSystem.orbitCenter),
            orbitTargetId: object.orbitSystem.orbitTargetId ?? null,
            orbitRadius: object.orbitSystem.orbitRadius,
            orbitSpeed: object.orbitSystem.orbitSpeed,
            orbitAngle: object.orbitSystem.orbitAngle,
            orbitType: object.orbitSystem.orbitType,
            orbitParams: cloneEditValue(object.orbitSystem.orbitParams),
            velocity: cloneEditValue(object.orbitSystem.velocity),
            gravityStrength: object.orbitSystem.gravityStrength,
            maxGravityAccel: object.orbitSystem.maxGravityAccel
        } : null;
        return {
            direct,
            position: this.getObjectPosition(object),
            pointingAt: cloneEditValue(object.pointingAt),
            orbit
        };
    }

    restoreObjectPropertyState(object, state) {
        Object.assign(object, cloneEditValue(state.direct));
        if (state.position) {
            if (typeof object.x === 'number') {
                object.x = state.position.x;
                object.y = state.position.y;
            } else if (object.position) {
                object.position.x = state.position.x;
                object.position.y = state.position.y;
            }
        }
        if ('pointingAt' in state) object.pointingAt = cloneEditValue(state.pointingAt);
        if (state.orbit && object.orbitSystem) {
            Object.assign(object.orbitSystem, cloneEditValue(state.orbit));
        }
        if (object.constructor.name === 'TextObject' && typeof object.parseHTMLContent === 'function') {
            object.parsedContent = object.parseHTMLContent(object.content);
        }
        this.synchronizeEditedObject(object);
    }

    captureLevelSettingsState() {
        return {
            metadata: cloneEditValue(this.game.levelMetadata ?? {}),
            rules: cloneEditValue({ ...(this.game.levelRules ?? {}) }),
            slingshotPosition: cloneEditValue(this.game.slingshot?.position),
            penguinPosition: this.game.penguin
                ? { x: this.game.penguin.x, y: this.game.penguin.y }
                : null,
            targetPosition: cloneEditValue(this.game.target?.position),
            gravitationalConstant: this.game.physics?.gravitationalConstant
        };
    }

    restoreLevelSettingsState(state) {
        this.game.levelMetadata = cloneEditValue(state.metadata);
        if (this.game.levelRules) Object.assign(this.game.levelRules, cloneEditValue(state.rules));
        if (this.game.slingshot?.position && state.slingshotPosition) {
            Object.assign(this.game.slingshot.position, state.slingshotPosition);
        }
        if (this.game.penguin && state.penguinPosition) {
            Object.assign(this.game.penguin, state.penguinPosition);
        }
        if (this.game.target?.position && state.targetPosition) {
            Object.assign(this.game.target.position, state.targetPosition);
        }
        if (this.game.physics && state.gravitationalConstant !== undefined) {
            this.game.physics.gravitationalConstant = state.gravitationalConstant;
        }
        this.game?.invalidateSimulationState?.();
    }

    editStatesEqual(left, right) {
        return JSON.stringify(left) === JSON.stringify(right);
    }

    synchronizeEditedObject(object) {
        this.game?.invalidateSimulationState?.();
        if (object.constructor.name === 'Planet') {
            this.game.physics?.refreshPlanet?.(object);
            this.refreshPlanetSprite(object);
        } else if (object.constructor.name === 'Target') {
            this.refreshTargetSprite(object);
        }
    }
    
    updateOrbitProperty(property, value, obj = this.selectedObject) {
        if (!obj.orbitSystem) return;
        
        switch (property) {
            case 'orbitTargetType':
                if (value === 'none') {
                    // Disable orbit
                    obj.orbitSystem.orbitCenter = null;
                    obj.orbitSystem.orbitTargetId = null;
                    obj.orbitSystem.orbitRadius = 0;
                    obj.orbitSystem.orbitSpeed = 0;
                } else if (value === 'position') {
                    // Switch to fixed position
                    obj.orbitSystem.orbitTargetId = null;
                    if (!obj.orbitSystem.orbitCenter) {
                        obj.orbitSystem.orbitCenter = { x: obj.position.x, y: obj.position.y };
                    }
                } else if (value === 'object') {
                    // Switch to object targeting
                    obj.orbitSystem.orbitCenter = null;
                    if (!obj.orbitSystem.orbitTargetId) {
                        const availableIds = this.getAvailableObjectIds();
                        if (availableIds.length > 1) {
                            obj.orbitSystem.orbitTargetId = availableIds[1]; // First non-'none' option
                        }
                    }
                }
                this.updateOrbitSystem(obj);
                this.updatePropertiesPanel(); // Refresh UI
                break;
                
            case 'orbitTargetId':
                if (value === 'none') {
                    obj.orbitSystem.orbitTargetId = null;
                } else {
                    obj.orbitSystem.orbitTargetId = value;
                    obj.orbitSystem.orbitCenter = null; // Clear fixed position
                }
                this.updateOrbitSystem(obj);
                break;
                
            case 'orbitCenterX':
                if (!obj.orbitSystem.orbitCenter) {
                    obj.orbitSystem.orbitCenter = { x: 0, y: 0 };
                }
                obj.orbitSystem.orbitCenter.x = value;
                obj.orbitSystem.orbitTargetId = null; // Clear object targeting
                this.updateOrbitSystem(obj);
                break;
                
            case 'orbitCenterY':
                if (!obj.orbitSystem.orbitCenter) {
                    obj.orbitSystem.orbitCenter = { x: 0, y: 0 };
                }
                obj.orbitSystem.orbitCenter.y = value;
                obj.orbitSystem.orbitTargetId = null; // Clear object targeting
                this.updateOrbitSystem(obj);
                break;
                
            case 'orbitRadius':
                obj.orbitSystem.orbitRadius = value;
                this.updateOrbitSystem(obj);
                break;
                
            case 'orbitSpeed':
                obj.orbitSystem.orbitSpeed = value;
                this.updateOrbitSystem(obj);
                break;
                
            case 'orbitType':
                obj.orbitSystem.orbitType = value;
                
                // If switching to gravity orbit and no initial state is stored, save current state
                if (value === LevelOrbitType.GRAVITY && (!obj.orbitSystem.orbitParams || !obj.orbitSystem.orbitParams.initialPosition)) {
                    let objX, objY;
                    if (typeof obj.x === 'number') {
                        objX = obj.x;
                        objY = obj.y;
                    } else if (obj.position) {
                        objX = obj.position.x;
                        objY = obj.position.y;
                    }
                    
                    if (objX !== undefined && objY !== undefined) {
                        if (!obj.orbitSystem.orbitParams) {
                            obj.orbitSystem.orbitParams = {};
                        }
                        
                        obj.orbitSystem.orbitParams.initialPosition = { x: objX, y: objY };
                        
                        // Also set initial velocity if not already set
                        if (!obj.orbitSystem.orbitParams.initialVelocity) {
                            const defaultVelocity = obj.orbitSystem.velocity || { x: 0, y: 3 };
                            obj.orbitSystem.orbitParams.initialVelocity = { ...defaultVelocity };
                        }
                        
                        plog.info('Saved current state as initial state for new gravity orbit');
                    }
                }
                
                this.updateOrbitSystem(obj);
                this.updatePropertiesPanel(); // Refresh UI to show/hide gravity properties
                break;
                
            case 'gravityStrength':
                obj.orbitSystem.gravityStrength = value;
                if (obj.orbitSystem.orbitParams) {
                    obj.orbitSystem.orbitParams.gravityStrength = value;
                }
                break;
                
            case 'velocityX':
                if (!obj.orbitSystem.velocity) obj.orbitSystem.velocity = { x: 0, y: 0 };
                obj.orbitSystem.velocity.x = value;
                if (obj.orbitSystem.orbitParams) {
                    if (!obj.orbitSystem.orbitParams.initialVelocity) {
                        obj.orbitSystem.orbitParams.initialVelocity = { x: 0, y: 0 };
                    }
                    obj.orbitSystem.orbitParams.initialVelocity.x = value;
                }
                break;
                
            case 'velocityY':
                if (!obj.orbitSystem.velocity) obj.orbitSystem.velocity = { x: 0, y: 0 };
                obj.orbitSystem.velocity.y = value;
                if (obj.orbitSystem.orbitParams) {
                    if (!obj.orbitSystem.orbitParams.initialVelocity) {
                        obj.orbitSystem.orbitParams.initialVelocity = { x: 0, y: 0 };
                    }
                    obj.orbitSystem.orbitParams.initialVelocity.y = value;
                }
                break;
                
            // Reset button is now handled as quick action, not property
                
            case 'validateObject':
                // Validate and fix all object values
                this.validateAndFixObjectValues(obj);
                this.updatePropertiesPanel(); // Refresh to show fixed values
                plog.success('Object values validated and fixed');
                
                // TEMPORARY: Also test reset if this is a gravity orbit
                if (obj.orbitSystem && obj.orbitSystem.orbitType === LevelOrbitType.GRAVITY) {
                    plog.debug('TEMP: Also testing reset since this is a gravity orbit');
                    this.resetGravityOrbit(obj);
                }
                break;
        }
        
        plog.debug(`Updated orbit ${property} to ${value}`);
    }
    
    updateOrbitSystem(obj) {
        // Refresh the orbit system with current parameters
        if (obj.orbitSystem.orbitCenter && obj.orbitSystem.orbitRadius > 0) {
            const center = obj.orbitSystem.orbitCenter;
            const radius = obj.orbitSystem.orbitRadius;
            const speed = obj.orbitSystem.orbitSpeed;
            
            switch (obj.orbitSystem.orbitType) {
                case LevelOrbitType.CIRCULAR:
                    obj.orbitSystem.setCircularOrbit(center, radius, speed);
                    break;
                case LevelOrbitType.ELLIPTICAL:
                    // Use radius as semi-major axis, and radius * 0.7 as semi-minor
                    obj.orbitSystem.setEllipticalOrbit(center, radius, radius * 0.7, speed, 0);
                    break;
                case LevelOrbitType.FIGURE_8:
                    obj.orbitSystem.setFigure8Orbit(center, radius, speed);
                    break;
                case LevelOrbitType.GRAVITY:
                    // For gravity orbits, set up initial conditions
                    const initialVelocity = obj.orbitSystem.velocity || PHYSICS_CONFIG.orbit.initialVelocity;
                    const gravityStrength = obj.orbitSystem.gravityStrength ?? PHYSICS_CONFIG.orbit.gravityStrength;
                    obj.orbitSystem.setGravityOrbit(center, initialVelocity, gravityStrength);
                    break;
            }
        }
    }
    
    resetGravityOrbit(obj) {
        plog.debug('resetGravityOrbit called with object:', obj);
        plog.debug('Object orbit system:', obj.orbitSystem);
        plog.debug('Orbit type:', obj.orbitSystem?.orbitType);
        
        if (!obj.orbitSystem || obj.orbitSystem.orbitType !== LevelOrbitType.GRAVITY) {
            plog.warn('Cannot reset gravity orbit: object does not have a gravity orbit system');
            plog.warn('Reset failed: no orbit system or not gravity type');
            return;
        }
        
        plog.info('Starting gravity orbit reset...');
        
        // First, fix any invalid values in the object
        this.validateAndFixObjectValues(obj);
        
        // Set up default orbit center if none exists
        let center = obj.orbitSystem.getResolvedCenter();
        if (!center) {
            // Default to canvas center if no center is defined
            const canvasCenter = {
                x: STAGE_WIDTH / 2,
                y: STAGE_HEIGHT / 2
            };
            obj.orbitSystem.orbitCenter = canvasCenter;
            obj.orbitSystem.orbitTargetId = null;
            center = canvasCenter;
            plog.info('Set default orbit center to canvas center');
        }
        
        // Try to get initial position from orbit parameters first
        let initialX, initialY;
        let hasInitialPosition = false;
        
        if (obj.orbitSystem.orbitParams && obj.orbitSystem.orbitParams.initialPosition) {
            initialX = obj.orbitSystem.orbitParams.initialPosition.x;
            initialY = obj.orbitSystem.orbitParams.initialPosition.y;
            hasInitialPosition = !isNaN(initialX) && !isNaN(initialY);
            if (hasInitialPosition) {
                plog.info('Using stored initial position for reset');
            }
        }
        
        // If no initial position stored, save current position as initial (if valid)
        if (!hasInitialPosition) {
            let currentX, currentY;
            if (typeof obj.x === 'number' && !isNaN(obj.x)) {
                currentX = obj.x;
                currentY = obj.y;
            } else if (obj.position && typeof obj.position.x === 'number' && !isNaN(obj.position.x)) {
                currentX = obj.position.x;
                currentY = obj.position.y;
            }
            
            if (currentX !== undefined && currentY !== undefined) {
                const dx = currentX - center.x;
                const dy = currentY - center.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Only use current position if it's at a reasonable distance from center
                if (distance >= EDITOR_CONFIG.orbitReset.minimumInitialDistance &&
                    distance <= EDITOR_CONFIG.orbitReset.maximumInitialDistance) {
                    initialX = currentX;
                    initialY = currentY;
                    hasInitialPosition = true;
                    plog.info('Using current valid position as initial position');
                }
            }
        }
        
        // If still no valid initial position, create a default one
        if (!hasInitialPosition) {
            initialX = center.x + EDITOR_CONFIG.orbitReset.fallbackInitialDistance;
            initialY = center.y;
            plog.warn(
                `Created default initial position at distance ` +
                `${EDITOR_CONFIG.orbitReset.fallbackInitialDistance} from center`
            );
        }
        
        // Move object back to initial position
        if (typeof obj.x === 'number') {
            obj.x = initialX;
            obj.y = initialY;
        } else if (obj.position) {
            obj.position.x = initialX;
            obj.position.y = initialY;
        }
        
        // Calculate distance from initial position to center
        const dx = initialX - center.x;
        const dy = initialY - center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Set reasonable defaults for gravity system
        const gravityStrength = obj.orbitSystem.gravityStrength && !isNaN(obj.orbitSystem.gravityStrength) ? 
            obj.orbitSystem.gravityStrength : EDITOR_CONFIG.authoringDefaults.orbit.gravityStrength;
        
        // Use current velocity from UI inputs instead of stored initial velocity
        let resetVelocityX, resetVelocityY;
        
        // Get current velocity values from the UI inputs
        const velocityXInput = this.propertiesPanel.querySelector('input[data-property="velocityX"]');
        const velocityYInput = this.propertiesPanel.querySelector('input[data-property="velocityY"]');
        
        if (velocityXInput && velocityYInput) {
            resetVelocityX = parseFloat(velocityXInput.value) || 0;
            resetVelocityY = parseFloat(velocityYInput.value) || 0;
            plog.info(`Using current UI velocity values: x=${resetVelocityX}, y=${resetVelocityY}`);
        } else {
            // Fallback to current orbit system velocity if inputs not found
            resetVelocityX = obj.orbitSystem.velocity?.x || 0;
            resetVelocityY = obj.orbitSystem.velocity?.y || 3;
            plog.info('Using current orbit system velocity as fallback');
        }
        
        // Reset the orbit system completely with initial values
        obj.orbitSystem.orbitType = LevelOrbitType.GRAVITY;
        obj.orbitSystem.gravityStrength = gravityStrength;
        obj.orbitSystem.orbitRadius = distance;
        obj.orbitSystem.orbitSpeed = 3; // Fixed orbital speed for consistency
        obj.orbitSystem.orbitAngle = 0;
        
        // Set velocity from current UI inputs - create new object to avoid reference issues
        obj.orbitSystem.velocity = { 
            x: parseFloat(resetVelocityX), 
            y: parseFloat(resetVelocityY) 
        };
        
        // Clear any accumulated internal state that might interfere
        if (obj.orbitSystem._lastAccel) {
            obj.orbitSystem._lastAccel = { x: 0, y: 0 };
        }
        if (obj.orbitSystem._debugCounter) {
            obj.orbitSystem._debugCounter = 0;
        }
        
        // Store/update orbit parameters (keep initial values for reference, but don't use for reset)
        obj.orbitSystem.orbitParams = {
            gravityStrength: gravityStrength,
            initialVelocity: obj.orbitSystem.orbitParams?.initialVelocity || { x: resetVelocityX, y: resetVelocityY },
            initialPosition: { x: initialX, y: initialY } // Save for future resets
        };
        
        // Validate the velocity was set correctly
        const setVelocity = obj.orbitSystem.velocity;
        if (!setVelocity || isNaN(setVelocity.x) || isNaN(setVelocity.y)) {
            plog.error('Failed to set velocity correctly!', setVelocity);
        } else {
            plog.success('Velocity successfully set:', setVelocity);
            
            // Double-check after a brief moment to ensure it's not being overridden
            setTimeout(() => {
                const checkVelocity = obj.orbitSystem.velocity;
                plog.debug('Velocity check after 100ms:', checkVelocity);
                if (checkVelocity.x !== setVelocity.x || checkVelocity.y !== setVelocity.y) {
                    console.error('ERROR: Velocity was changed after reset!', 
                        'Expected:', setVelocity, 'Actual:', checkVelocity);
                } else {
                    plog.success('✓ Velocity remained stable');
                }
            }, EDITOR_CONFIG.interaction.orbitVerificationMs);
        }
        
        plog.success(`Reset position with current velocity: position=(${initialX.toFixed(1)}, ${initialY.toFixed(1)}), distance=${distance.toFixed(1)}, velocity=(${resetVelocityX.toFixed(2)}, ${resetVelocityY.toFixed(2)}), gravity=${gravityStrength}`);
        
        // Refresh the properties panel to show new values
        this.updatePropertiesPanel();
    }
    
    validateAndFixObjectValues(obj) {
        // Fix position values
        if (typeof obj.x === 'number') {
            if (isNaN(obj.x) || !isFinite(obj.x)) {
                obj.x = STAGE_WIDTH / 2;
                plog.warn('Fixed invalid x position');
            }
            if (isNaN(obj.y) || !isFinite(obj.y)) {
                obj.y = STAGE_HEIGHT / 2;
                plog.warn('Fixed invalid y position');
            }
        } else if (obj.position) {
            if (isNaN(obj.position.x) || !isFinite(obj.position.x)) {
                obj.position.x = STAGE_WIDTH / 2;
                plog.warn('Fixed invalid position.x');
            }
            if (isNaN(obj.position.y) || !isFinite(obj.position.y)) {
                obj.position.y = STAGE_HEIGHT / 2;
                plog.warn('Fixed invalid position.y');
            }
        }
        
        // Fix orbit system values if they exist
        if (obj.orbitSystem) {
            if (obj.orbitSystem.gravityStrength && (isNaN(obj.orbitSystem.gravityStrength) || !isFinite(obj.orbitSystem.gravityStrength))) {
                obj.orbitSystem.gravityStrength = EDITOR_CONFIG.authoringDefaults.orbit.gravityStrength;
                plog.warn('Fixed invalid gravity strength');
            }
            
            if (obj.orbitSystem.velocity) {
                if (isNaN(obj.orbitSystem.velocity.x) || !isFinite(obj.orbitSystem.velocity.x)) {
                    obj.orbitSystem.velocity.x = 0;
                    plog.warn('Fixed invalid velocity.x');
                }
                if (isNaN(obj.orbitSystem.velocity.y) || !isFinite(obj.orbitSystem.velocity.y)) {
                    obj.orbitSystem.velocity.y = 3;
                    plog.warn('Fixed invalid velocity.y');
                }
            }
            
            if (obj.orbitSystem.orbitCenter) {
                if (isNaN(obj.orbitSystem.orbitCenter.x) || !isFinite(obj.orbitSystem.orbitCenter.x)) {
                    obj.orbitSystem.orbitCenter.x = STAGE_WIDTH / 2;
                    plog.warn('Fixed invalid orbit center x');
                }
                if (isNaN(obj.orbitSystem.orbitCenter.y) || !isFinite(obj.orbitSystem.orbitCenter.y)) {
                    obj.orbitSystem.orbitCenter.y = STAGE_HEIGHT / 2;
                    plog.warn('Fixed invalid orbit center y');
                }
            }
        }
    }
    
    getDefaultValue(property) {
        const defaults = {
            // Position properties
            'x': STAGE_WIDTH / 2,
            'y': STAGE_HEIGHT / 2,
            'position.x': STAGE_WIDTH / 2,
            'position.y': STAGE_HEIGHT / 2,
            
            // Size properties
            'radius': LEVEL_DEFAULTS.planet.radius,
            'mass': LEVEL_DEFAULTS.planet.mass,
            'gravitationalReach': LEVEL_DEFAULTS.planet.gravitationalReach,
            'width': LEVEL_DEFAULTS.target.width,
            'height': LEVEL_DEFAULTS.target.height,
            'value': LEVEL_DEFAULTS.bonus.value,
            
            // Orbit properties
            'orbitRadius': EDITOR_CONFIG.authoringDefaults.orbit.radius,
            'orbitSpeed': EDITOR_CONFIG.authoringDefaults.orbit.speed,
            'orbitAngle': 0,
            'orbitCenterX': STAGE_WIDTH / 2,
            'orbitCenterY': STAGE_HEIGHT / 2,
            'gravityStrength': EDITOR_CONFIG.authoringDefaults.orbit.gravityStrength,
            'velocityX': EDITOR_CONFIG.authoringDefaults.orbit.initialVelocity.x,
            'velocityY': EDITOR_CONFIG.authoringDefaults.orbit.initialVelocity.y,
            
            // Physics properties
            'stretchLimit': LEVEL_DEFAULTS.slingshot.maxPullback,
            'velocityMultiplier': LEVEL_DEFAULTS.slingshot.velocityMultiplier,
            'fontSize': LEVEL_DEFAULTS.text.fontSize,
            'padding': LEVEL_DEFAULTS.text.padding
        };
        
        return defaults[property] !== undefined ? defaults[property] : 0;
    }
    
    updateSpriteProperty(property, value, obj = this.selectedObject) {
        
        if (property === 'planetType' && obj.constructor.name === 'Planet') {
            obj.planetType = value;
            this.refreshPlanetSprite(obj);
            plog.debug(`Updated planet sprite to ${value}`);
        } else if (property === 'spriteType' && obj.constructor.name === 'Target') {
            obj.spriteType = value;
            this.refreshTargetSprite(obj);
            plog.debug(`Updated target sprite to ${value}`);
        }
    }
    
    updatePointingAtProperty(property, value, obj = this.selectedObject) {
        
        if (obj.constructor.name === 'PointingArrow') {
            // Initialize pointingAt object if it doesn't exist
            if (!obj.pointingAt) {
                obj.pointingAt = { x: 0, y: 0 };
            }
            
            if (property === 'pointingAtX') {
                obj.pointingAt.x = value;
                plog.debug(`Updated pointing target X to ${value}`);
            } else if (property === 'pointingAtY') {
                obj.pointingAt.y = value;
                plog.debug(`Updated pointing target Y to ${value}`);
            }
            
            // Update visibility - show arrow if it has a target
            if (obj.pointingAt.x !== 0 || obj.pointingAt.y !== 0) {
                obj.visible = true;
            }
        }
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
    
    startDragging(x, y) {
        if (!this.selectedObject) return;
        
        this.dragging = true;
        this.dragStartPosition = this.getObjectPosition(this.selectedObject);
        
        // Handle both coordinate systems
        let objX, objY;
        if (typeof this.selectedObject.x === 'number') {
            objX = this.selectedObject.x;
            objY = this.selectedObject.y;
        } else if (this.selectedObject.position) {
            objX = this.selectedObject.position.x;
            objY = this.selectedObject.position.y;
        }
        
        this.dragOffset.x = x - objX;
        this.dragOffset.y = y - objY;
        plog.debug('Started dragging:', this.selectedObject.constructor.name, 'at', x, y);
    }
    
    updateDragging(x, y) {
        if (!this.dragging || !this.selectedObject) return;
        
        const newX = x - this.dragOffset.x;
        const newY = y - this.dragOffset.y;
        
        // Update coordinates based on object type
        if (typeof this.selectedObject.x === 'number') {
            // Penguin class uses direct x/y properties
            this.selectedObject.x = newX;
            this.selectedObject.y = newY;
        } else if (this.selectedObject.position) {
            // GameObject classes use position.x/y
            this.selectedObject.position.x = newX;
            this.selectedObject.position.y = newY;
        }
        
        plog.debug('Dragging to:', x, y, 'Object now at:', newX, newY);
        
        this.setDisplayedPropertyValue('x', newX);
        this.setDisplayedPropertyValue('y', newY);
    }
    
    stopDragging() {
        if (this.dragging) {
            plog.debug('Stopped dragging');
            const object = this.selectedObject;
            this.recordPositionChange(
                object,
                this.dragStartPosition,
                this.getObjectPosition(object),
                `Move ${object?.constructor?.name ?? 'object'}`
            );
            this.updateObjectList();
        }
        this.dragging = false;
        this.dragStartPosition = null;
    }
    
    startOrbitCenterDragging(x, y, obj) {
        if (!obj || !obj.orbitSystem || !obj.orbitSystem.orbitCenter) return;
        
        this.draggingOrbitCenter = true;
        this.orbitCenterObject = obj;
        this.orbitCenterDragStart = { ...obj.orbitSystem.orbitCenter };
        
        // Calculate offset from click to orbit center
        const center = obj.orbitSystem.orbitCenter;
        this.dragOffset.x = x - center.x;
        this.dragOffset.y = y - center.y;
        
        plog.debug('Started dragging orbit center for:', obj.constructor.name, 'at', x, y);
    }
    
    updateOrbitCenterDragging(x, y) {
        if (!this.draggingOrbitCenter || !this.orbitCenterObject) return;
        
        const newX = x - this.dragOffset.x;
        const newY = y - this.dragOffset.y;
        
        // Update the orbit center
        this.orbitCenterObject.orbitSystem.orbitCenter.x = newX;
        this.orbitCenterObject.orbitSystem.orbitCenter.y = newY;
        
        // Recalculate orbit system with new center
        this.updateOrbitSystem(this.orbitCenterObject);
        
        plog.debug('Dragging orbit center to:', x, y, 'Center now at:', newX, newY);
        
        this.setDisplayedPropertyValue('orbitCenterX', newX);
        this.setDisplayedPropertyValue('orbitCenterY', newY);
    }
    
    stopOrbitCenterDragging() {
        if (this.draggingOrbitCenter) {
            plog.debug('Stopped dragging orbit center');
            const object = this.orbitCenterObject;
            const before = this.orbitCenterDragStart;
            const after = { ...object.orbitSystem.orbitCenter };
            if (before && (before.x !== after.x || before.y !== after.y)) {
                this.history.recordExecuted(LiveEditCommandType.MOVE_ORBIT_CENTER, {
                    object,
                    before,
                    after
                });
            }
            this.updateObjectList();
        }
        this.draggingOrbitCenter = false;
        this.orbitCenterObject = null;
        this.orbitCenterDragStart = null;
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

    recordPositionChange(object, before, after, label) {
        if (!object || !before || !after || (before.x === after.x && before.y === after.y)) return;
        this.history.recordExecuted(LiveEditCommandType.MOVE_OBJECT, {
            object,
            before,
            after,
            label
        });
    }
    
    addObject(className) {
        const centerX = STAGE_WIDTH / 2;
        const centerY = STAGE_HEIGHT / 2;
        
        if (!this.gameObjectClasses || !this.gameObjectClasses[className]) {
            plog.error('Unknown class:', className);
            return;
        }
        
        const ClassConstructor = this.gameObjectClasses[className];
        const existingSingleton = this.mutator.getSingleton(className);
        if (existingSingleton) {
            plog.warn(`${className} is unique in a level; selecting the existing object`);
            this.selectObject(existingSingleton);
            return;
        }
        let newObject;
        
        try {
            // Create object with sensible defaults based on class
            newObject = this.createObjectWithDefaults(ClassConstructor, className, centerX, centerY);
            
            if (newObject) {
                if (!this.addObjectToGame(newObject, className)) return;
                this.selectObject(newObject);
                this.updateObjectList();
                plog.debug('Created new', className, 'at', centerX, centerY);
            }
        } catch (error) {
            plog.error('Failed to create', className, ':', error);
        }
    }
    
    createObjectWithDefaults(ClassConstructor, className, x, y) {
        // Define default parameters for each class type
        const defaults = {
            'Planet': [
                x, y,
                EDITOR_CONFIG.authoringDefaults.planet.radius,
                EDITOR_CONFIG.authoringDefaults.planet.mass,
                EDITOR_CONFIG.authoringDefaults.planet.gravitationalReach,
                EDITOR_CONFIG.authoringDefaults.planet.planetType,
                this.game.assetLoader
            ],
            'Bonus': [x, y, EDITOR_CONFIG.authoringDefaults.bonus.value, this.game.assetLoader],
            'Target': [
                x, y,
                LEVEL_DEFAULTS.target.width,
                LEVEL_DEFAULTS.target.height,
                LEVEL_DEFAULTS.target.spriteType,
                this.game.assetLoader
            ],
            'Slingshot': [x, y, null, null, EDITOR_CONFIG.authoringDefaults.slingshot.maxPullback],
            'TextObject': [x, y, LEVEL_DEFAULTS.text.content, {
                width: LEVEL_DEFAULTS.text.width,
                height: LEVEL_DEFAULTS.text.height,
                fontSize: LEVEL_DEFAULTS.text.fontSize,
                color: LEVEL_DEFAULTS.text.color
            }],
            'PointingArrow': [x, y, { baseWidth: LEVEL_DEFAULTS.pointingArrow.baseWidth }]
        };
        
        const params = defaults[className] || [x, y];
        const newObject = new ClassConstructor(...params);
        
        // Set additional sprite defaults after creation
        this.setObjectSpriteDefaults(newObject, className);
        
        return newObject;
    }
    
    setObjectSpriteDefaults(obj, className) {
        // Set sensible sprite defaults for new objects
        switch (className) {
            case 'Planet':
                if (!obj.planetType) {
                    obj.planetType = 'planet_grey';
                }
                this.refreshPlanetSprite(obj);
                break;
                
            case 'Target':
                if (!obj.spriteType) {
                    obj.spriteType = 'ship_open';
                }
                this.refreshTargetSprite(obj);
                break;
                
            case 'Bonus':
                // Bonus sprites are handled automatically by the Bonus class
                break;
        }
    }
    
    addObjectToGame(obj, className, { recordHistory = true } = {}) {
        // Add name if it doesn't exist
        if (!obj.name) {
            obj.name = this.generateObjectName(obj, className);
        }
        
        // Add ID if it doesn't exist (for consistent export/import)
        if (!obj.id) {
            obj.id = this.generateObjectId(obj, className);
        }
        
        const added = recordHistory
            ? this.history.execute(LiveEditCommandType.ADD_OBJECT, { object: obj, className })
            : this.mutator.addObject(obj, className);
        if (!added) {
            plog.warn(`Could not add ${className} to the live level`);
            return false;
        }
        return true;
    }

    refreshAfterHistory(selection) {
        this.selectObject(selection);
    }
    
    generateObjectName(obj, className) {
        const usedNames = new Set(
            this.getAllGameObjects()
                .filter(existingObj => existingObj !== obj && typeof existingObj.name === 'string')
                .map(existingObj => existingObj.name)
        );
        let number = 1;
        while (usedNames.has(`${className} ${number}`)) number++;
        return `${className} ${number}`;
    }
    
    generateObjectId(obj, className) {
        const prefix = className.toLowerCase();
        const usedIds = new Set(
            this.getAllGameObjects()
                .filter(existingObj => existingObj !== obj && typeof existingObj.id === 'string')
                .map(existingObj => existingObj.id)
        );
        let number = 1;
        while (usedIds.has(`${prefix}_${number}`)) number++;
        return `${prefix}_${number}`;
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
        menu.style.cssText = `
            position: fixed;
            background: rgba(0, 0, 0, 0.9);
            border: 1px solid #555;
            border-radius: 8px;
            padding: 8px 0;
            z-index: 1000;
            color: white;
            font-family: Arial, sans-serif;
            font-size: 14px;
            min-width: 150px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        
        // Convert canvas coordinates to screen coordinates
        const screenPoint = stageToScreen(this.game.canvas, this.game.viewport, x, y);
        const screenX = screenPoint.x;
        const screenY = screenPoint.y;
        
        // Position menu, ensuring it stays on screen
        menu.style.left = Math.min(screenX, window.innerWidth - 200) + 'px';
        menu.style.top = Math.min(screenY, window.innerHeight - 300) + 'px';
        
        // Add menu items for object creation
        const editableClasses = this.getEditableObjectClasses();
        editableClasses.forEach(className => {
            const item = createButton(`Add ${className}`, () => {
                this.addObjectAtPosition(className, x, y);
                menu.remove();
            }, {
                backgroundColor: 'transparent',
                hoverColor: '#333',
                textColor: 'white',
                borderColor: 'transparent'
            });
            item.style.cssText += `
                padding: 12px 16px;
                border-bottom: 1px solid #333;
                min-height: 20px;
                touch-action: manipulation;
            `;
            item.style.borderBottom = '1px solid #333';
            
            menu.appendChild(item);
        });
        
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
    
    addObjectAtPosition(className, x, y) {
        if (!this.gameObjectClasses || !this.gameObjectClasses[className]) {
            console.error('Unknown class:', className);
            return;
        }
        
        const ClassConstructor = this.gameObjectClasses[className];
        const existingSingleton = this.mutator.getSingleton(className);
        if (existingSingleton) {
            plog.warn(`${className} is unique in a level; selecting the existing object`);
            this.selectObject(existingSingleton);
            return;
        }
        let newObject;
        
        try {
            // Create object at the specified position
            newObject = this.createObjectWithDefaults(ClassConstructor, className, x, y);
            
            if (newObject) {
                if (!this.addObjectToGame(newObject, className)) return;
                this.selectObject(newObject);
                this.updateObjectList();
                plog.debug('Created new', className, 'at', x, y);
            }
        } catch (error) {
            plog.error('Failed to create', className, ':', error);
        }
    }

    exportLevel() {
        const levelData = this.game.exportCurrentLevel();
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
        if (this.mutator.getSingleton(selectedClassName)) {
            plog.warn(`${selectedClassName} is unique in a level and cannot be cloned`);
            return;
        }
        
        const clonedObject = this.cloneObject(this.selectedObject);
        if (clonedObject) {
            // Offset the clone slightly so it's visible
            const offsetX = EDITOR_CONFIG.cloneOffset.x;
            const offsetY = EDITOR_CONFIG.cloneOffset.y;
            
            if (typeof clonedObject.x === 'number') {
                clonedObject.x += offsetX;
                clonedObject.y += offsetY;
            } else if (clonedObject.position) {
                clonedObject.position.x += offsetX;
                clonedObject.position.y += offsetY;
            }
            
            // Also offset orbit center if it exists
            if (clonedObject.orbitSystem && clonedObject.orbitSystem.orbitCenter) {
                clonedObject.orbitSystem.orbitCenter.x += offsetX;
                clonedObject.orbitSystem.orbitCenter.y += offsetY;
            }
            
            // Add to game
            const className = clonedObject.constructor.name;
            if (!this.addObjectToGame(clonedObject, className)) return;
            
            // Select the new clone
            this.selectObject(clonedObject);
            
            // Update object list
            this.updateObjectList();
            
            plog.debug('Cloned', className);
        }
    }
    
    cloneObject(obj) {
        const className = obj.constructor.name;
        const ClassConstructor = this.gameObjectClasses[className];
        
        if (!ClassConstructor) {
            plog.error('Cannot clone object - unknown class:', className);
            return null;
        }
        
        try {
            // Create a deep copy by serializing and deserializing the object properties
            const objData = this.serializeObject(obj);
            const clonedObject = this.deserializeObject(objData, ClassConstructor);
            
            plog.debug('Cloned object data:', objData);
            return clonedObject;
        } catch (error) {
            plog.error('Failed to clone object:', error);
            return null;
        }
    }
    
    serializeObject(obj) {
        const data = {
            className: obj.constructor.name,
            properties: {}
        };
        
        // Serialize basic properties including name
        const basicProps = ['name', 'x', 'y', 'width', 'height', 'radius', 'mass', 'rotation', 'alpha', 'visible'];
        basicProps.forEach(prop => {
            if (obj[prop] !== undefined) {
                data.properties[prop] = obj[prop];
            }
        });
        
        // Handle position object
        if (obj.position) {
            data.properties.position = { x: obj.position.x, y: obj.position.y };
        }
        
        // Handle class-specific properties
        switch (obj.constructor.name) {
            case 'Planet':
                ['planetType', 'collisionRadius', 'gravitationalReach', 'color'].forEach(prop => {
                    if (obj[prop] !== undefined) data.properties[prop] = obj[prop];
                });
                break;
            case 'Bonus':
                ['value', 'rotationSpeed', 'state'].forEach(prop => {
                    if (obj[prop] !== undefined) data.properties[prop] = obj[prop];
                });
                break;
            case 'Target':
                ['spriteType'].forEach(prop => {
                    if (obj[prop] !== undefined) data.properties[prop] = obj[prop];
                });
                break;
            case 'Slingshot':
                ['maxPullback', 'velocityMultiplier', 'anchorX', 'anchorY'].forEach(prop => {
                    if (obj[prop] !== undefined) data.properties[prop] = obj[prop];
                });
                break;
            case 'TextObject':
                ['content', 'fontSize', 'color', 'fontFamily', 'textAlign', 'backgroundColor', 'padding', 'maxWidth', 'autoSize'].forEach(prop => {
                    if (obj[prop] !== undefined) data.properties[prop] = obj[prop];
                });
                break;
            case 'PointingArrow':
                ['pointingAt', 'baseWidth', 'color', 'glowColor', 'scaleWithDistance'].forEach(prop => {
                    if (obj[prop] !== undefined) {
                        if (prop === 'pointingAt' && obj[prop]) {
                            data.properties[prop] = { x: obj[prop].x, y: obj[prop].y };
                        } else {
                            data.properties[prop] = obj[prop];
                        }
                    }
                });
                break;
        }
        
        // Handle orbit system
        if (obj.orbitSystem) {
            data.properties.orbitSystem = {
                orbitCenter: obj.orbitSystem.orbitCenter ? { x: obj.orbitSystem.orbitCenter.x, y: obj.orbitSystem.orbitCenter.y } : null,
                orbitRadius: obj.orbitSystem.orbitRadius,
                orbitSpeed: obj.orbitSystem.orbitSpeed,
                orbitAngle: obj.orbitSystem.orbitAngle,
                orbitType: obj.orbitSystem.orbitType,
                orbitParams: JSON.parse(JSON.stringify(obj.orbitSystem.orbitParams || {}))
            };
        }
        
        return data;
    }
    
    deserializeObject(data, ClassConstructor) {
        const props = data.properties;
        let clonedObject;
        
        // Create object with appropriate constructor parameters
        switch (data.className) {
            case 'Planet':
                clonedObject = new ClassConstructor(
                    props.position?.x ?? props.x ?? 0,
                    props.position?.y ?? props.y ?? 0,
                    props.radius ?? EDITOR_CONFIG.authoringDefaults.planet.radius,
                    props.mass ?? EDITOR_CONFIG.authoringDefaults.planet.mass,
                    props.gravitationalReach ?? EDITOR_CONFIG.authoringDefaults.planet.gravitationalReach,
                    props.planetType ?? EDITOR_CONFIG.authoringDefaults.planet.planetType,
                    this.game.assetLoader
                );
                clonedObject.collisionRadius = props.collisionRadius ??
                    (clonedObject.radius + LEVEL_DEFAULTS.planet.collisionPadding);
                break;
            case 'Bonus':
                clonedObject = new ClassConstructor(
                    props.position?.x ?? props.x ?? 0,
                    props.position?.y ?? props.y ?? 0,
                    props.value ?? EDITOR_CONFIG.authoringDefaults.bonus.value,
                    this.game.assetLoader
                );
                break;
            case 'Target':
                clonedObject = new ClassConstructor(
                    props.position?.x ?? props.x ?? 0,
                    props.position?.y ?? props.y ?? 0,
                    props.width ?? LEVEL_DEFAULTS.target.width,
                    props.height ?? LEVEL_DEFAULTS.target.height,
                    props.spriteType ?? LEVEL_DEFAULTS.target.spriteType,
                    this.game.assetLoader
                );
                break;
            case 'Slingshot':
                clonedObject = new ClassConstructor(
                    props.position?.x ?? props.x ?? 0,
                    props.position?.y ?? props.y ?? 0,
                    props.anchorX,
                    props.anchorY,
                    props.maxPullback ?? EDITOR_CONFIG.authoringDefaults.slingshot.maxPullback
                );
                break;
            case 'TextObject':
                clonedObject = new ClassConstructor(
                    props.position?.x ?? props.x ?? 0,
                    props.position?.y ?? props.y ?? 0,
                    props.content ?? EDITOR_CONFIG.deserializationFallbacks.textContent,
                    {
                        width: props.width ?? LEVEL_DEFAULTS.text.width,
                        height: props.height ?? LEVEL_DEFAULTS.text.height,
                        fontSize: props.fontSize ?? LEVEL_DEFAULTS.text.fontSize,
                        color: props.color ?? EDITOR_CONFIG.deserializationFallbacks.textColor,
                        fontFamily: props.fontFamily,
                        textAlign: props.textAlign,
                        backgroundColor: props.backgroundColor,
                        padding: props.padding,
                        maxWidth: props.maxWidth,
                        autoSize: props.autoSize
                    }
                );
                break;
            case 'PointingArrow':
                clonedObject = new ClassConstructor(
                    props.position?.x ?? props.x ?? 0,
                    props.position?.y ?? props.y ?? 0,
                    {
                        baseWidth: props.baseWidth ?? LEVEL_DEFAULTS.pointingArrow.baseWidth,
                        color: props.color,
                        glowColor: props.glowColor,
                        scaleWithDistance: props.scaleWithDistance
                    }
                );
                if (props.pointingAt) {
                    clonedObject.pointingAt = { x: props.pointingAt.x, y: props.pointingAt.y };
                }
                break;
            default:
                // Generic fallback
                clonedObject = new ClassConstructor(
                    props.position?.x ?? props.x ?? 0,
                    props.position?.y ?? props.y ?? 0
                );
        }
        
        // Copy other properties
        Object.keys(props).forEach(key => {
            if (key !== 'position' && key !== 'x' && key !== 'y' && key !== 'orbitSystem') {
                if (key === 'name' || clonedObject[key] !== undefined) {
                    clonedObject[key] = props[key];
                }
            }
        });
        
        // Restore orbit system
        if (props.orbitSystem) {
            clonedObject.orbitSystem = new OrbitSystem();
            const orbit = props.orbitSystem;
            clonedObject.orbitSystem.orbitCenter = orbit.orbitCenter;
            clonedObject.orbitSystem.orbitRadius = orbit.orbitRadius;
            clonedObject.orbitSystem.orbitSpeed = orbit.orbitSpeed;
            clonedObject.orbitSystem.orbitAngle = orbit.orbitAngle;
            clonedObject.orbitSystem.orbitType = orbit.orbitType;
            clonedObject.orbitSystem.orbitParams = orbit.orbitParams;
        }
        
        return clonedObject;
    }
    
    updateObjectList() {
        this.objectListView.render();
    }

    getAllGameObjects() {
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
        
        return allObjects;
    }
    
    selectObjectFromList(index) {
        this.objectListView.selectIndex(index);
    }

    selectLevelSettings() {
        this.selectObject(this.levelSettingsNode);
    }
    
    render(ctx) {
        this.overlayRenderer.render(ctx);
    }

    // Sprite option methods
    getPlanetSpriteOptions() {
        // Get available planet sprites from the game's asset loader
        const options = ['planet_grey', 'planet_pink', 'planet_red_gumball', 'planet_saturn', 'planet_sun'];
        return options;
    }
    
    getShipSpriteOptions() {
        // Get available ship sprites for targets
        const options = ['ship_closed', 'ship_open'];
        return options;
    }
    
    getBonusSpriteOptions() {
        // Get available bonus sprites
        const options = ['bonus', 'bonus_hit'];
        return options;
    }
}

export default LevelEditor;
