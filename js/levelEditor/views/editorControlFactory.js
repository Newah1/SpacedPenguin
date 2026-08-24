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
    row.append(label, control);
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
