class LevelEditor {
    constructor(game) {
        this.game = game;
        this.active = false;
        this.mode = 'edit'; // 'edit' or 'play'
        this.selectedObject = null;
        this.dragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.propertiesPanel = null;
        
        this.createUI();
        this.setupEventListeners();
    }
    
    createUI() {
        // Create editor UI container
        this.container = document.createElement('div');
        this.container.id = 'level-editor';
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 100;
            display: none;
        `;
        
        // Create toolbar
        this.toolbar = document.createElement('div');
        this.toolbar.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.8);
            padding: 10px;
            border-radius: 5px;
            color: white;
            font-family: Arial, sans-serif;
            pointer-events: auto;
        `;
        
        // Mode toggle button
        this.modeButton = document.createElement('button');
        this.modeButton.textContent = 'Switch to Play Mode';
        this.modeButton.style.cssText = `
            margin-right: 10px;
            padding: 5px 10px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        `;
        this.modeButton.onclick = () => this.toggleMode();
        
        // Add object buttons - will be populated dynamically
        this.addButtons = {};
        this.addButtonContainer = document.createElement('div');
        this.addButtonContainer.style.display = 'inline-block';
        this.toolbar.appendChild(this.addButtonContainer);
        
        // Delete button
        this.deleteButton = document.createElement('button');
        this.deleteButton.textContent = 'Delete Selected';
        this.deleteButton.style.cssText = `
            margin-right: 10px;
            padding: 5px 10px;
            background: #f44336;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        `;
        this.deleteButton.onclick = () => this.deleteSelected();
        
        // Export button
        this.exportButton = document.createElement('button');
        this.exportButton.textContent = 'Export Level';
        this.exportButton.style.cssText = `
            margin-right: 10px;
            padding: 5px 10px;
            background: #FF9800;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        `;
        this.exportButton.onclick = () => this.exportLevel();
        
        this.toolbar.appendChild(this.modeButton);
        this.toolbar.appendChild(this.deleteButton);
        this.toolbar.appendChild(this.exportButton);
        
        // Create properties panel
        this.propertiesPanel = document.createElement('div');
        this.propertiesPanel.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            width: 300px;
            background: rgba(0, 0, 0, 0.8);
            padding: 15px;
            border-radius: 5px;
            color: white;
            font-family: Arial, sans-serif;
            pointer-events: auto;
            max-height: 80vh;
            overflow-y: auto;
        `;
        this.propertiesPanel.innerHTML = '<h3>Properties</h3><p>Select an object to edit its properties</p>';
        
        this.container.appendChild(this.toolbar);
        this.container.appendChild(this.propertiesPanel);
        document.body.appendChild(this.container);
    }
    
    setupEventListeners() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!this.active) return;
            
            if (e.key === 'Delete' && this.selectedObject) {
                this.deleteSelected();
            } else if (e.key === 'Escape') {
                this.selectObject(null);
            }
        });
    }
    
    // Mouse event handlers called from game
    handleMouseDown(e) {
        if (!this.active || this.mode !== 'edit') return;
        
        const rect = this.game.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const clickedObject = this.getObjectAtPosition(x, y);
        
        console.log('Level Editor MouseDown:', x, y, 'Found object:', clickedObject);
        
        if (clickedObject) {
            this.selectObject(clickedObject);
            this.startDragging(x, y);
        } else {
            this.selectObject(null);
        }
    }
    
    handleMouseMove(e) {
        if (!this.active || this.mode !== 'edit' || !this.dragging) return;
        
        const rect = this.game.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.updateDragging(x, y);
    }
    
    handleMouseUp(e) {
        if (!this.active || this.mode !== 'edit') return;
        this.stopDragging();
    }
    
    enter() {
        this.active = true;
        this.container.style.display = 'block';
        this.game.state = 'levelEditor';
        this.mode = 'edit';
        this.updateModeButton();
        this.populateObjectButtons();
    }
    
    exit() {
        this.active = false;
        this.container.style.display = 'none';
        this.selectObject(null);
        this.game.state = 'playing';
    }
    
    toggleMode() {
        if (this.mode === 'edit') {
            this.mode = 'play';
            this.selectObject(null); // Clear selection when entering play mode
            this.stopDragging(); // Stop any ongoing drag operation
        } else {
            this.mode = 'edit';
        }
        this.updateModeButton();
        console.log('Level editor mode changed to:', this.mode);
    }
    
    updateModeButton() {
        if (this.mode === 'edit') {
            this.modeButton.textContent = 'Switch to Play Mode';
            this.modeButton.style.background = '#4CAF50';
        } else {
            this.modeButton.textContent = 'Switch to Edit Mode';
            this.modeButton.style.background = '#FF9800';
        }
    }
    
    populateObjectButtons() {
        // Clear existing buttons
        this.addButtonContainer.innerHTML = '';
        this.addButtons = {};
        
        if (!this.gameObjectClasses) return;
        
        // Get editable classes (exclude utility classes like BonusPopup, Arrow)
        const editableClasses = this.getEditableObjectClasses();
        
        editableClasses.forEach(className => {
            const btn = document.createElement('button');
            btn.textContent = `Add ${className}`;
            btn.style.cssText = `
                margin-right: 10px;
                padding: 5px 10px;
                background: #2196F3;
                color: white;
                border: none;
                border-radius: 3px;
                cursor: pointer;
            `;
            btn.onclick = () => this.addObject(className);
            this.addButtons[className] = btn;
            this.addButtonContainer.appendChild(btn);
        });
    }
    
    getEditableObjectClasses() {
        const editableClasses = [];
        const excludeClasses = ['BonusPopup', 'Arrow']; // Classes that shouldn't be manually added
        
        if (this.gameObjectClasses) {
            Object.keys(this.gameObjectClasses).forEach(className => {
                if (!excludeClasses.includes(className)) {
                    editableClasses.push(className);
                }
            });
        }
        
        return editableClasses.sort();
    }
    
    getObjectAtPosition(x, y) {
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
                console.log('Selected:', obj.constructor.name);
                return obj;
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
            console.log('Skipping object with invalid coordinates:', obj.constructor.name, obj.x, obj.y, obj.position);
            return false;
        }
        
        const radius = obj.radius || obj.collisionRadius || 20;
        const dx = x - objX;
        const dy = y - objY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const hit = distance <= radius;
        
        return hit;
    }
    
    selectObject(obj) {
        this.selectedObject = obj;
        console.log('Selected object:', obj ? obj.constructor.name : 'null');
        this.updatePropertiesPanel();
    }
    
    updatePropertiesPanel() {
        if (!this.selectedObject) {
            this.propertiesPanel.innerHTML = '<h3>Properties</h3><p>Select an object to edit its properties</p>';
            return;
        }
        
        const obj = this.selectedObject;
        let html = `<h3>Properties - ${obj.constructor.name}</h3>`;
        
        // Get all editable properties using reflection
        const properties = this.getEditableProperties(obj);
        
        properties.forEach(prop => {
            html += this.createPropertyInput(prop.label, prop.key, prop.value, prop.type, prop);
        });
        
        this.propertiesPanel.innerHTML = html;
        
        // Add event listeners to property inputs
        this.setupPropertyInputs();
    }
    
    getEditableProperties(obj) {
        const properties = [];
        const className = obj.constructor.name;
        
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
    
    getClassSpecificProperties(obj, className) {
        const properties = [];
        
        // Define editable properties for each class
        const propertyMaps = {
            'Planet': [
                { key: 'radius', label: 'Radius', type: 'number', min: 1 },
                { key: 'mass', label: 'Mass', type: 'number', min: 1 },
                { key: 'collisionRadius', label: 'Collision Radius', type: 'number', min: 1 },
                { key: 'gravitationalReach', label: 'Gravitational Reach', type: 'number', min: 0 },
                { key: 'color', label: 'Color', type: 'color' },
                { key: 'planetType', label: 'Planet Sprite', type: 'select', options: this.getPlanetSpriteOptions() }
            ],
            'Bonus': [
                { key: 'value', label: 'Value', type: 'number', min: 1 },
                { key: 'rotationSpeed', label: 'Rotation Speed', type: 'number' },
                { key: 'state', label: 'State', type: 'select', options: ['notHit', 'Hit'] }
            ],
            'Target': [
                { key: 'radius', label: 'Radius', type: 'number', min: 1 },
                { key: 'innerRadius', label: 'Inner Radius', type: 'number', min: 1 },
                { key: 'spriteType', label: 'Ship Sprite', type: 'select', options: this.getShipSpriteOptions() }
            ],
            'Slingshot': [
                { key: 'angle', label: 'Angle', type: 'number', min: 0, max: 360 }
            ],
            'TextObject': [
                { key: 'content', label: 'Text Content', type: 'text' },
                { key: 'fontSize', label: 'Font Size', type: 'number', min: 8, max: 72 },
                { key: 'color', label: 'Color', type: 'color' },
                { key: 'fontFamily', label: 'Font Family', type: 'text' },
                { key: 'textAlign', label: 'Text Align', type: 'select', options: ['left', 'center', 'right'] },
                { key: 'backgroundColor', label: 'Background Color', type: 'color' },
                { key: 'visible', label: 'Visible', type: 'checkbox' }
            ],
            'PointingArrow': [
                { key: 'pointingAtX', label: 'Target X', type: 'number' },
                { key: 'pointingAtY', label: 'Target Y', type: 'number' },
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
            // Orbit center
            if (orbitSystem.orbitCenter) {
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
                value: orbitSystem.orbitType || 'circular', 
                type: 'select', 
                options: ['circular', 'elliptical', 'figure8', 'custom'] 
            });
        }
        
        return properties;
    }
    
    createPropertyInput(label, property, value, type, options = {}) {
        let inputHtml = '';
        const baseStyle = "width: 100%; padding: 5px; border: 1px solid #555; background: #333; color: white; border-radius: 3px;";
        
        switch (type) {
            case 'checkbox':
                inputHtml = `<input type="checkbox" 
                                   data-property="${property}" 
                                   ${value ? 'checked' : ''}
                                   style="width: auto;">`;
                break;
                
            case 'select':
                inputHtml = `<select data-property="${property}" style="${baseStyle}">`;
                if (options.options) {
                    options.options.forEach(opt => {
                        const selected = opt === value ? 'selected' : '';
                        inputHtml += `<option value="${opt}" ${selected}>${opt}</option>`;
                    });
                }
                inputHtml += `</select>`;
                break;
                
            case 'color':
                inputHtml = `<input type="color" 
                                   data-property="${property}" 
                                   value="${value || '#ffffff'}" 
                                   style="${baseStyle}">`;
                break;
                
            case 'text':
                inputHtml = `<input type="text" 
                                   data-property="${property}" 
                                   value="${value || ''}" 
                                   style="${baseStyle}">`;
                break;
                
            case 'number':
            default:
                const min = options.min !== undefined ? `min="${options.min}"` : '';
                const max = options.max !== undefined ? `max="${options.max}"` : '';
                const step = options.step !== undefined ? `step="${options.step}"` : '';
                
                inputHtml = `<input type="number" 
                                   data-property="${property}" 
                                   value="${value}" 
                                   ${min} ${max} ${step}
                                   style="${baseStyle}">`;
                break;
        }
        
        return `
            <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 5px;">${label}:</label>
                ${inputHtml}
            </div>
        `;
    }
    
    setupPropertyInputs() {
        const inputs = this.propertiesPanel.querySelectorAll('input[data-property], select[data-property]');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                this.handlePropertyChange(e);
            });
            
            // Handle checkbox change events
            if (input.type === 'checkbox') {
                input.addEventListener('change', (e) => {
                    this.handlePropertyChange(e);
                });
            }
        });
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
                value = parseFloat(e.target.value);
                break;
            case 'text':
            case 'color':
            default:
                value = e.target.value;
                break;
        }
        
        if (this.selectedObject) {
            // Handle position properties specially
            if (property === 'x' || property === 'y') {
                if (typeof this.selectedObject.x === 'number') {
                    // Penguin class uses direct x/y properties
                    this.selectedObject[property] = value;
                } else if (this.selectedObject.position) {
                    // GameObject classes use position.x/y
                    this.selectedObject.position[property] = value;
                }
            } else if (property.startsWith('orbit')) {
                // Handle orbit properties
                this.updateOrbitProperty(property, value);
            } else if (property === 'planetType' || property === 'spriteType') {
                // Handle sprite changes
                this.updateSpriteProperty(property, value);
            } else if (property === 'pointingAtX' || property === 'pointingAtY') {
                // Handle PointingArrow target properties
                this.updatePointingAtProperty(property, value);
            } else if (property === 'content' && this.selectedObject.constructor.name === 'TextObject') {
                // Handle TextObject content changes with re-parsing
                this.selectedObject.content = value;
                this.selectedObject.parsedContent = this.selectedObject.parseHTMLContent(value);
                console.log(`Updated text content to: ${value}`);
            } else if (property in this.selectedObject) {
                // Other properties
                this.selectedObject[property] = value;
                console.log(`Updated ${property} to ${value}`);
            }
        }
    }
    
    updateOrbitProperty(property, value) {
        const obj = this.selectedObject;
        if (!obj.orbitSystem) return;
        
        switch (property) {
            case 'orbitCenterX':
                if (!obj.orbitSystem.orbitCenter) {
                    obj.orbitSystem.orbitCenter = { x: 0, y: 0 };
                }
                obj.orbitSystem.orbitCenter.x = value;
                this.updateOrbitSystem(obj);
                break;
                
            case 'orbitCenterY':
                if (!obj.orbitSystem.orbitCenter) {
                    obj.orbitSystem.orbitCenter = { x: 0, y: 0 };
                }
                obj.orbitSystem.orbitCenter.y = value;
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
                this.updateOrbitSystem(obj);
                break;
        }
        
        console.log(`Updated orbit ${property} to ${value}`);
    }
    
    updateOrbitSystem(obj) {
        // Refresh the orbit system with current parameters
        if (obj.orbitSystem.orbitCenter && obj.orbitSystem.orbitRadius > 0) {
            const center = obj.orbitSystem.orbitCenter;
            const radius = obj.orbitSystem.orbitRadius;
            const speed = obj.orbitSystem.orbitSpeed;
            
            switch (obj.orbitSystem.orbitType) {
                case 'circular':
                    obj.orbitSystem.setCircularOrbit(center, radius, speed);
                    break;
                case 'elliptical':
                    // Use radius as semi-major axis, and radius * 0.7 as semi-minor
                    obj.orbitSystem.setEllipticalOrbit(center, radius, radius * 0.7, speed, 0);
                    break;
                case 'figure8':
                    obj.orbitSystem.setFigure8Orbit(center, radius, speed);
                    break;
            }
        }
    }
    
    updateSpriteProperty(property, value) {
        const obj = this.selectedObject;
        
        if (property === 'planetType' && obj.constructor.name === 'Planet') {
            obj.planetType = value;
            this.refreshPlanetSprite(obj);
            console.log(`Updated planet sprite to ${value}`);
        } else if (property === 'spriteType' && obj.constructor.name === 'Target') {
            obj.spriteType = value;
            this.refreshTargetSprite(obj);
            console.log(`Updated target sprite to ${value}`);
        }
    }
    
    updatePointingAtProperty(property, value) {
        const obj = this.selectedObject;
        
        if (obj.constructor.name === 'PointingArrow') {
            // Initialize pointingAt object if it doesn't exist
            if (!obj.pointingAt) {
                obj.pointingAt = { x: 0, y: 0 };
            }
            
            if (property === 'pointingAtX') {
                obj.pointingAt.x = value;
                console.log(`Updated pointing target X to ${value}`);
            } else if (property === 'pointingAtY') {
                obj.pointingAt.y = value;
                console.log(`Updated pointing target Y to ${value}`);
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
            console.warn('Planet object does not have refreshSprite method');
        }
    }
    
    refreshTargetSprite(target) {
        // Use the target's built-in refreshSprite method
        if (typeof target.refreshSprite === 'function') {
            target.refreshSprite();
        } else {
            console.warn('Target object does not have refreshSprite method');
        }
    }
    
    startDragging(x, y) {
        if (!this.selectedObject) return;
        
        this.dragging = true;
        
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
        console.log('Started dragging:', this.selectedObject.constructor.name, 'at', x, y);
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
        
        console.log('Dragging to:', x, y, 'Object now at:', newX, newY);
        
        this.updatePropertiesPanel();
    }
    
    stopDragging() {
        if (this.dragging) {
            console.log('Stopped dragging');
        }
        this.dragging = false;
    }
    
    addObject(className) {
        const centerX = this.game.canvas.width / 2;
        const centerY = this.game.canvas.height / 2;
        
        if (!this.gameObjectClasses || !this.gameObjectClasses[className]) {
            console.error('Unknown class:', className);
            return;
        }
        
        const ClassConstructor = this.gameObjectClasses[className];
        let newObject;
        
        try {
            // Create object with sensible defaults based on class
            newObject = this.createObjectWithDefaults(ClassConstructor, className, centerX, centerY);
            
            if (newObject) {
                // Add to appropriate arrays
                this.addObjectToGame(newObject, className);
                this.selectObject(newObject);
                console.log('Created new', className, 'at', centerX, centerY);
            }
        } catch (error) {
            console.error('Failed to create', className, ':', error);
        }
    }
    
    createObjectWithDefaults(ClassConstructor, className, x, y) {
        // Define default parameters for each class type
        const defaults = {
            'Planet': [x, y, 50, 1000, 0, 'planet_grey', this.game.assetLoader], // x, y, radius, mass, gravitationalReach, planetType, assetLoader
            'Bonus': [x, y, 100, this.game.assetLoader], // x, y, value, assetLoader
            'Target': [x, y, 60, 60, 'ship_open', this.game.assetLoader], // x, y, width, height, spriteType, assetLoader
            'Slingshot': [x, y, 0], // x, y, angle
            'TextObject': [x, y, 'Sample Text', 16, '#FFFFFF'], // x, y, text, fontSize, color
            'PointingArrow': [x, y, x + 100, y + 50, 0] // x, y, targetX, targetY, length
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
    
    addObjectToGame(obj, className) {
        // Add to gameObjects (all objects go here)
        this.game.gameObjects.push(obj);
        
        // Add to specific arrays based on type
        switch (className) {
            case 'Planet':
                this.game.planets.push(obj);
                this.game.physics.addPlanet(obj);
                break;
            case 'Bonus':
                this.game.bonuses.push(obj);
                break;
            case 'TextObject':
                this.game.textObjects.push(obj);
                break;
            case 'PointingArrow':
                this.game.pointingArrows.push(obj);
                break;
            // Other types just go in gameObjects
        }
    }
    
    deleteSelected() {
        if (!this.selectedObject) return;
        
        const obj = this.selectedObject;
        const className = obj.constructor.name;
        
        console.log(`Deleting ${className}...`);
        
        // Use the game's centralized removal method
        this.removeObjectFromGame(obj);
        
        console.log(`Successfully deleted ${className}`);
        this.selectObject(null);
    }
    
    removeObjectFromGame(obj) {
        // Robust removal system that automatically finds and removes object from all collections
        const className = obj.constructor.name;
        
        // 1. Remove from main gameObjects array (always)
        this.removeFromArray(this.game.gameObjects, obj, 'gameObjects');
        
        // 2. Use reflection to find all array properties and remove from matching ones
        this.removeFromAllGameArrays(obj);
        
        // 3. Handle special physics integrations
        this.removeFromPhysics(obj);
        
        // 4. Handle special singleton references
        this.removeSpecialReferences(obj);
    }
    
    removeFromArray(array, obj, arrayName) {
        if (!array) return false;
        
        const initialLength = array.length;
        const index = array.indexOf(obj);
        
        if (index !== -1) {
            array.splice(index, 1);
            console.log(`  - Removed from ${arrayName} (was at index ${index})`);
            return true;
        }
        
        return false;
    }
    
    removeFromAllGameArrays(obj) {
        // Dynamically find all arrays in the game object and try to remove from them
        // This automatically handles new arrays without code changes
        
        const arrayNames = [
            'gameObjects', 'planets', 'bonuses', 'textObjects', 'pointingArrows',
            // Add more as needed, but the system will work even if we forget some
        ];
        
        arrayNames.forEach(arrayName => {
            if (this.game[arrayName] && Array.isArray(this.game[arrayName])) {
                this.removeFromArray(this.game[arrayName], obj, arrayName);
            }
        });
        
        // Also scan for any other arrays that might contain our object
        // This is a safety net for arrays we might have missed
        this.scanAndRemoveFromUnknownArrays(obj);
    }
    
    scanAndRemoveFromUnknownArrays(obj) {
        // Defensive programming: scan all game properties for arrays containing our object
        for (const [key, value] of Object.entries(this.game)) {
            if (Array.isArray(value) && value.includes(obj)) {
                console.log(`  - Found object in unexpected array: ${key}`);
                this.removeFromArray(value, obj, key);
            }
        }
    }
    
    removeFromPhysics(obj) {
        // Handle physics integrations based on object type
        const className = obj.constructor.name;
        
        switch (className) {
            case 'Planet':
                if (this.game.physics && typeof this.game.physics.removePlanet === 'function') {
                    this.game.physics.removePlanet(obj);
                    console.log('  - Removed from physics system');
                }
                break;
            
            case 'Bonus':
                // Future: if bonuses need physics removal
                break;
                
            // Add other physics-integrated objects as needed
        }
    }
    
    removeSpecialReferences(obj) {
        // Handle singleton/special object references
        const className = obj.constructor.name;
        
        // Check all game properties for direct references to this object
        const specialProps = ['target', 'slingshot', 'penguin', 'arrow'];
        
        specialProps.forEach(prop => {
            if (this.game[prop] === obj) {
                this.game[prop] = null;
                console.log(`  - Cleared special reference: ${prop}`);
            }
        });
        
        // Also scan for any other direct references
        for (const [key, value] of Object.entries(this.game)) {
            if (value === obj && !specialProps.includes(key)) {
                this.game[key] = null;
                console.log(`  - Cleared unexpected reference: ${key}`);
            }
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
        
        console.log('Level exported:', filename);
    }
    
    render(ctx) {
        if (!this.active) return;
        
        // Draw grid only in edit mode
        if (this.mode === 'edit') {
            this.drawGrid(ctx);
        }
        
        // Draw selection highlight
        if (this.selectedObject && this.mode === 'edit') {
            this.drawSelectionHighlight(ctx, this.selectedObject);
            this.drawOrbitCenter(ctx, this.selectedObject);
            this.drawArrowTarget(ctx, this.selectedObject);
        }
    }
    
    drawSelectionHighlight(ctx, obj) {
        const radius = obj.radius || obj.collisionRadius || 20;
        
        // Get object coordinates
        let objX, objY;
        if (typeof obj.x === 'number') {
            objX = obj.x;
            objY = obj.y;
        } else if (obj.position) {
            objX = obj.position.x;
            objY = obj.position.y;
        } else {
            return; // Can't highlight objects without valid coordinates
        }
        
        ctx.save();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        
        ctx.beginPath();
        ctx.arc(objX, objY, radius + 10, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }
    
    drawOrbitCenter(ctx, obj) {
        // Draw orbit center for objects with orbit systems
        if (obj.orbitSystem && obj.orbitSystem.orbitCenter && obj.orbitSystem.orbitRadius > 0) {
            const center = obj.orbitSystem.orbitCenter;
            
            ctx.save();
            ctx.strokeStyle = '#ff9900';
            ctx.fillStyle = '#ff9900';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            
            // Draw center point
            ctx.beginPath();
            ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw orbit path
            ctx.beginPath();
            ctx.arc(center.x, center.y, obj.orbitSystem.orbitRadius, 0, Math.PI * 2);
            ctx.stroke();
            
            // Draw line from object to center
            const objX = typeof obj.x === 'number' ? obj.x : obj.position.x;
            const objY = typeof obj.y === 'number' ? obj.y : obj.position.y;
            
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(objX, objY);
            ctx.lineTo(center.x, center.y);
            ctx.stroke();
            
            ctx.restore();
        }
    }
    
    drawArrowTarget(ctx, obj) {
        // Draw target point for pointing arrows
        if (obj.constructor.name === 'PointingArrow' && obj.targetX !== undefined && obj.targetY !== undefined) {
            ctx.save();
            ctx.strokeStyle = '#00ff99';
            ctx.fillStyle = '#00ff99';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            
            // Draw target point
            ctx.beginPath();
            ctx.arc(obj.targetX, obj.targetY, 8, 0, Math.PI * 2);
            ctx.stroke();
            
            // Draw crosshair
            ctx.beginPath();
            ctx.moveTo(obj.targetX - 10, obj.targetY);
            ctx.lineTo(obj.targetX + 10, obj.targetY);
            ctx.moveTo(obj.targetX, obj.targetY - 10);
            ctx.lineTo(obj.targetX, obj.targetY + 10);
            ctx.stroke();
            
            // Draw line from arrow to target
            const objX = typeof obj.x === 'number' ? obj.x : obj.position.x;
            const objY = typeof obj.y === 'number' ? obj.y : obj.position.y;
            
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(objX, objY);
            ctx.lineTo(obj.targetX, obj.targetY);
            ctx.stroke();
            
            ctx.restore();
        }
    }
    
    drawGrid(ctx) {
        const gridSize = 50;
        const width = this.game.canvas.width;
        const height = this.game.canvas.height;
        
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        
        // Vertical lines
        for (let x = 0; x <= width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y <= height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        ctx.restore();
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