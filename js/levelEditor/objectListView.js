import { INPUT_CONFIG, isCompactEditorViewport } from '../config/inputConfig.js';
import plog from '../penguinLogger.js';

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

export class LevelEditorObjectListView {
    constructor(editor) {
        this.editor = editor;
        this.element = null;
        this.objects = [];
    }

    createElement() {
        this.element = document.createElement('div');
        this.element.style.cssText = `
            position: absolute; bottom: 10px; left: 10px; width: 300px;
            max-height: 400px; background: rgba(0, 0, 0, 0.8); padding: 15px;
            border-radius: 5px; color: white; font-family: Arial, sans-serif;
            pointer-events: auto; overflow-y: auto; touch-action: auto;
        `;
        if (isCompactEditorViewport()) {
            Object.assign(this.element.style, {
                width: 'calc(100vw - 40px)', maxWidth: '350px', left: '20px',
                bottom: '80px', maxHeight: '300px'
            });
        }
        this.element.innerHTML = '<h3>Objects</h3><div data-object-list-content>Loading...</div>';
        return this.element;
    }

    render() {
        const content = this.element?.querySelector('[data-object-list-content]');
        if (!content) return;
        const scrollTop = content.scrollTop;
        this.objects = this.editor.getAllGameObjects();
        const settingsSelected = this.editor.selectedObject === this.editor.levelSettingsNode;
        const settingsBackground = settingsSelected ? 'rgba(0, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)';
        let html = `<div style="max-height: 300px; overflow-y: auto;">
            <div class="object-list-item level-settings-item" data-level-settings="true"
                 style="padding: 10px; margin: 2px 0 16px; background: ${settingsBackground}; border: 1px solid ${settingsSelected ? '#00ffff' : 'rgba(255, 255, 255, 0.35)'}; border-radius: 3px; cursor: pointer; color: ${settingsSelected ? '#00ffff' : '#ffffff'}; font-size: 12px; user-select: none; touch-action: manipulation;">
                <div style="font-weight: bold;">Level Settings</div>
                <div style="color: #ccc; font-size: 10px;">Level metadata, positions, and rules</div>
            </div>`;

        this.objects.forEach((object, index) => {
            const selected = object === this.editor.selectedObject;
            const position = this.editor.getObjectPosition(object);
            const identifier = this.getIdentifier(object);
            html += `<div class="object-list-item" data-object-index="${index}"
                style="padding: 8px; margin: 2px 0; background: ${selected ? 'rgba(0, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)'}; border: 1px solid ${selected ? '#00ffff' : 'rgba(255, 255, 255, 0.2)'}; border-radius: 3px; cursor: pointer; color: ${selected ? '#00ffff' : '#ffffff'}; font-size: 12px; user-select: none; touch-action: manipulation;">
                <div style="font-weight: bold;">${escapeHtml(identifier)}</div>
                <div style="color: #ccc; font-size: 10px;">Position: (${position ? Math.round(position.x) : '?'}, ${position ? Math.round(position.y) : '?'})</div>
            </div>`;
        });
        if (this.objects.length === 0) html += '<p style="color: #999; margin-top: 0;">No objects in level</p>';
        content.innerHTML = `${html}</div>`;
        content.querySelector('[data-level-settings]')?.addEventListener('click', () => {
            this.editor.selectObject(this.editor.levelSettingsNode);
        });
        content.querySelectorAll('[data-object-index]').forEach(item => {
            const index = Number(item.dataset.objectIndex);
            const base = this.objects[index] === this.editor.selectedObject
                ? 'rgba(0, 255, 255, 0.3)'
                : 'rgba(255, 255, 255, 0.1)';
            item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255, 255, 255, 0.2)'; });
            item.addEventListener('mouseleave', () => { item.style.background = base; });
            item.addEventListener('click', () => this.selectIndex(index));
        });
        content.scrollTop = scrollTop;
    }

    selectIndex(index) {
        const object = this.objects[index];
        if (!object) return;
        this.editor.selectObject(object);
        navigator.vibrate?.(INPUT_CONFIG.hapticsMs.objectListSelection);
        plog.debug('Selected from list:', object.constructor.name);
    }

    getIdentifier(object) {
        const className = object.constructor.name;
        let identifier = object.name || className;
        if (!object.name && className === 'Planet' && object.planetType) identifier += ` (${object.planetType})`;
        else if (!object.name && className === 'Bonus' && object.value) identifier += ` (${object.value})`;
        else if (!object.name && className === 'TextObject' && object.content) {
            const preview = object.content.length > 20 ? `${object.content.slice(0, 20)}...` : object.content;
            identifier += ` ("${preview}")`;
        } else if (!object.name && className === 'Target' && object.spriteType) identifier += ` (${object.spriteType})`;
        if (object.orbitSystem?.orbitRadius > 0) identifier += ' ↻';
        return identifier;
    }

    resize() {
        if (!this.element) return;
        Object.assign(this.element.style, isCompactEditorViewport()
            ? { width: 'calc(100vw - 40px)', maxWidth: '350px', left: '20px', bottom: '80px', maxHeight: '300px' }
            : { width: '300px', maxWidth: '', left: '10px', bottom: '10px', maxHeight: '400px' });
    }
}

export default LevelEditorObjectListView;
