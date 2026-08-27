import { deepFreeze } from './configUtils.js';
import { EDITOR_CONFIG } from './editorConfig.js';
import { LEVEL_DEFAULTS, PHYSICS_CONFIG } from './gameConfig.js';
import { LEVEL_CAMERA_MODES, LEVEL_ORBIT_TYPES, LevelOrbitType } from '../levelObjectVocabulary.js';
import { WAYPOINT_PATH_MODES } from '../waypointSimulation.js';

const EDITOR_CAMERA_MODES = deepFreeze(['legacy', ...LEVEL_CAMERA_MODES]);

export const EditorOptionCatalog = Object.freeze({
    PLANET_SPRITES: 'planetSprites',
    SHIP_SPRITES: 'shipSprites',
    ORBIT_TARGET_IDS: 'orbitTargetIds'
});

export const EDITOR_SPRITE_OPTIONS = deepFreeze({
    planetSprites: [
        'planet_grey',
        'planet_pink',
        'planet_red_gumball',
        'planet_saturn',
        'planet_sun'
    ],
    shipSprites: ['ship_closed', 'ship_open'],
    bonusSprites: ['bonus', 'bonus_hit']
});

export const EDITABLE_STATE_PROPERTIES = deepFreeze([
    'name', 'rotation', 'alpha', 'visible', 'radius', 'width', 'height', 'mass',
    'collisionRadius', 'gravitationalReach', 'color', 'planetType', 'value',
    'rotationSpeed', 'state', 'spriteType', 'maxPullback', 'stretchLimit',
    'velocityMultiplier', 'content', 'fontSize', 'fontFamily', 'textAlign',
    'backgroundColor', 'padding', 'maxWidth', 'autoSize', 'baseWidth',
    'glowColor', 'scaleWithDistance', 'playSound', 'pairedPortalId'
]);

export const BASIC_SERIALIZED_OBJECT_PROPERTIES = deepFreeze([
    'id', 'name', 'x', 'y', 'width', 'height', 'radius', 'mass',
    'rotation', 'alpha', 'visible'
]);

export const ORBIT_EDITOR_PROPERTY_KEYS = deepFreeze([
    'orbitTargetType', 'orbitTargetId', 'orbitCenterX', 'orbitCenterY',
    'orbitRadius', 'orbitSpeed', 'orbitType', 'gravityStrength',
    'velocityX', 'velocityY', 'validateObject'
]);

export const WAYPOINT_EDITOR_PROPERTY_KEYS = deepFreeze([
    'waypointMode', 'waypointSpeed', 'waypointAdd', 'waypointRemove'
]);

export const COMMON_OBJECT_PROPERTY_FIELDS = deepFreeze({
    name: { label: 'Name', key: 'name', type: 'text' },
    x: { label: 'X Position', key: 'x', type: 'number' },
    y: { label: 'Y Position', key: 'y', type: 'number' },
    rotation: { label: 'Rotation', key: 'rotation', type: 'number' },
    alpha: { label: 'Alpha', key: 'alpha', type: 'number', min: 0, max: 1, step: 0.1 },
    visible: { label: 'Visible', key: 'visible', type: 'checkbox' }
});

export const LEVEL_SETTING_FIELDS = deepFreeze([
    { label: 'Level Name', key: 'levelName', type: 'text' },
    { label: 'Description', key: 'levelDescription', type: 'text' },
    { label: 'Playfield Width', key: 'playfieldWidth', type: 'number', min: EDITOR_CONFIG.playfield.minimumWidth, max: EDITOR_CONFIG.playfield.maximumDimension, step: 50 },
    { label: 'Playfield Height', key: 'playfieldHeight', type: 'number', min: EDITOR_CONFIG.playfield.minimumHeight, max: EDITOR_CONFIG.playfield.maximumDimension, step: 50 },
    { label: 'Gameplay Camera', key: 'cameraMode', type: 'select', options: EDITOR_CAMERA_MODES },
    { label: 'Follow Zoom', key: 'cameraZoom', type: 'number', min: EDITOR_CONFIG.playfield.minimumZoom, max: EDITOR_CONFIG.playfield.maximumZoom, step: 0.05 },
    { label: 'Start X', key: 'startX', type: 'number' },
    { label: 'Start Y', key: 'startY', type: 'number' },
    { label: 'Target X', key: 'targetX', type: 'number' },
    { label: 'Target Y', key: 'targetY', type: 'number' },
    { label: 'Max Tries', key: 'maxTries', type: 'nullableNumber', min: 1, step: 1 },
    { label: 'Time Limit', key: 'timeLimit', type: 'nullableNumber', min: 0.01 },
    { label: 'Score Multiplier', key: 'scoreMultiplier', type: 'number', min: 0.01 },
    { label: 'Required Bonuses', key: 'requiredBonuses', type: 'nullableNumber', min: 0, dynamicMax: 'bonusCount', step: 1 },
    { label: 'Allowed Misses', key: 'allowedMisses', type: 'nullableNumber', min: 0, step: 1 },
    { label: 'Gravitational Constant', key: 'gravitationalConstant', type: 'number', min: 0 }
]);

export const ORBIT_PROPERTY_FIELDS = deepFreeze({
    targetType: {
        label: 'Orbit Target', key: 'orbitTargetType', type: 'select',
        options: ['none', 'position', 'object']
    },
    targetId: {
        label: 'Target Object ID', key: 'orbitTargetId', type: 'select',
        optionsFrom: EditorOptionCatalog.ORBIT_TARGET_IDS
    },
    centerX: { label: 'Orbit Center X', key: 'orbitCenterX', type: 'number' },
    centerY: { label: 'Orbit Center Y', key: 'orbitCenterY', type: 'number' },
    radius: { label: 'Orbit Radius', key: 'orbitRadius', type: 'number', min: 0 },
    speed: { label: 'Orbit Speed', key: 'orbitSpeed', type: 'number' },
    type: { label: 'Orbit Type', key: 'orbitType', type: 'select', options: LEVEL_ORBIT_TYPES },
    gravityStrength: {
        label: 'Gravity Strength', key: 'gravityStrength', type: 'number',
        min: 100, max: 10000, step: 100
    },
    velocityX: { label: 'Initial Velocity X', key: 'velocityX', type: 'number' },
    velocityY: { label: 'Initial Velocity Y', key: 'velocityY', type: 'number' },
    validate: {
        label: 'Validate & Fix Values', key: 'validateObject', type: 'button',
        buttonText: 'Fix Invalid Values'
    }
});

export const WAYPOINT_PROPERTY_FIELDS = deepFreeze({
    mode: {
        label: 'Waypoint Motion', key: 'waypointMode', type: 'select',
        options: ['none', ...WAYPOINT_PATH_MODES]
    },
    speed: { label: 'Waypoint Speed', key: 'waypointSpeed', type: 'number', min: 0 },
    add: { label: 'Waypoints', key: 'waypointAdd', type: 'button', buttonText: 'Add Waypoint' },
    remove: { label: 'Waypoints', key: 'waypointRemove', type: 'button', buttonText: 'Remove Last Waypoint' }
});

export const EDITOR_NUMERIC_FALLBACKS = deepFreeze({
    radius: LEVEL_DEFAULTS.planet.radius,
    mass: LEVEL_DEFAULTS.planet.mass,
    gravitationalReach: LEVEL_DEFAULTS.planet.gravitationalReach,
    width: LEVEL_DEFAULTS.target.width,
    height: LEVEL_DEFAULTS.target.height,
    value: LEVEL_DEFAULTS.bonus.value,
    orbitRadius: EDITOR_CONFIG.authoringDefaults.orbit.radius,
    orbitSpeed: EDITOR_CONFIG.authoringDefaults.orbit.speed,
    orbitAngle: 0,
    gravityStrength: EDITOR_CONFIG.authoringDefaults.orbit.gravityStrength,
    velocityX: EDITOR_CONFIG.authoringDefaults.orbit.initialVelocity.x,
    velocityY: EDITOR_CONFIG.authoringDefaults.orbit.initialVelocity.y,
    waypointSpeed: 60,
    stretchLimit: LEVEL_DEFAULTS.slingshot.maxPullback,
    velocityMultiplier: LEVEL_DEFAULTS.slingshot.velocityMultiplier,
    fontSize: LEVEL_DEFAULTS.text.fontSize,
    padding: LEVEL_DEFAULTS.text.padding
});

export const EDITOR_INSPECTOR_DEFAULTS = deepFreeze({
    cameraMode: 'legacy',
    cameraZoom: 1,
    scoreMultiplier: 1,
    gravitationalConstant: PHYSICS_CONFIG.gravitationalConstant,
    orbitType: LevelOrbitType.CIRCULAR
});
