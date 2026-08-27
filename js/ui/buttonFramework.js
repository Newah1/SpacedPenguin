// Shared button framework for DOM and canvas controls.

const BUTTON_STYLE_ID = 'spaced-penguin-button-framework';

const BUTTON_CSS = `
    .spaced-button {
        --button-bg: #444;
        --button-hover: #666;
        --button-active: var(--button-hover);
        --button-fg: #fff6d6;
        --button-border: transparent;
        appearance: none;
        border: 2px solid var(--button-border);
        border-radius: 6px;
        background: var(--button-bg);
        color: var(--button-fg);
        cursor: pointer;
        font: inherit;
        touch-action: manipulation;
        transition: background-color .14s ease, border-color .14s ease,
            box-shadow .14s ease, filter .14s ease, transform .08s ease;
    }

    .spaced-button:hover:not(:disabled),
    .spaced-button.is-hovered:not(:disabled) {
        background: var(--button-hover);
        filter: brightness(1.08);
        transform: translateY(-1px);
    }

    .spaced-button:active:not(:disabled),
    .spaced-button.is-pressed:not(:disabled) {
        background: var(--button-active);
        filter: brightness(.96);
        transform: translateY(1px);
    }

    .spaced-button:focus-visible {
        outline: 3px solid #fff;
        outline-offset: 3px;
        box-shadow: 0 0 0 2px var(--button-border);
    }

    .spaced-button:disabled {
        cursor: not-allowed;
        filter: grayscale(.7) opacity(.55);
    }
`;

export function ensureButtonStyles() {
    if (typeof document === 'undefined' || document.getElementById(BUTTON_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = BUTTON_STYLE_ID;
    style.textContent = BUTTON_CSS;
    document.head?.appendChild(style);
}

export function registerButton(element, action = null, options = {}) {
    if (!element) return element;
    ensureButtonStyles();
    element.type = options.type || 'button';
    element.classList.add('spaced-button');
    element.dataset.buttonVariant = options.variant || 'default';

    const colors = {
        bg: options.backgroundColor,
        hover: options.hoverColor,
        active: options.activeColor,
        fg: options.textColor,
        border: options.borderColor
    };
    for (const [name, value] of Object.entries(colors)) {
        if (value) element.style.setProperty(`--button-${name}`, value);
    }

    if (action) {
        element.addEventListener('click', event => action(event));
    }
    return element;
}

export function createButton(label, action, options = {}) {
    const element = document.createElement('button');
    element.textContent = label;
    return registerButton(element, action, options);
}

export class CanvasButton {
    constructor(x, y, width, height, text, onClick, options = {}) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.text = text;
        this.onClick = onClick;
        this.backgroundColor = options.backgroundColor || '#444444';
        this.hoverColor = options.hoverColor || '#666666';
        this.activeColor = options.activeColor || this.hoverColor;
        this.borderColor = options.borderColor || '#FFFFCC';
        this.focusBorderColor = options.focusBorderColor || this.borderColor;
        this.textColor = options.textColor || '#FFFFCC';
        this.fontSize = options.fontSize || 14;
        this.fontFamily = options.fontFamily || 'Verdana, sans-serif';
        this.isHovered = false;
        this.isPressed = false;
        this.isFocused = false;
        this.visible = true;
        this.disabled = false;
        this.hitTest = options.hitTest || this.isPointInside.bind(this);
        this.renderButton = options.renderButton || this.renderDefault.bind(this);
    }

    isPointInside(x, y) {
        return x >= this.x && x <= this.x + this.width &&
            y >= this.y && y <= this.y + this.height;
    }

    setHovered(hovered) {
        this.isHovered = Boolean(hovered && this.visible && !this.disabled);
        return this.isHovered;
    }

    handlePointerMove(x, y) {
        if (!this.visible || this.disabled) {
            this.isHovered = false;
            return false;
        }
        return this.setHovered(this.hitTest(x, y));
    }

    handlePointerDown(x, y) {
        if (!this.visible || this.disabled || !this.hitTest(x, y)) return false;
        this.isPressed = true;
        return true;
    }

    handlePointerUp() {
        this.isPressed = false;
    }

    handleClick(x, y, event) {
        if (!this.visible || this.disabled || !this.hitTest(x, y)) return false;
        this.isPressed = false;
        this.onClick?.(event);
        return true;
    }

    render(ctx) {
        if (!this.visible) return;
        this.renderButton(ctx, this);
    }

    renderDefault(ctx) {
        ctx.fillStyle = this.isPressed ? this.activeColor :
            this.isHovered ? this.hoverColor : this.backgroundColor;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeStyle = this.isFocused ? this.focusBorderColor : this.borderColor;
        ctx.lineWidth = this.isFocused ? 4 : 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        ctx.fillStyle = this.textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.text, this.x + this.width / 2, this.y + this.height / 2);
    }
}

ensureButtonStyles();
