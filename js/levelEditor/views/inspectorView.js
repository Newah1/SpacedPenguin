import { isCompactEditorViewport } from '../../config/inputConfig.js';
import { LevelOrbitType } from '../../levelSchema.js';
import { EditorEventType } from '../state/editorEvents.js';
import {
    createEditorActionButton,
    createEditorPropertyControl
} from './editorControlFactory.js';
import { makeDraggablePanel } from './draggablePanel.js';

export class LevelEditorInspectorView {
    constructor(editor) {
        this.editor = editor;
        this.element = null;
        this.unsubscribe = [
            editor.events?.on(EditorEventType.SELECTION_CHANGED, () => this.render()),
            editor.events?.on(EditorEventType.DOCUMENT_CHANGED, event => {
                const changesInspectorShape = [
                    'orbitTargetType', 'orbitType', 'validateObject',
                    'waypointMode', 'waypointAdd', 'waypointRemove'
                ].includes(event?.property) || /^waypoint\d+[XY]$/.test(event?.property || '');
                if (event?.source !== 'inspector-live' || changesInspectorShape) this.render();
            })
        ].filter(Boolean);
    }

    createElement() {
        this.element = document.createElement('section');
        this.element.className = 'editor-panel editor-inspector';
        if (isCompactEditorViewport()) this.element.classList.add('is-compact');
        this.render();
        this.dragController = makeDraggablePanel(this.element, { handleSelector: '[data-editor-drag-handle]' });
        return this.element;
    }

    render() {
        if (!this.element) return;
        const selected = this.editor.selectedObject;
        const heading = document.createElement('h3');
        heading.dataset.editorDragHandle = '';
        heading.title = 'Drag to move';
        heading.textContent = selected
            ? `${selected.isLevelSettings ? 'Level Settings' : `Properties — ${selected.constructor.name}`} [drag]`
            : 'Properties [drag]';

        if (!selected) {
            const empty = document.createElement('p');
            empty.textContent = 'Select an object to edit its properties';
            this.element.replaceChildren(heading, empty);
            return;
        }

        const properties = selected.isLevelSettings
            ? this.editor.getLevelSettingsProperties()
            : this.editor.getEditableProperties(selected);
        const fragment = document.createDocumentFragment();
        fragment.appendChild(heading);
        for (const definition of properties) {
            const { row } = createEditorPropertyControl(definition, {
                onFocus: event => {
                    event.currentTarget.dataset.editSession = String(++this.editor.propertyEditSession);
                },
                onInput: event => {
                    event.currentTarget.setCustomValidity?.('');
                    this.editor.handlePropertyChange(event);
                },
                onAction: event => this.editor.handlePropertyChange(event)
            });
            fragment.appendChild(row);
        }

        if (!selected.isLevelSettings) fragment.appendChild(this.#createQuickActions(selected));
        this.element.replaceChildren(fragment);
    }

    #createQuickActions(selected) {
        const actions = document.createElement('div');
        actions.className = 'editor-quick-actions';
        const title = document.createElement('div');
        title.className = 'editor-quick-actions-title';
        title.textContent = 'Quick Actions';
        actions.appendChild(title);
        actions.appendChild(createEditorActionButton(
            'Center on Canvas',
            () => this.editor.centerSelectedObjectOnCanvas()
        ));
        if (selected.orbitSystem?.orbitType === LevelOrbitType.GRAVITY) {
            actions.appendChild(createEditorActionButton(
                'Reset Position (Keep Current Velocity)',
                () => this.editor.resetGravityOrbit(selected),
                'is-danger'
            ));
        }
        return actions;
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
        this.element.classList.toggle('is-compact', isCompactEditorViewport());
        Object.assign(this.element.style, isCompactEditorViewport()
            ? { right: '20px', top: '120px' }
            : { right: '10px', top: '10px' });
    }

    destroy() {
        this.unsubscribe.forEach(unsubscribe => unsubscribe());
        this.unsubscribe = [];
    }
}

export default LevelEditorInspectorView;
