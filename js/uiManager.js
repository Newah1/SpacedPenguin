// UI Manager for Spaced Penguin
// Provides an extensible system for menus, dialogs, and overlays

export class UIManager {
    constructor(canvas, audioManager) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.audioManager = audioManager;
        this.activeScreens = [];
        this.fonts = {
            verdana: 'Verdana, sans-serif',
            system: 'Arial, sans-serif'
        };
        
        // Bind methods to preserve context
        this.handleClick = this.handleClick.bind(this);
        this.handleKeyPress = this.handleKeyPress.bind(this);
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('click', this.handleClick);
        window.addEventListener('keydown', this.handleKeyPress);
    }
    
    showScreen(screenClass, ...args) {
        const screen = new screenClass(this, ...args);
        this.activeScreens.push(screen);
        return screen;
    }
    
    closeScreen(screen) {
        const index = this.activeScreens.indexOf(screen);
        if (index !== -1) {
            this.activeScreens.splice(index, 1);
        }
    }
    
    closeAllScreens() {
        this.activeScreens = [];
    }
    
    handleClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Handle clicks from top to bottom (last added screen gets priority)
        for (let i = this.activeScreens.length - 1; i >= 0; i--) {
            const screen = this.activeScreens[i];
            if (screen.handleClick && screen.handleClick(x, y)) {
                break; // Screen handled the click
            }
        }
    }
    
    handleKeyPress(event) {
        // Handle key presses from top to bottom
        for (let i = this.activeScreens.length - 1; i >= 0; i--) {
            const screen = this.activeScreens[i];
            if (screen.handleKeyPress && screen.handleKeyPress(event)) {
                break; // Screen handled the key press
            }
        }
    }
    
    update(deltaTime) {
        for (const screen of this.activeScreens) {
            if (screen.update) {
                screen.update(deltaTime);
            }
        }
    }
    
    render() {
        for (const screen of this.activeScreens) {
            if (screen.render) {
                screen.render(this.ctx);
            }
        }
    }
    
    playSound(soundName) {
        if (this.audioManager) {
            this.audioManager.playSound(soundName);
        }
    }
}

// Base class for UI screens
export class UIScreen {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.elements = [];
        this.visible = true;
    }
    
    addElement(element) {
        this.elements.push(element);
        return element;
    }
    
    close() {
        this.uiManager.closeScreen(this);
    }
    
    handleClick(x, y) {
        if (!this.visible) return false;
        
        for (const element of this.elements) {
            if (element.handleClick && element.handleClick(x, y)) {
                return true;
            }
        }
        return false;
    }
    
    handleKeyPress(event) {
        if (!this.visible) return false;
        
        for (const element of this.elements) {
            if (element.handleKeyPress && element.handleKeyPress(event)) {
                return true;
            }
        }
        return false;
    }
    
    update(deltaTime) {
        if (!this.visible) return;
        
        for (const element of this.elements) {
            if (element.update) {
                element.update(deltaTime);
            }
        }
    }
    
    render(ctx) {
        if (!this.visible) return;
        
        for (const element of this.elements) {
            if (element.render) {
                element.render(ctx);
            }
        }
    }
}

// UI Element base class
export class UIElement {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.visible = true;
    }
    
    isPointInside(x, y) {
        return x >= this.x && x <= this.x + this.width &&
               y >= this.y && y <= this.y + this.height;
    }
}

// Background overlay with semi-transparent fill
export class BackgroundOverlay extends UIElement {
    constructor(color = 'rgba(0, 0, 0, 0.7)', x = 0, y = 0, width = 800, height = 600) {
        super(x, y, width, height);
        this.color = color;
    }
    
    render(ctx) {
        if (!this.visible) return;
        
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

// Panel/dialog box with border
export class Panel extends UIElement {
    constructor(x, y, width, height, options = {}) {
        super(x, y, width, height);
        this.backgroundColor = options.backgroundColor || '#2C2C2C';
        this.borderColor = options.borderColor || '#FFFFCC';
        this.borderWidth = options.borderWidth || 2;
        this.cornerRadius = options.cornerRadius || 0;
    }
    
    render(ctx) {
        if (!this.visible) return;
        
        // Fill background
        ctx.fillStyle = this.backgroundColor;
        if (this.cornerRadius > 0) {
            this.roundRect(ctx, this.x, this.y, this.width, this.height, this.cornerRadius);
            ctx.fill();
        } else {
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
        
        // Draw border
        ctx.strokeStyle = this.borderColor;
        ctx.lineWidth = this.borderWidth;
        if (this.cornerRadius > 0) {
            this.roundRect(ctx, this.x, this.y, this.width, this.height, this.cornerRadius);
            ctx.stroke();
        } else {
            ctx.strokeRect(this.x, this.y, this.width, this.height);
        }
    }
    
    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
}

// Text element with original game styling
export class TextElement extends UIElement {
    constructor(x, y, text, options = {}) {
        super(x, y, 0, 0);
        this.text = text;
        this.fontSize = options.fontSize || 16;
        this.fontFamily = options.fontFamily || 'Verdana, sans-serif';
        this.color = options.color || '#FFFFCC';
        this.align = options.align || 'left';
        this.bold = options.bold || false;
        this.maxWidth = options.maxWidth || null;
        this.lineHeight = options.lineHeight || this.fontSize * 1.2;
        
        this.updateSize();
    }
    
    setText(text) {
        this.text = text;
        this.updateSize();
    }
    
    updateSize() {
        // This is a rough estimation - actual size will be measured during render
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = `${this.bold ? 'bold ' : ''}${this.fontSize}px ${this.fontFamily}`;
        
        if (this.maxWidth) {
            const lines = this.wrapText(ctx, this.text, this.maxWidth);
            this.width = this.maxWidth;
            this.height = lines.length * this.lineHeight;
        } else {
            const metrics = ctx.measureText(this.text);
            this.width = metrics.width;
            this.height = this.fontSize;
        }
    }
    
    wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        
        for (const word of words) {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine) {
            lines.push(currentLine);
        }
        
        return lines;
    }
    
    render(ctx) {
        if (!this.visible) return;
        
        ctx.font = `${this.bold ? 'bold ' : ''}${this.fontSize}px ${this.fontFamily}`;
        ctx.fillStyle = this.color;
        ctx.textAlign = this.align;
        
        if (this.maxWidth) {
            const lines = this.wrapText(ctx, this.text, this.maxWidth);
            for (let i = 0; i < lines.length; i++) {
                const lineY = this.y + (i + 1) * this.lineHeight;
                ctx.fillText(lines[i], this.x, lineY);
            }
        } else {
            ctx.fillText(this.text, this.x, this.y + this.fontSize);
        }
    }
}

// Button with original game styling
export class Button extends UIElement {
    constructor(x, y, width, height, text, onClick, options = {}) {
        super(x, y, width, height);
        this.text = text;
        this.onClick = onClick;
        this.backgroundColor = options.backgroundColor || '#444444';
        this.hoverColor = options.hoverColor || '#666666';
        this.borderColor = options.borderColor || '#FFFFCC';
        this.textColor = options.textColor || '#FFFFCC';
        this.fontSize = options.fontSize || 14;
        this.fontFamily = options.fontFamily || 'Verdana, sans-serif';
        this.isHovered = false;
        this.isPressed = false;
    }
    
    handleClick(x, y) {
        if (!this.visible) return false;
        
        if (this.isPointInside(x, y)) {
            if (this.onClick) {
                this.onClick();
            }
            return true;
        }
        return false;
    }
    
    render(ctx) {
        if (!this.visible) return;
        
        // Background
        ctx.fillStyle = this.isPressed ? this.hoverColor : 
                       this.isHovered ? this.hoverColor : this.backgroundColor;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // Border
        ctx.strokeStyle = this.borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        // Text
        ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        ctx.fillStyle = this.textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.text, this.x + this.width / 2, this.y + this.height / 2);
    }
}

// Animated number display (for score counting)
export class AnimatedNumber extends UIElement {
    constructor(x, y, targetValue, options = {}) {
        super(x, y, 0, 0);
        this.targetValue = targetValue;
        this.currentValue = 0;
        this.animationSpeed = options.animationSpeed || 25; // points per second
        this.fontSize = options.fontSize || 16;
        this.fontFamily = options.fontFamily || 'Verdana, sans-serif';
        this.color = options.color || '#FFFFCC';
        this.align = options.align || 'right';
        this.bold = options.bold || false;
        this.prefix = options.prefix || '';
        this.suffix = options.suffix || '';
        this.width = options.width || 100;
        this.onComplete = options.onComplete || null;
        this.isComplete = false;
        
        this.updateSize();
    }
    
    setTarget(newTarget) {
        this.targetValue = newTarget;
        this.isComplete = false;
    }
    
    updateSize() {
        this.height = this.fontSize;
    }
    
    update(deltaTime) {
        if (this.currentValue < this.targetValue) {
            const increment = this.animationSpeed * deltaTime;
            this.currentValue += increment;
            
            if (this.currentValue >= this.targetValue) {
                this.currentValue = this.targetValue;
                if (!this.isComplete && this.onComplete) {
                    this.isComplete = true;
                    this.onComplete();
                }
            }
        }
    }
    
    render(ctx) {
        if (!this.visible) return;
        
        ctx.font = `${this.bold ? 'bold ' : ''}${this.fontSize}px ${this.fontFamily}`;
        ctx.fillStyle = this.color;
        ctx.textAlign = this.align;
        
        const displayValue = Math.floor(this.currentValue);
        const text = `${this.prefix}${displayValue}${this.suffix}`;
        
        let textX = this.x;
        if (this.align === 'center') {
            textX = this.x + this.width / 2;
        } else if (this.align === 'right') {
            textX = this.x + this.width;
        }
        
        ctx.fillText(text, textX, this.y + this.fontSize);
    }
}