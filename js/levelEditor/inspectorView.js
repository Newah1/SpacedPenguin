import { isCompactEditorViewport } from '../config/inputConfig.js';
import { LevelOrbitType } from '../levelSchema.js';
import { makeDraggablePanel } from './draggablePanel.js';

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

export class LevelEditorInspectorView {
    constructor(editor) {
        this.editor = editor;
        this.element = null;
    }

    createElement() {
        this.element = document.createElement('div');
        this.element.style.cssText = `
            position: absolute; top: 10px; right: 10px; width: 300px;
            background: rgba(0, 0, 0, 0.8); padding: 15px; border-radius: 5px;
            color: white; font-family: Arial, sans-serif; pointer-events: auto;
            max-height: 80vh; overflow-y: auto; touch-action: auto;
        `;
        if (isCompactEditorViewport()) {
            Object.assign(this.element.style, {
                width: 'calc(100vw - 40px)', maxWidth: '350px', right: '20px',
                top: '80px', maxHeight: '60vh'
            });
        }
        this.render();
        this.dragController = makeDraggablePanel(this.element, { handleSelector: '[data-editor-drag-handle]' });
        return this.element;
    }

    render() {
        if (!this.element) return;
        const selected = this.editor.selectedObject;
        if (!selected) {
            this.element.innerHTML = '<h3 data-editor-drag-handle title="Drag to move">Properties &nbsp;[drag]</h3><p>Select an object to edit its properties</p>';
            return;
        }

        const settings = selected.isLevelSettings;
        const properties = settings
            ? this.editor.getLevelSettingsProperties()
            : this.editor.getEditableProperties(selected);
        let html = `<h3 data-editor-drag-handle title="Drag to move">${settings ? 'Level Settings' : `Properties - ${escapeHtml(selected.constructor.name)}`} &nbsp;[drag]</h3>`;
        for (const property of properties) html += this.createPropertyInput(property);

        if (!settings) {
            html += `<div style="margin-top: 12px; border-top: 1px solid #444; padding-top: 10px;">
                <div style="font-weight: bold; margin-bottom: 6px;">Quick Actions</div>
                <button data-quick-action="center" style="width: 100%; padding: 10px; background: #4a90e2; color: #fff; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; margin-bottom: 8px;">Center on Canvas</button>`;
            if (selected.orbitSystem?.orbitType === LevelOrbitType.GRAVITY) {
                html += '<button data-quick-action="reset-gravity" style="width: 100%; padding: 10px; background: #e74c3c; color: #fff; border: none; border-radius: 6px; font-size: 16px; cursor: pointer;">Reset Position (Keep Current Velocity)</button>';
            }
            html += '</div>';
        }

        this.element.innerHTML = html;
        this.bindPropertyInputs();
        this.element.querySelector('[data-quick-action="center"]')
            ?.addEventListener('click', () => this.editor.centerSelectedObjectOnCanvas());
        this.element.querySelector('[data-quick-action="reset-gravity"]')
            ?.addEventListener('click', () => this.editor.resetGravityOrbit(selected));
    }

    createPropertyInput({ label, key, value, type, ...options }) {
        const baseStyle = 'width: 100%; padding: 8px; border: 1px solid #555; background: #333; color: white; border-radius: 5px; font-size: 16px; min-height: 44px; touch-action: manipulation;';
        const property = escapeHtml(key);
        let input;
        if (type === 'checkbox') {
            input = `<input type="checkbox" data-property="${property}" ${value ? 'checked' : ''} style="width: auto;">`;
        } else if (type === 'select') {
            const optionHtml = (options.options || []).map(option => {
                const safe = escapeHtml(option);
                return `<option value="${safe}" ${option === value ? 'selected' : ''}>${safe}</option>`;
            }).join('');
            input = `<select data-property="${property}" style="${baseStyle}">${optionHtml}</select>`;
        } else if (type === 'color') {
            input = `<input type="color" data-property="${property}" value="${escapeHtml(value || '#ffffff')}" style="${baseStyle}">`;
        } else if (type === 'button') {
            input = `<button data-property="${property}" style="width: 100%; padding: 10px; background: #e74c3c; color: #fff; border: none; border-radius: 6px; font-size: 16px; cursor: pointer;">${escapeHtml(options.buttonText || 'Click')}</button>`;
        } else {
            const nullable = type === 'nullableNumber';
            const inputType = type === 'text' ? 'text' : 'number';
            const min = options.min !== undefined ? `min="${options.min}"` : '';
            const max = options.max !== undefined ? `max="${options.max}"` : '';
            const step = inputType === 'number' ? `step="${options.step ?? 'any'}"` : '';
            input = `<input type="${inputType}" data-property="${property}" ${nullable ? 'data-nullable="true"' : ''} value="${escapeHtml(value ?? '')}" ${min} ${max} ${step} style="${baseStyle}">`;
        }
        return `<div style="margin-bottom: 10px;"><label style="display: block; margin-bottom: 5px;">${escapeHtml(label)}:</label>${input}</div>`;
    }

    bindPropertyInputs() {
        const inputs = this.element.querySelectorAll('[data-property]');
        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                input.dataset.editSession = String(++this.editor.propertyEditSession);
            });
            if (input.tagName === 'BUTTON') {
                input.addEventListener('click', event => this.editor.handlePropertyChange(event));
            } else {
                input.addEventListener('input', event => {
                    input.setCustomValidity?.('');
                    this.editor.handlePropertyChange(event);
                });
            }
        });
    }

    query(selector) {
        return this.element?.querySelector(selector) ?? null;
    }

    resize() {
        if (!this.element) return;
        if (this.element.dataset.userPositioned) {
            this.dragController?.clampToViewport();
            return;
        }
        Object.assign(this.element.style, isCompactEditorViewport()
            ? { width: 'calc(100vw - 40px)', maxWidth: '350px', right: '20px', top: '120px', maxHeight: '50vh' }
            : { width: '300px', maxWidth: '', right: '10px', top: '10px', maxHeight: '80vh' });
    }
}

export default LevelEditorInspectorView;
