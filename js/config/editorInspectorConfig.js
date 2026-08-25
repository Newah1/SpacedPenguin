import { deepFreeze } from './configUtils.js';
import { EDITOR_CONFIG } from './editorConfig.js';
import { LEVEL_DEFAULTS, PHYSICS_CONFIG } from './gameConfig.js';
import { LEVEL_CAMERA_MODES, LEVEL_ORBIT_TYPES, LevelOrbitType } from '../levelObjectVocabulary.js';

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

export const EDITOR_OBJECT_SPRITE_DEFAULTS = deepFreeze({
    Planet: {
        property: 'planetType',
        value: EDITOR_CONFIG.authoringDefaults.planet.planetType,
        refreshMethod: 'refreshPlanetSprite'
    },
    Target: {
        property: 'spriteType',
        value: LEVEL_DEFAULTS.target.spriteType,
        refreshMethod: 'refreshTargetSprite'
    }
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

export const CLASS_SERIALIZED_OBJECT_PROPERTIES = deepFreeze({
    Planet: ['planetType', 'collisionRadius', 'gravitationalReach', 'color'],
    BlackHole: ['gravitationalReach', 'collisionRadius', 'collidable'],
    Bonus: ['value', 'rotationSpeed', 'state'],
    Target: ['spriteType'],
    Slingshot: ['maxPullback', 'velocityMultiplier', 'anchorX', 'anchorY'],
    TextObject: [
        'content', 'fontSize', 'color', 'fontFamily', 'textAlign',
        'backgroundColor', 'padding', 'maxWidth', 'autoSize'
    ],
    PointingArrow: ['pointingAt', 'baseWidth', 'color', 'glowColor', 'scaleWithDistance'],
    Portal: ['pairedPortalId', 'color', 'playSound']
});

export const ORBIT_EDITOR_PROPERTY_KEYS = deepFreeze([
    'orbitTargetType', 'orbitTargetId', 'orbitCenterX', 'orbitCenterY',
    'orbitRadius', 'orbitSpeed', 'orbitType', 'gravityStrength',
    'velocityX', 'velocityY', 'validateObject'
]);

export const COMMON_OBJECT_PROPERTY_FIELDS = deepFreeze({
    name: { label: 'Name', key: 'name', type: 'text' },
    x: { label: 'X Position', key: 'x', type: 'number' },
    y: { label: 'Y Position', key: 'y', type: 'number' },
    rotation: { label: 'Rotation', key: 'rotation', type: 'number' },
    alpha: { label: 'Alpha', key: 'alpha', type: 'number', min: 0, max: 1, step: 0.1 },
    visible: { label: 'Visible', key: 'visible', type: 'checkbox' }
});

export const OBJECT_PROPERTY_FIELDS = deepFreeze({
    Planet: [
        { key: 'radius', label: 'Radius', type: 'number', min: 1 },
        { key: 'width', label: 'Width', type: 'number', min: 1 },
        { key: 'height', label: 'Height', type: 'number', min: 1 },
        { key: 'mass', label: 'Mass', type: 'number', min: 0 },
        { key: 'collisionRadius', label: 'Collision Radius', type: 'number', min: 1 },
        { key: 'gravitationalReach', label: 'Gravitational Reach', type: 'number', min: 0 },
        { key: 'color', label: 'Color', type: 'color' },
        { key: 'planetType', label: 'Planet Sprite', type: 'select', optionsFrom: EditorOptionCatalog.PLANET_SPRITES }
    ],
    BlackHole: [
        { key: 'radius', label: 'Radius', type: 'number', min: 1 },
        { key: 'mass', label: 'Mass', type: 'number', min: 0 },
        { key: 'gravitationalReach', label: 'Gravitational Reach', type: 'number', min: 0 }
    ],
    Bonus: [
        { key: 'width', label: 'Width', type: 'number', min: 1 },
        { key: 'height', label: 'Height', type: 'number', min: 1 },
        { key: 'value', label: 'Value', type: 'number', min: 1 },
        { key: 'rotationSpeed', label: 'Rotation Speed', type: 'number' },
        { key: 'state', label: 'State', type: 'select', options: ['notHit', 'Hit'] }
    ],
    Target: [
        { key: 'width', label: 'Width', type: 'number', min: 1 },
        { key: 'height', label: 'Height', type: 'number', min: 1 },
        { key: 'spriteType', label: 'Ship Sprite', type: 'select', optionsFrom: EditorOptionCatalog.SHIP_SPRITES }
    ],
    Slingshot: [
        { key: 'width', label: 'Width', type: 'number', min: 1 },
        { key: 'height', label: 'Height', type: 'number', min: 1 },
        { key: 'maxPullback', label: 'Max Pullback', type: 'number', min: 10 },
        { key: 'velocityMultiplier', label: 'Velocity Multiplier', type: 'number', min: 1 }
    ],
    TextObject: [
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
    PointingArrow: [
        { key: 'pointingAtX', label: 'Target X', type: 'number' },
        { key: 'pointingAtY', label: 'Target Y', type: 'number' },
        { key: 'width', label: 'Width', type: 'number', min: 1 },
        { key: 'height', label: 'Height', type: 'number', min: 1 },
        { key: 'color', label: 'Color', type: 'color' },
        { key: 'glowColor', label: 'Glow Color', type: 'color' },
        { key: 'baseWidth', label: 'Base Width', type: 'number', min: 10 },
        { key: 'scaleWithDistance', label: 'Scale with Distance', type: 'checkbox' },
        { key: 'visible', label: 'Visible', type: 'checkbox' }
    ],
    Portal: [
        { key: 'width', label: 'Width', type: 'number', min: 8 },
        { key: 'height', label: 'Height', type: 'number', min: 6 },
        { key: 'playSound', label: 'Play Woosh Sound', type: 'checkbox' }
    ]
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
