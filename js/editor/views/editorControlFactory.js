function createInput(definition) {
    let control;
    if (definition.type === 'select') {
        control = document.createElement('select');
        for (const optionValue of definition.options || []) {
            const option = document.createElement('option');
            option.value = String(optionValue);
            option.textContent = String(optionValue);
            option.selected = optionValue === definition.value;
            control.appendChild(option);
        }
    } else if (definition.type === 'button') {
        control = document.createElement('button');
        control.type = 'button';
        control.textContent = definition.buttonText || 'Apply';
        control.className = 'spaced-button editor-action-button';
    } else {
        control = document.createElement('input');
        control.type = definition.type === 'text' || definition.type === 'color'
            ? definition.type
            : definition.type === 'checkbox' ? 'checkbox' : 'number';
        if (definition.type === 'checkbox') control.checked = Boolean(definition.value);
        else control.value = definition.value ?? '';
        if (definition.type === 'nullableNumber') control.dataset.nullable = 'true';
        if (definition.min !== undefined) control.min = String(definition.min);
        if (definition.max !== undefined) control.max = String(definition.max);
        if (control.type === 'number') control.step = String(definition.step ?? 'any');
    }
    control.dataset.property = definition.key;
    if (control.tagName !== 'BUTTON' && control.type !== 'checkbox') {
        control.classList.add('editor-input');
    }
    return control;
}

function decimalPlaces(value) {
    const text = String(value).toLowerCase();
    if (text.includes('e-')) return Number(text.split('e-')[1]) || 0;
    return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

export function getNumericNudge(definition, currentValue, scale = 1) {
    const configuredStep = Number(definition.step);
    const value = Number(currentValue);
    const magnitude = Math.abs(Number.isFinite(value) ? value : 0);
    const baseStep = Number.isFinite(configuredStep) && configuredStep > 0
        ? configuredStep
        : magnitude > 0 && magnitude < 1
            ? 10 ** Math.floor(Math.log10(magnitude))
            : 1;
    if (scale === 1) return baseStep;
    const magnitudeStep = magnitude > 0
        ? 10 ** Math.floor(Math.log10(magnitude))
        : baseStep * 10;
    return Math.max(baseStep * scale, magnitudeStep);
}

export function adjustNumericValue(definition, currentValue, direction, scale = 1) {
    const parsed = Number(currentValue);
    const fallback = definition.min ?? 0;
    const value = currentValue !== '' && Number.isFinite(parsed) ? parsed : fallback;
    const nudge = getNumericNudge(definition, value, scale);
    const min = definition.min === undefined ? -Infinity : Number(definition.min);
    const max = definition.max === undefined ? Infinity : Number(definition.max);
    const adjusted = Math.min(max, Math.max(min, value + direction * nudge));
    const precision = Math.max(decimalPlaces(value), decimalPlaces(nudge));
    return Number(adjusted.toFixed(Math.min(precision, 12)));
}

function createNudgeButton(label, title, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'editor-number-nudge';
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.addEventListener('click', onClick);
    return button;
}

function wrapNumericInput(control, definition) {
    const group = document.createElement('div');
    group.className = 'editor-number-control';
    const adjust = (direction, scale) => {
        control.value = String(adjustNumericValue(definition, control.value, direction, scale));
        control.dispatchEvent(new Event('input', { bubbles: true }));
    };
    group.append(
        createNudgeButton('\u2212\u2212', 'Decrease by a large step', () => adjust(-1, 10)),
        createNudgeButton('\u2212', 'Decrease by one step', () => adjust(-1, 1)),
        control,
        createNudgeButton('+', 'Increase by one step', () => adjust(1, 1)),
        createNudgeButton('++', 'Increase by a large step', () => adjust(1, 10))
    );
    return group;
}

export function createEditorPropertyControl(definition, { onFocus, onInput, onAction } = {}) {
    const row = document.createElement('div');
    row.className = 'editor-property';
    const label = document.createElement('label');
    label.className = 'editor-property-label';
    label.textContent = `${definition.label}:`;
    const control = createInput(definition);
    label.htmlFor = `editor-property-${definition.key}`;
    control.id = label.htmlFor;
    control.addEventListener('focus', event => onFocus?.(event));
    if (control.tagName === 'BUTTON') {
        control.addEventListener('click', event => onAction?.(event));
    } else {
        control.addEventListener('input', event => onInput?.(event));
    }
    row.append(label, control.type === 'number' ? wrapNumericInput(control, definition) : control);
    return { row, control };
}

export function createEditorActionButton(label, action, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `spaced-button editor-action-button ${className}`.trim();
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
}
