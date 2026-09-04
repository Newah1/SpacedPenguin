/**
 * Runtime-only compatibility for callers without an authored LevelDocument.
 * Normal editor authoring uses DocumentMutationService through EditorCommandBus.
 * Keep this adapter isolated until its remaining diagnostic/test callers migrate.
 */
import plog from '../../diagnostics/penguinLogger.js';
import { LevelOrbitType } from '../../levels/levelSchema.js';
import { EDITOR_CONFIG } from '../../config/editorConfig.js';
import { PHYSICS_CONFIG } from '../../config/gameConfig.js';
import { ORBIT_EDITOR_PROPERTY_KEYS, WAYPOINT_EDITOR_PROPERTY_KEYS } from '../../config/editorInspectorConfig.js';
import { getGameObjectDefinition } from '../../runtime/gameObjectRegistry.js';
import { WaypointSystem } from '../../simulation/waypointSimulation.js';

const ORBIT_EDITOR_PROPERTIES = new Set(ORBIT_EDITOR_PROPERTY_KEYS);
const WAYPOINT_EDITOR_PROPERTIES = new Set(WAYPOINT_EDITOR_PROPERTY_KEYS);

export function applyObjectProperty(editor, object, property, value) {
    if (property === 'name') {
        object.name = value;
        editor.updateObjectList();
        plog.debug(`Updated object name to: ${value}`);
    } else if (property === 'x' || property === 'y') {
        if (typeof object.x === 'number') {
            object[property] = value;
        } else if (object.position) {
            object.position[property] = value;
        }
    } else if (ORBIT_EDITOR_PROPERTIES.has(property)) {
        updateOrbitProperty(editor, property, value, object);
    } else if (WAYPOINT_EDITOR_PROPERTIES.has(property) || /^waypoint\d+[XY]$/.test(property)) {
        updateWaypointProperty(editor, property, value, object);
    } else if (getGameObjectDefinition(object.levelType ?? object.constructor.name).applyRuntimeProperty?.({
        object, property, value, editor
    })) {
        plog.debug(`Applied ${property} to ${object.constructor.name}`);
    } else if (property in object) {
        object[property] = value;
        plog.debug(`Updated ${property} to ${value}`);
    }
    synchronizeEditedObject(editor, object);
}

export function updateLevelSetting(editor, property, value) {
    editor.game.levelMetadata ||= { name: '', description: '' };

    if (property === 'levelName') {
        editor.game.levelMetadata.name = value;
    } else if (property === 'levelDescription') {
        editor.game.levelMetadata.description = value;
    } else if (property === 'playfieldWidth' || property === 'playfieldHeight') {
        const dimension = property === 'playfieldWidth' ? 'width' : 'height';
        editor.game.stageRect[dimension] = value;
        const bufferX = EDITOR_CONFIG.playfield.lossBufferX;
        const bufferY = EDITOR_CONFIG.playfield.lossBufferY;
        editor.game.flightRect = {
            x: editor.game.stageRect.x - bufferX,
            y: editor.game.stageRect.y - bufferY,
            width: editor.game.stageRect.width + bufferX * 2,
            height: editor.game.stageRect.height + bufferY * 2
        };
        if (!editor.game.cameraConfig) editor.game.cameraConfig = { mode: 'fit' };
        editor.game.arrow?.setFlightRect(editor.game.flightRect);
        editor.game.resetWorldCamera();
        editor.fitEditorCamera();
    } else if (property === 'cameraMode') {
        editor.game.cameraConfig = value === 'legacy'
            ? null
            : { ...(editor.game.cameraConfig || {}), mode: value };
        editor.game.resetWorldCamera();
    } else if (property === 'cameraZoom') {
        editor.game.cameraConfig = { ...(editor.game.cameraConfig || {}), mode: editor.game.cameraConfig?.mode || 'follow', zoom: value };
        editor.game.resetWorldCamera();
    } else if (property === 'startX' || property === 'startY') {
        const axis = property === 'startX' ? 'x' : 'y';
        if (editor.game.slingshot?.position) editor.game.slingshot.position[axis] = value;
        if (editor.game.slingshot?.resetPosition) editor.game.slingshot.resetPosition[axis] = value;
        if (editor.game.penguin) editor.game.penguin[axis] = value;
    } else if (property === 'targetX' || property === 'targetY') {
        const axis = property === 'targetX' ? 'x' : 'y';
        if (editor.game.target?.position) editor.game.target.position[axis] = value;
    } else if (editor.game.levelRules && property in editor.game.levelRules) {
        editor.game.levelRules[property] = value;
        if (property === 'gravitationalConstant' && editor.game.physics) {
            editor.game.physics.gravitationalConstant = value;
        }
    }
    editor.game?.invalidateSimulationState?.();
}

export function synchronizeEditedObject(editor, object) {
    editor.game?.invalidateSimulationState?.();
    editor.overlayRenderer?.runtimeController?.invalidatePreview();
    getGameObjectDefinition(object.levelType ?? object.constructor.name).afterRuntimePropertyChanged?.({
        object,
        editor
    });
}

function updateOrbitProperty(editor, property, value, obj = editor.selectedObject) {
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
                    const availableIds = editor.getAvailableObjectIds();
                    if (availableIds.length > 1) {
                        obj.orbitSystem.orbitTargetId = availableIds[1]; // First non-'none' option
                    }
                }
            }
            updateOrbitSystem(editor, obj);
            editor.updatePropertiesPanel(); // Refresh UI
            break;
            
        case 'orbitTargetId':
            if (value === 'none') {
                obj.orbitSystem.orbitTargetId = null;
            } else {
                obj.orbitSystem.orbitTargetId = value;
                obj.orbitSystem.orbitCenter = null; // Clear fixed position
            }
            updateOrbitSystem(editor, obj);
            break;
            
        case 'orbitCenterX':
            if (!obj.orbitSystem.orbitCenter) {
                obj.orbitSystem.orbitCenter = { x: 0, y: 0 };
            }
            obj.orbitSystem.orbitCenter.x = value;
            obj.orbitSystem.orbitTargetId = null; // Clear object targeting
            updateOrbitSystem(editor, obj);
            break;
            
        case 'orbitCenterY':
            if (!obj.orbitSystem.orbitCenter) {
                obj.orbitSystem.orbitCenter = { x: 0, y: 0 };
            }
            obj.orbitSystem.orbitCenter.y = value;
            obj.orbitSystem.orbitTargetId = null; // Clear object targeting
            updateOrbitSystem(editor, obj);
            break;
            
        case 'orbitRadius':
            obj.orbitSystem.orbitRadius = value;
            updateOrbitSystem(editor, obj);
            break;
            
        case 'orbitSpeed':
            obj.orbitSystem.orbitSpeed = value;
            updateOrbitSystem(editor, obj);
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
            
            updateOrbitSystem(editor, obj);
            editor.updatePropertiesPanel(); // Refresh UI to show/hide gravity properties
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
            validateAndFixObjectValues(editor, obj);
            editor.updatePropertiesPanel(); // Refresh to show fixed values
            plog.success('Object values validated and fixed');
            
            // TEMPORARY: Also test reset if editor is a gravity orbit
            if (obj.orbitSystem && obj.orbitSystem.orbitType === LevelOrbitType.GRAVITY) {
                plog.debug('TEMP: Also testing reset since editor is a gravity orbit');
                editor.resetGravityOrbit(obj);
            }
            break;
    }
    
    plog.debug(`Updated orbit ${property} to ${value}`);
}

function updateWaypointProperty(editor, property, value, obj = editor.selectedObject) {
    if (property === 'waypointMode' && value === 'none') {
        obj.waypointSystem = null;
    } else {
        if (!obj.waypointSystem) {
            const position = editor.getObjectPosition(obj) || editor.getPlayfieldCenter();
            obj.waypointSystem = new WaypointSystem({
                waypoints: [position, { x: position.x + 100, y: position.y }],
                speed: 60,
                mode: value === 'loop' ? 'loop' : 'pingpong'
            });
            obj.orbitSystem = null;
        }
        const system = obj.waypointSystem;
        if (property === 'waypointMode') system.mode = value;
        else if (property === 'waypointSpeed') system.speed = value;
        else if (property === 'waypointAdd') {
            const last = system.waypoints.at(-1) || editor.getObjectPosition(obj);
            system.waypoints.push({ x: last.x + 100, y: last.y });
        } else if (property === 'waypointRemove' && system.waypoints.length > 2) {
            system.waypoints.pop();
        } else {
            const match = property.match(/^waypoint(\d+)([XY])$/);
            if (match) system.waypoints[Number(match[1])][match[2].toLowerCase()] = value;
        }
    }
    synchronizeEditedObject(editor, obj);
    editor.updatePropertiesPanel();
}

function updateOrbitSystem(editor, obj) {
    const orbit = obj.orbitSystem;
    if (!orbit) return;
    orbit.gameObjectLookup = id => editor.objectService?.find(id) ||
        editor.getAllGameObjects().find(object => object?.id === id) || null;
    const center = orbit.orbitTargetId || orbit.orbitCenter;

    // Refresh the orbit system with current parameters.
    if (center && orbit.orbitRadius > 0) {
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
                obj.orbitSystem.setGravityOrbit(
                    center,
                    initialVelocity,
                    gravityStrength,
                    editor.getObjectPosition(obj)
                );
                break;
        }
    }
}

export function applyGravityOrbitReset(editor, obj) {
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
    validateAndFixObjectValues(editor, obj);
    
    // Set up default orbit center if none exists
    let center = obj.orbitSystem.getResolvedCenter();
    if (!center) {
        // Default to canvas center if no center is defined
        const canvasCenter = editor.getPlayfieldCenter();
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
    const velocityXInput = editor.propertiesPanel.querySelector('input[data-property="velocityX"]');
    const velocityYInput = editor.propertiesPanel.querySelector('input[data-property="velocityY"]');
    
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
    editor.updatePropertiesPanel();
}

function validateAndFixObjectValues(editor, obj) {
    const center = editor.getPlayfieldCenter();
    // Fix position values
    if (typeof obj.x === 'number') {
        if (isNaN(obj.x) || !isFinite(obj.x)) {
            obj.x = center.x;
            plog.warn('Fixed invalid x position');
        }
        if (isNaN(obj.y) || !isFinite(obj.y)) {
            obj.y = center.y;
            plog.warn('Fixed invalid y position');
        }
    } else if (obj.position) {
        if (isNaN(obj.position.x) || !isFinite(obj.position.x)) {
            obj.position.x = center.x;
            plog.warn('Fixed invalid position.x');
        }
        if (isNaN(obj.position.y) || !isFinite(obj.position.y)) {
            obj.position.y = center.y;
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
                obj.orbitSystem.orbitCenter.x = center.x;
                plog.warn('Fixed invalid orbit center x');
            }
            if (isNaN(obj.orbitSystem.orbitCenter.y) || !isFinite(obj.orbitSystem.orbitCenter.y)) {
                obj.orbitSystem.orbitCenter.y = center.y;
                plog.warn('Fixed invalid orbit center y');
            }
        }
    }
}
