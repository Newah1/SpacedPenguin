import { SettingType } from './config/settingsConfig.js';
import { createButton } from './buttonFramework.js';

const controlRenderers = new Map();

export function formatValue(definition, value) {
    if (definition.format === 'percent') return `${Math.round(value * 100)}%`;
    return String(value);
}

export async function resolveNumberSettingChange(definition, requestedValue, onChange) {
    const nextValue = await onChange(requestedValue);
    const normalizedValue = Number.isFinite(Number(nextValue))
        ? Number(nextValue)
        : requestedValue;
    return {
        value: normalizedValue,
        display: formatValue(definition, normalizedValue)
    };
}

controlRenderers.set(SettingType.BOOLEAN, ({ definition, value, onChange }) => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.setAttribute('aria-label', definition.label);
    input.addEventListener('change', async () => {
        input.disabled = true;
        try {
            input.checked = Boolean(await onChange(input.checked));
        } finally {
            input.disabled = false;
        }
    });
    return input;
});

controlRenderers.set(SettingType.NUMBER, ({ definition, value, onChange }) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'settings-range-control';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(definition.min);
    input.max = String(definition.max);
    input.step = String(definition.step);
    input.value = String(value);
    input.setAttribute('aria-label', definition.label);
    const output = document.createElement('output');
    output.value = formatValue(definition, value);
    output.textContent = output.value;
    let changeVersion = 0;
    input.addEventListener('input', async () => {
        const version = ++changeVersion;
        const requestedValue = Number(input.value);
        const result = await resolveNumberSettingChange(definition, requestedValue, onChange);
        if (version !== changeVersion) return;
        input.value = String(result.value);
        output.value = result.display;
        output.textContent = output.value;
    });
    wrapper.append(input, output);
    return wrapper;
});

export class SettingsScreen {
    constructor(uiManager, settingsManager, options = {}) {
        this.uiManager = uiManager;
        this.settingsManager = settingsManager;
        this.onClose = options.onClose;
        this.onSettingChange = options.onSettingChange;
        this.element = this.build();
        (uiManager.canvas.parentElement || document.body).appendChild(this.element);
        this.element.querySelector('input, button')?.focus();
    }

    build() {
        const overlay = document.createElement('section');
        overlay.className = 'settings-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'settings-title');

        const panel = document.createElement('div');
        panel.className = 'settings-panel';
        const title = document.createElement('h2');
        title.id = 'settings-title';
        title.textContent = this.settingsManager.config.title;
        panel.appendChild(title);

        for (const definition of this.settingsManager.getDefinitions()) {
            const renderer = controlRenderers.get(definition.type);
            if (!renderer) continue;
            const row = document.createElement('label');
            row.className = `settings-row settings-row-${definition.type}`;
            const copy = document.createElement('span');
            copy.className = 'settings-copy';
            const name = document.createElement('strong');
            name.textContent = definition.label;
            const description = document.createElement('small');
            description.textContent = definition.description || '';
            copy.append(name, description);
            row.append(copy, renderer({
                definition,
                value: this.settingsManager.get(definition.key),
                onChange: value => this.onSettingChange
                    ? this.onSettingChange(definition, value)
                    : this.settingsManager.set(definition.key, value)
            }));
            panel.appendChild(row);
        }

        const closeButton = createButton('BACK', () => this.close(), {
            backgroundColor: '#4b3b32',
            hoverColor: '#6a5142',
            textColor: '#fff6d6',
            borderColor: '#e9c27a'
        });
        closeButton.classList.add('settings-close-button');
        panel.appendChild(closeButton);
        overlay.appendChild(panel);
        overlay.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.code === 'Escape') {
                event.preventDefault();
                this.close();
            }
        });
        return overlay;
    }

    close() {
        this.uiManager.closeScreen(this);
        this.onClose?.();
    }

    destroy() {
        this.element?.remove();
    }

    handleClick() {
        return true;
    }

    handleKeyPress() {
        return true;
    }

    update() {}
    render() {}
}
