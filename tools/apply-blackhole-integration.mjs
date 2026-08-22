import fs from 'node:fs';

function edit(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`No changes applied to ${path}`);
  fs.writeFileSync(path, after);
}

function replaceOnce(text, from, to, label) {
  const index = text.indexOf(from);
  if (index < 0) throw new Error(`Missing patch target: ${label}`);
  if (text.indexOf(from, index + from.length) >= 0) throw new Error(`Ambiguous patch target: ${label}`);
  return text.slice(0, index) + to + text.slice(index + from.length);
}

edit('js/game.js', text => {
  text = replaceOnce(
    text,
    "import { GameObject, Planet, Bonus, BonusPopup, Target, Slingshot, Arrow, TextObject, PointingArrow, Portal } from './gameObjects.js';\n",
    "import { GameObject, Planet, Bonus, BonusPopup, Target, Slingshot, Arrow, TextObject, PointingArrow, Portal } from './gameObjects.js';\nimport { BlackHole } from './blackHole.js';\n",
    'game BlackHole import'
  );
  text = replaceOnce(
    text,
    "            Planet,\n            Bonus,",
    "            Planet,\n            BlackHole,\n            Bonus,",
    'editor class registration'
  );
  text = replaceOnce(
    text,
    "            'Planet': ['radius', 'mass', 'collisionRadius', 'gravitationalReach', 'color', 'planetType'],\n            'Bonus':",
    "            'Planet': ['radius', 'mass', 'collisionRadius', 'gravitationalReach', 'color', 'planetType'],\n            'BlackHole': ['radius', 'mass', 'gravitationalReach'],\n            'Bonus':",
    'explicit BlackHole export properties'
  );
  return text;
});

edit('js/editorObjectRegistry.js', text => {
  text = text.replace("import { BlackHole } from './blackHole.js';\n\n", '');
  text = replaceOnce(
    text,
    "export function getEditableClassNames(gameObjectClasses = {}) {\n    // BlackHole lives in its own module instead of gameObjects.js. Register it\n    // lazily here so every editor creation surface (toolbar/context menu) sees\n    // the same class without duplicating editor-only wiring in Game.\n    gameObjectClasses.BlackHole ??= BlackHole;\n\n    return Object.keys(gameObjectClasses)",
    "export function getEditableClassNames(gameObjectClasses = {}) {\n    return Object.keys(gameObjectClasses)",
    'remove lazy BlackHole registration'
  );
  return text;
});

edit('js/levelEditor.js', text => {
  text = replaceOnce(
    text,
    "            'Planet': [\n                { key: 'radius', label: 'Radius', type: 'number', min: 1 },\n                { key: 'width', label: 'Width', type: 'number', min: 1 },\n                { key: 'height', label: 'Height', type: 'number', min: 1 },\n                { key: 'mass', label: 'Mass', type: 'number', min: 1 },\n                { key: 'collisionRadius', label: 'Collision Radius', type: 'number', min: 1 },\n                { key: 'gravitationalReach', label: 'Gravitational Reach', type: 'number', min: 0 },\n                { key: 'color', label: 'Color', type: 'color' },\n                { key: 'planetType', label: 'Planet Sprite', type: 'select', options: this.getPlanetSpriteOptions() }\n            ],\n            'Bonus': [",
    "            'Planet': [\n                { key: 'radius', label: 'Radius', type: 'number', min: 1 },\n                { key: 'width', label: 'Width', type: 'number', min: 1 },\n                { key: 'height', label: 'Height', type: 'number', min: 1 },\n                { key: 'mass', label: 'Mass', type: 'number', min: 0 },\n                { key: 'collisionRadius', label: 'Collision Radius', type: 'number', min: 1 },\n                { key: 'gravitationalReach', label: 'Gravitational Reach', type: 'number', min: 0 },\n                { key: 'color', label: 'Color', type: 'color' },\n                { key: 'planetType', label: 'Planet Sprite', type: 'select', options: this.getPlanetSpriteOptions() }\n            ],\n            'BlackHole': [\n                { key: 'radius', label: 'Radius', type: 'number', min: 1 },\n                { key: 'mass', label: 'Mass', type: 'number', min: 0 },\n                { key: 'gravitationalReach', label: 'Gravitational Reach', type: 'number', min: 0 }\n            ],\n            'Bonus': [",
    'BlackHole inspector properties'
  );

  text = replaceOnce(
    text,
    "        if (object.constructor.name === 'Planet') {\n            this.game.physics?.refreshPlanet?.(object);\n            this.refreshPlanetSprite(object);\n        } else if (object.constructor.name === 'Target') {",
    "        if (object.constructor.name === 'Planet' || object.constructor.name === 'BlackHole') {\n            this.game.physics?.refreshPlanet?.(object);\n            if (object.constructor.name === 'Planet') this.refreshPlanetSprite(object);\n        } else if (object.constructor.name === 'Target') {",
    'BlackHole live physics refresh'
  );

  text = replaceOnce(
    text,
    "            'Planet': [\n                x, y,\n                EDITOR_CONFIG.authoringDefaults.planet.radius,\n                EDITOR_CONFIG.authoringDefaults.planet.mass,\n                EDITOR_CONFIG.authoringDefaults.planet.gravitationalReach,\n                EDITOR_CONFIG.authoringDefaults.planet.planetType,\n                this.game.assetLoader\n            ],\n            'Bonus':",
    "            'Planet': [\n                x, y,\n                EDITOR_CONFIG.authoringDefaults.planet.radius,\n                EDITOR_CONFIG.authoringDefaults.planet.mass,\n                EDITOR_CONFIG.authoringDefaults.planet.gravitationalReach,\n                EDITOR_CONFIG.authoringDefaults.planet.planetType,\n                this.game.assetLoader\n            ],\n            'BlackHole': [\n                x, y,\n                EDITOR_CONFIG.authoringDefaults.planet.radius,\n                EDITOR_CONFIG.authoringDefaults.planet.mass,\n                EDITOR_CONFIG.authoringDefaults.planet.gravitationalReach\n            ],\n            'Bonus':",
    'BlackHole creation defaults'
  );

  text = replaceOnce(
    text,
    "            case 'Planet':\n                ['planetType', 'collisionRadius', 'gravitationalReach', 'color'].forEach(prop => {\n                    if (obj[prop] !== undefined) data.properties[prop] = obj[prop];\n                });\n                break;\n            case 'Bonus':",
    "            case 'Planet':\n                ['planetType', 'collisionRadius', 'gravitationalReach', 'color'].forEach(prop => {\n                    if (obj[prop] !== undefined) data.properties[prop] = obj[prop];\n                });\n                break;\n            case 'BlackHole':\n                ['gravitationalReach', 'collisionRadius', 'collidable'].forEach(prop => {\n                    if (obj[prop] !== undefined) data.properties[prop] = obj[prop];\n                });\n                break;\n            case 'Bonus':",
    'BlackHole clone serialization'
  );

  text = replaceOnce(
    text,
    "            case 'Planet':\n                clonedObject = new ClassConstructor(\n                    props.position?.x ?? props.x ?? 0,\n                    props.position?.y ?? props.y ?? 0,\n                    props.radius ?? EDITOR_CONFIG.authoringDefaults.planet.radius,\n                    props.mass ?? EDITOR_CONFIG.authoringDefaults.planet.mass,\n                    props.gravitationalReach ?? EDITOR_CONFIG.authoringDefaults.planet.gravitationalReach,\n                    props.planetType ?? EDITOR_CONFIG.authoringDefaults.planet.planetType,\n                    this.game.assetLoader\n                );\n                clonedObject.collisionRadius = props.collisionRadius ??\n                    (clonedObject.radius + LEVEL_DEFAULTS.planet.collisionPadding);\n                break;\n            case 'Bonus':",
    "            case 'Planet':\n                clonedObject = new ClassConstructor(\n                    props.position?.x ?? props.x ?? 0,\n                    props.position?.y ?? props.y ?? 0,\n                    props.radius ?? EDITOR_CONFIG.authoringDefaults.planet.radius,\n                    props.mass ?? EDITOR_CONFIG.authoringDefaults.planet.mass,\n                    props.gravitationalReach ?? EDITOR_CONFIG.authoringDefaults.planet.gravitationalReach,\n                    props.planetType ?? EDITOR_CONFIG.authoringDefaults.planet.planetType,\n                    this.game.assetLoader\n                );\n                clonedObject.collisionRadius = props.collisionRadius ??\n                    (clonedObject.radius + LEVEL_DEFAULTS.planet.collisionPadding);\n                break;\n            case 'BlackHole':\n                clonedObject = new ClassConstructor(\n                    props.position?.x ?? props.x ?? 0,\n                    props.position?.y ?? props.y ?? 0,\n                    props.radius ?? EDITOR_CONFIG.authoringDefaults.planet.radius,\n                    props.mass ?? EDITOR_CONFIG.authoringDefaults.planet.mass,\n                    props.gravitationalReach ?? EDITOR_CONFIG.authoringDefaults.planet.gravitationalReach\n                );\n                clonedObject.collisionRadius = 0;\n                clonedObject.collidable = false;\n                break;\n            case 'Bonus':",
    'BlackHole clone deserialization'
  );
  return text;
});

edit('js/levelValidation.js', text => {
  text = replaceOnce(
    text,
    "    if (type === LevelObjectType.PLANET) {\n        validateOptionalNumber(properties.radius, `${propertyPath}.radius`, collector, { exclusiveMin: 0 });\n        validateOptionalNumber(properties.mass, `${propertyPath}.mass`, collector, { min: 0 });\n        validateOptionalNumber(properties.collisionRadius, `${propertyPath}.collisionRadius`, collector, { exclusiveMin: 0 });\n        validateOptionalNumber(properties.gravitationalReach, `${propertyPath}.gravitationalReach`, collector, { min: 0 });\n    } else if (type === LevelObjectType.BONUS) {",
    "    if (type === LevelObjectType.PLANET || type === LevelObjectType.BLACK_HOLE) {\n        validateOptionalNumber(properties.radius, `${propertyPath}.radius`, collector, { exclusiveMin: 0 });\n        validateOptionalNumber(properties.mass, `${propertyPath}.mass`, collector, { min: 0 });\n        validateOptionalNumber(properties.gravitationalReach, `${propertyPath}.gravitationalReach`, collector, { min: 0 });\n        if (type === LevelObjectType.PLANET) {\n            validateOptionalNumber(properties.collisionRadius, `${propertyPath}.collisionRadius`, collector, { exclusiveMin: 0 });\n        } else if (properties.collisionRadius !== undefined && properties.collisionRadius !== 0) {\n            collector.error('BLACK_HOLE_COLLISION_RADIUS', `${propertyPath}.collisionRadius`, 'must be 0 because black holes are non-collidable');\n        }\n        if (type === LevelObjectType.BLACK_HOLE && properties.collidable !== undefined && properties.collidable !== false) {\n            collector.error('BLACK_HOLE_COLLIDABLE', `${propertyPath}.collidable`, 'must be false because black holes are non-collidable');\n        }\n    } else if (type === LevelObjectType.BONUS) {",
    'BlackHole validation'
  );
  text = text.replaceAll('runtime orbit lookup supports planet and bonus IDs', 'runtime orbit lookup supports planet, black hole, and bonus IDs');
  return text;
});

edit('js/simulationGeometry.js', text => replaceOnce(
  text,
  "export function circlesOverlap(a, aRadius, b, bRadius = 0) {\n    // In gameplay, a zero-radius destination collider explicitly means\n    // \"non-collidable\" (used by gravity-only objects such as black holes).\n    // Point-vs-circle checks still work because their destination radius is\n    // positive and only the moving point's radius is zero.\n    if (bRadius <= 0) return false;\n    const combinedRadius = aRadius + bRadius;\n    return distanceSquared(a, b) < combinedRadius * combinedRadius;\n}",
  "export function circlesOverlap(a, aRadius, b, bRadius = 0) {\n    const combinedRadius = aRadius + bRadius;\n    return distanceSquared(a, b) < combinedRadius * combinedRadius;\n}",
  'restore generic circle geometry'
));

edit('js/simulationEngine.js', text => replaceOnce(
  text,
  "function findPlanetCollision(position, planets, penguinRadius = 0) {\n    return planets.findIndex(planet => circlesOverlap(position, penguinRadius, planet.position, planet.collisionRadius));\n}",
  "function findPlanetCollision(position, planets, penguinRadius = 0) {\n    return planets.findIndex(planet =>\n        planet.collidable !== false &&\n        planet.collisionRadius > 0 &&\n        circlesOverlap(position, penguinRadius, planet.position, planet.collisionRadius)\n    );\n}",
  'explicit non-collidable gravity body semantics'
));

edit('levels/README.md', text => replaceOnce(
  text,
  "Defaults are `radius: 30`, `mass: 100`, and `gravitationalReach: 5000`. For compatibility with shipped editor exports, an omitted, null, or zero `gravitationalReach` also resolves to `5000`; use `mass: 0` when a planet must exert no gravity. Planet types must correspond to manifest-facing names such as `planet_grey`, `planet_pink`, `planet_red_gumball`, `planet_saturn`, or `planet_sun`.\n\n### Bonus",
  "Defaults are `radius: 30`, `mass: 100`, and `gravitationalReach: 5000`. For compatibility with shipped editor exports, an omitted, null, or zero `gravitationalReach` also resolves to `5000`; use `mass: 0` when a planet must exert no gravity. Planet types must correspond to manifest-facing names such as `planet_grey`, `planet_pink`, `planet_red_gumball`, `planet_saturn`, or `planet_sun`.\n\n### Black hole\n\n```json\n{\n  \"type\": \"blackhole\",\n  \"position\": { \"x\": 400, \"y\": 250 },\n  \"properties\": {\n    \"id\": \"blackhole_1\",\n    \"name\": \"The Void\",\n    \"radius\": 34,\n    \"mass\": 500,\n    \"gravitationalReach\": 5000\n  }\n}\n```\n\nBlack holes use the same gravity model as planets but never collide with Kevin. Their collision radius is normalized to `0` and `collidable` is always `false`. The editor exposes radius, mass, gravitational reach, and orbit controls; the animated accretion particles are render-only and do not affect deterministic simulation. Black holes may be used anywhere a planet is accepted as an orbit source or orbit target.\n\n### Bonus",
  'BlackHole level documentation'
));

edit('LEVEL_EDITOR_DOCUMENTATION.md', text => {
  text = replaceOnce(text,
    "- Planet\n- Bonus",
    "- Planet\n- BlackHole\n- Bonus",
    'editor object creation list'
  );
  text = replaceOnce(text,
    "| **Planet** | 50px radius, 1000 mass, planet_grey sprite |\n| **Bonus** |",
    "| **Planet** | 50px radius, 1000 mass, planet_grey sprite |\n| **BlackHole** | Planet-style radius/mass/reach, zero collision |\n| **Bonus** |",
    'editor defaults table'
  );
  text = replaceOnce(text,
    "**Orbit Properties** (when orbiting is enabled):\n- **Orbit Center X/Y**: Center point of orbital motion\n- **Orbit Radius**: Distance from center\n- **Orbit Speed**: Rotation speed (positive/negative for direction)\n- **Orbit Type**: circular, elliptical, figure8, gravity, custom\n\n### Bonus",
    "**Orbit Properties** (when orbiting is enabled):\n- **Orbit Center X/Y**: Center point of orbital motion\n- **Orbit Radius**: Distance from center\n- **Orbit Speed**: Rotation speed (positive/negative for direction)\n- **Orbit Type**: circular, elliptical, figure8, gravity, custom\n\n### BlackHole\nGravity-only bodies with an ominous animated event-horizon/accretion visual. They share planet gravity and orbit behavior but never collide with Kevin.\n\n**Core Properties:**\n- **Position**: X, Y coordinates\n- **Radius**: Visual event-horizon size\n- **Mass**: Gravitational strength; `0` disables gravity\n- **Gravitational Reach**: Maximum influence distance\n- **Collision**: Always disabled; collision radius remains `0`\n\nBlack holes can be cloned, exported/imported as `blackhole`, and selected by Gravity Sculpt because they participate in the shared gravity-body collection.\n\n### Bonus",
    'editor BlackHole section'
  );
  return text;
});

edit('AGENTS.md', text => replaceOnce(
  text,
  "6. Object-referenced orbits require unique IDs and an acyclic reference graph. Only planets and bonuses may be orbit targets; planet, bonus, and target objects may be orbit sources.",
  "6. Object-referenced orbits require unique IDs and an acyclic reference graph. Planets, black holes, and bonuses may be orbit targets; planets, black holes, bonuses, and targets may be orbit sources.",
  'orbit capability documentation'
));

edit('testing/blackHoleEditor.test.js', text => {
  text = text.replace(
    "import LiveLevelMutator from '../js/liveLevelMutator.js';\n",
    "import LiveLevelMutator from '../js/liveLevelMutator.js';\nimport LevelEditor from '../js/levelEditor.js';\nimport { BlackHole } from '../js/blackHole.js';\nimport { validateLevelDefinition } from '../js/levelValidation.js';\n"
  );
  text += `\n\ntest('black hole exposes gravity properties in the editor inspector', () => {\n    const editor = Object.create(LevelEditor.prototype);\n    const hole = new BlackHole(10, 20, 42, 321, 1234);\n    const props = editor.getClassSpecificProperties(hole, 'BlackHole');\n    const keys = props.map(prop => prop.key);\n    assert.deepEqual(keys, ['radius', 'mass', 'gravitationalReach']);\n    assert.equal(props.find(prop => prop.key === 'mass').value, 321);\n});\n\ntest('black hole editor cloning preserves gravity settings and non-collision', () => {\n    const editor = Object.create(LevelEditor.prototype);\n    editor.game = { assetLoader: null };\n    editor.gameObjectClasses = { BlackHole };\n    const original = new BlackHole(10, 20, 45, 777, 2345);\n    original.id = 'blackhole_1';\n    original.name = 'Void';\n    const clone = editor.cloneObject(original);\n    assert.equal(clone.radius, 45);\n    assert.equal(clone.mass, 777);\n    assert.equal(clone.gravitationalReach, 2345);\n    assert.equal(clone.collisionRadius, 0);\n    assert.equal(clone.collidable, false);\n});\n\ntest('editing black hole gravity refreshes the shared physics registry', () => {\n    const editor = Object.create(LevelEditor.prototype);\n    const calls = [];\n    editor.game = {\n        invalidateSimulationState() {},\n        physics: { refreshPlanet(object) { calls.push(object); } }\n    };\n    const hole = new BlackHole(10, 20);\n    editor.synchronizeEditedObject(hole);\n    assert.deepEqual(calls, [hole]);\n});\n\ntest('black hole validation enforces gravity fields and non-collision contract', () => {\n    const base = {\n        name: 'Black hole validation',\n        startPosition: { x: 100, y: 300 },\n        targetPosition: { x: 700, y: 300 },\n        objects: [{\n            type: 'blackhole',\n            position: { x: 400, y: 300 },\n            properties: { radius: 30, mass: 100, gravitationalReach: 5000 }\n        }]\n    };\n    assert.equal(validateLevelDefinition(base).valid, true);\n    const invalid = structuredClone(base);\n    invalid.objects[0].properties.mass = -1;\n    invalid.objects[0].properties.collisionRadius = 10;\n    invalid.objects[0].properties.collidable = true;\n    const validation = validateLevelDefinition(invalid);\n    assert.equal(validation.valid, false);\n    assert.equal(validation.errors.some(error => error.code === 'NUMBER_TOO_SMALL'), true);\n    assert.equal(validation.errors.some(error => error.code === 'BLACK_HOLE_COLLISION_RADIUS'), true);\n    assert.equal(validation.errors.some(error => error.code === 'BLACK_HOLE_COLLIDABLE'), true);\n});\n`;
  return text;
});

fs.rmSync('tools/apply-blackhole-integration.mjs');
fs.rmSync('.github/workflows/apply-blackhole-integration.yml');
