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
        // Note: Event listeners now managed by InputActionManager
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
        
        // Create toolbar with mobile-friendly styling
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
            max-width: 90vw;
            overflow-x: auto;
            white-space: nowrap;
        `;
        
        // Mode toggle button with mobile-friendly styling
        this.modeButton = document.createElement('button');
        this.modeButton.textContent = 'Switch to Play Mode';
        this.modeButton.style.cssText = `
            margin-right: 10px;
            padding: 8px 12px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            min-height: 44px;
            font-size: 14px;
            touch-action: manipulation;
        `;
        this.modeButton.onclick = () => this.toggleMode();
        
        // Add object buttons - will be populated dynamically
        this.addButtons = {};
        this.addButtonContainer = document.createElement('div');
        this.addButtonContainer.style.display = 'inline-block';
        this.toolbar.appendChild(this.addButtonContainer);
        
        // Delete button with mobile-friendly styling
        this.deleteButton = document.createElement('button');
        this.deleteButton.textContent = 'Delete Selected';
        this.deleteButton.style.cssText = `
            margin-right: 10px;
            padding: 8px 12px;
            background: #f44336;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            min-height: 44px;
            font-size: 14px;
            touch-action: manipulation;
        `;
        this.deleteButton.onclick = () => this.deleteSelected();
        
        // Export button with mobile-friendly styling
        this.exportButton = document.createElement('button');
        this.exportButton.textContent = 'Export Level';
        this.exportButton.style.cssText = `
            margin-right: 10px;
            padding: 8px 12px;
            background: #FF9800;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            min-height: 44px;
            font-size: 14px;
            touch-action: manipulation;
        `;
        this.exportButton.onclick = () => this.exportLevel();
        
        this.toolbar.appendChild(this.modeButton);
        this.toolbar.appendChild(this.deleteButton);
        this.toolbar.appendChild(this.exportButton);
        
        // Create mobile toolbar for touch-friendly controls
        this.createMobileToolbar();
        
        // Create properties panel with mobile-responsive styling
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
            touch-action: auto;
        `;
        
        // Add mobile responsive behavior
        if (window.innerWidth < 768) {
            this.propertiesPanel.style.cssText += `
                width: calc(100vw - 40px);
                max-width: 350px;
                right: 20px;
                top: 80px;
                max-height: 60vh;
            `;
        }
        this.propertiesPanel.innerHTML = '<h3>Properties</h3><p>Select an object to edit its properties</p>';
        
        this.container.appendChild(this.toolbar);
        this.container.appendChild(this.propertiesPanel);
        document.body.appendChild(this.container);
    }
    
    createMobileToolbar() {
        // Create mobile-specific toolbar for touch controls
        this.mobileToolbar = document.createElement('div');
        this.mobileToolbar.style.cssText = `
            position: absolute;
            bottom: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            padding: 10px;
            border-radius: 25px;
            color: white;
            font-family: Arial, sans-serif;
            pointer-events: auto;
            display: flex;
            gap: 10px;
            align-items: center;
        `;
        
        // Add instructions for mobile users
        const instructionText = document.createElement('span');
        instructionText.textContent = 'Long press to add objects';
        instructionText.style.cssText = `
            font-size: 12px;
            color: #ccc;
            margin-right: 10px;
        `;
        
        // Clear selection button (useful on mobile)
        const clearButton = document.createElement('button');
        clearButton.textContent = '✕';
        clearButton.title = 'Clear selection';
        clearButton.style.cssText = `
            width: 44px;
            height: 44px;
            border-radius: 22px;
            background: #666;
            color: white;
            border: none;
            font-size: 18px;
            cursor: pointer;
            touch-action: manipulation;
        `;
        clearButton.onclick = () => this.selectObject(null);
        
        // Add object button (alternative to long press)
        const addButton = document.createElement('button');
        addButton.textContent = '+';
        addButton.title = 'Add object';
        addButton.style.cssText = `
            width: 44px;
            height: 44px;
            border-radius: 22px;
            background: #2196F3;
            color: white;
            border: none;
            font-size: 24px;
            cursor: pointer;
            touch-action: manipulation;
        `;
        addButton.onclick = () => this.showMobileAddMenu();
        
        this.mobileToolbar.appendChild(instructionText);
        this.mobileToolbar.appendChild(clearButton);
        this.mobileToolbar.appendChild(addButton);
        
        this.container.appendChild(this.mobileToolbar);
        
        // Hide mobile toolbar on desktop
        if (window.innerWidth >= 768) {
            this.mobileToolbar.style.display = 'none';
        }
    }
    
    showMobileAddMenu() {
        if (this.mode !== 'edit') return;
        
        // Show context menu at center of screen
        const centerX = this.game.canvas.width / 2;
        const centerY = this.game.canvas.height / 2;
        this.showContextMenu(centerX, centerY);
    }
    
    setupEventListeners() {
        // This method is now deprecated - input handling managed by InputActionManager
        console.warn('LevelEditor.setupEventListeners() is deprecated - input now managed by InputActionManager');
        
        // Still set touch action for mobile compatibility
        this.game.canvas.style.touchAction = 'none';
        
        // Initialize touch tracking variables
        this.touchStartTime = null;
        this.touchStartPos = null;
        this.longPressTimer = null;
    }
    
    // Methods called by InputActionManager
    handleMouseDown(e) {
        if (!this.active) return;
        this.handlePointerDown(e);
    }
    
    handleMouseMove(e) {
        if (!this.active) return;
        this.handlePointerMove(e);
    }
    
    handleMouseUp(e) {
        if (!this.active) return;
        this.handlePointerUp(e);
    }
    
    handleClick(e) {
        if (!this.active) return;
        // Convert to pointer event
        this.handlePointerDown(e);
        this.handlePointerUp(e);
    }
    
    deleteSelectedObject() {
        if (this.selectedObject) {
            this.deleteSelected();
        }
    }
    
    saveLevel() {
        // Implement save functionality
        console.log('Save level functionality not yet implemented');
    }
    
    undo() {
        // Implement undo functionality
        console.log('Undo functionality not yet implemented');
    }
    
    redo() {
        // Implement redo functionality
        console.log('Redo functionality not yet implemented');
    }
    
    handleResize() {
        if (!this.active) return;
        
        // Update mobile toolbar visibility
        if (this.mobileToolbar) {
            if (window.innerWidth < 768) {
                this.mobileToolbar.style.display = 'flex';
            } else {
                this.mobileToolbar.style.display = 'none';
            }
        }
        
        // Update properties panel positioning for mobile
        if (this.propertiesPanel && window.innerWidth < 768) {
            this.propertiesPanel.style.cssText += `
                width: calc(100vw - 40px);
                max-width: 350px;
                right: 20px;
                top: 80px;
                max-height: 60vh;
            `;
        } else if (this.propertiesPanel) {
            // Reset to desktop styling
            this.propertiesPanel.style.width = '300px';
            this.propertiesPanel.style.right = '10px';
            this.propertiesPanel.style.top = '10px';
            this.propertiesPanel.style.maxHeight = '80vh';
        }
    }
    
    // Unified pointer event handlers (mouse + touch)
    handlePointerDown(e) {
        if (!this.active || this.mode !== 'edit') return;
        e.preventDefault();
        
        const coords = this.getEventCoordinates(e);
        const clickedObject = this.getObjectAtPosition(coords.x, coords.y);
        
        console.log('Level Editor PointerDown:', coords.x, coords.y, 'Found object:', clickedObject);
        
        if (clickedObject) {
            this.selectObject(clickedObject);
            this.startDragging(coords.x, coords.y);
        } else {
            this.selectObject(null);
        }
    }
    
    handlePointerMove(e) {
        if (!this.active || this.mode !== 'edit' || !this.dragging) return;
        e.preventDefault();
        
        const coords = this.getEventCoordinates(e);
        this.updateDragging(coords.x, coords.y);
    }
    
    handlePointerUp(e) {
        if (!this.active || this.mode !== 'edit') return;
        e.preventDefault();
        
        this.stopDragging();
    }
    
    // Legacy mouse event handlers (delegate to pointer handlers)
    handleMouseDown(e) {
        this.handlePointerDown(e);
    }
    
    handleMouseMove(e) {
        this.handlePointerMove(e);
    }
    
    handleMouseUp(e) {
        this.handlePointerUp(e);
    }
    
    // Touch-specific event handlers
    handleTouchStart(e) {
        if (!this.active) return;
        e.preventDefault();
        
        // Handle long press for context menu on mobile
        if (e.touches.length === 1) {
            this.touchStartTime = Date.now();
            this.touchStartPos = this.getEventCoordinates(e.touches[0]);
            
            // Show visual feedback for long press
            this.showLongPressIndicator(this.touchStartPos.x, this.touchStartPos.y);
            
            // Set up long press detection
            this.longPressTimer = setTimeout(() => {
                if (this.touchStartPos && this.mode === 'edit') {
                    // Haptic feedback for long press
                    if ('vibrate' in navigator) {
                        navigator.vibrate(100);
                    }
                    this.showContextMenu(this.touchStartPos.x, this.touchStartPos.y);
                    this.touchStartPos = null;
                    this.hideLongPressIndicator();
                }
            }, 500); // 500ms long press
        }
    }
    
    handleTouchEnd(e) {
        if (!this.active) return;
        e.preventDefault();
        
        // Clear long press timer
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        
        // Reset touch tracking
        this.touchStartTime = null;
        this.touchStartPos = null;
        
        // Hide long press indicator
        this.hideLongPressIndicator();
    }
    
    showLongPressIndicator(x, y) {
        // Remove existing indicator
        this.hideLongPressIndicator();
        
        // Create visual indicator for long press
        this.longPressIndicator = document.createElement('div');
        this.longPressIndicator.style.cssText = `
            position: fixed;
            width: 60px;
            height: 60px;
            border: 3px solid #00ff00;
            border-radius: 50%;
            pointer-events: none;
            z-index: 1001;
            animation: longPressAnimation 0.5s ease-out;
            transform: translate(-50%, -50%);
        `;
        
        // Convert canvas coordinates to screen coordinates
        const rect = this.game.canvas.getBoundingClientRect();
        const screenX = rect.left + x;
        const screenY = rect.top + y;
        
        this.longPressIndicator.style.left = screenX + 'px';
        this.longPressIndicator.style.top = screenY + 'px';
        
        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes longPressAnimation {
                0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
                50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.8; }
                100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(this.longPressIndicator);
    }
    
    hideLongPressIndicator() {
        if (this.longPressIndicator) {
            this.longPressIndicator.remove();
            this.longPressIndicator = null;
        }
    }
    
    handleRightClick(e) {
        if (!this.active || this.mode !== 'edit') return;
        e.preventDefault();
        
        const coords = this.getEventCoordinates(e);
        this.showContextMenu(coords.x, coords.y);
    }
    
    getEventCoordinates(e) {
        const rect = this.game.canvas.getBoundingClientRect();
        
        // Handle both mouse and touch events
        if (e.touches && e.touches.length > 0) {
            // Touch event
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top
            };
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            // Touch end event
            return {
                x: e.changedTouches[0].clientX - rect.left,
                y: e.changedTouches[0].clientY - rect.top
            };
        } else {
            // Mouse/pointer event
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        }
    }
    
    enter() {
        this.active = true;
        this.container.style.display = 'block';
        this.game.state = 'levelEditor';
        this.mode = 'edit';
        this.updateModeButton();
        this.populateObjectButtons();
        
        // Notify fullscreen manager about level editor state change
        if (this.game.fullscreenManager) {
            this.game.fullscreenManager.setLevelEditorMode(true);
        }
    }
    
    exit() {
        this.active = false;
        this.container.style.display = 'none';
        this.selectObject(null);
        this.game.state = 'playing';
        
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
                margin-bottom: 5px;
                padding: 8px 12px;
                background: #2196F3;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                min-height: 44px;
                font-size: 14px;
                touch-action: manipulation;
                white-space: nowrap;
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
        
        // Use larger hit areas for mobile devices for easier touch selection
        const isMobile = window.innerWidth < 768 || 'ontouchstart' in window;
        const baseRadius = obj.radius || obj.collisionRadius || 20;
        const radius = isMobile ? Math.max(baseRadius, 30) : baseRadius; // Minimum 30px touch target on mobile
        
        const dx = x - objX;
        const dy = y - objY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const hit = distance <= radius;
        
        return hit;
    }
    
    selectObject(obj) {
        this.selectedObject = obj;
        console.log('Selected object:', obj ? obj.constructor.name : 'null');
        
        // Provide haptic feedback on mobile devices
        if (obj && 'vibrate' in navigator) {
            navigator.vibrate(50); // Short vibration for selection
        }
        
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
                { key: 'width', label: 'Width', type: 'number', min: 1 },
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
        const baseStyle = "width: 100%; padding: 8px; border: 1px solid #555; background: #333; color: white; border-radius: 5px; font-size: 16px; min-height: 44px; touch-action: manipulation;";
        
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
            } else if ((property === 'width' || property === 'height') && this.selectedObject.constructor.name === 'Planet') {
                // Handle Planet width/height changes - update radius to maintain consistency
                this.selectedObject[property] = value;
                if (property === 'width' || property === 'height') {
                    // Keep radius in sync with the smaller dimension
                    const newRadius = Math.min(this.selectedObject.width, this.selectedObject.height) / 2;
                    this.selectedObject.radius = newRadius;
                    console.log(`Updated planet ${property} to ${value}, adjusted radius to ${newRadius}`);
                }
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
            'Slingshot': [x, y, null, null, 150], // x, y, anchorX, anchorY, stretchLimit
            'TextObject': [x, y, 'Sample Text', { width: 200, height: 100, fontSize: 16, color: '#FFFFFF' }], // x, y, content, options
            'PointingArrow': [x, y, { baseWidth: 20 }] // x, y, options
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
        const rect = this.game.canvas.getBoundingClientRect();
        const screenX = rect.left + x;
        const screenY = rect.top + y;
        
        // Position menu, ensuring it stays on screen
        menu.style.left = Math.min(screenX, window.innerWidth - 200) + 'px';
        menu.style.top = Math.min(screenY, window.innerHeight - 300) + 'px';
        
        // Add menu items for object creation
        const editableClasses = this.getEditableObjectClasses();
        editableClasses.forEach(className => {
            const item = document.createElement('div');
            item.textContent = `Add ${className}`;
            item.style.cssText = `
                padding: 12px 16px;
                cursor: pointer;
                border-bottom: 1px solid #333;
                min-height: 20px;
                touch-action: manipulation;
            `;
            item.style.borderBottom = '1px solid #333';
            
            item.addEventListener('mouseenter', () => {
                item.style.background = '#333';
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = 'transparent';
            });
            
            item.addEventListener('click', () => {
                this.addObjectAtPosition(className, x, y);
                menu.remove();
            });
            
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
        }, 100);
    }
    
    addObjectAtPosition(className, x, y) {
        if (!this.gameObjectClasses || !this.gameObjectClasses[className]) {
            console.error('Unknown class:', className);
            return;
        }
        
        const ClassConstructor = this.gameObjectClasses[className];
        let newObject;
        
        try {
            // Create object at the specified position
            newObject = this.createObjectWithDefaults(ClassConstructor, className, x, y);
            
            if (newObject) {
                // Add to appropriate arrays
                this.addObjectToGame(newObject, className);
                this.selectObject(newObject);
                console.log('Created new', className, 'at', x, y);
            }
        } catch (error) {
            console.error('Failed to create', className, ':', error);
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