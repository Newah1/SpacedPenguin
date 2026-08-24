import { INPUT_CONFIG, isCompactEditorViewport } from '../config/inputConfig.js';
import plog from '../penguinLogger.js';
import { makeDraggablePanel } from './draggablePanel.js';
import { EditorEventType } from './editorEvents.js';

export class LevelEditorObjectListView {
    constructor(editor) {
        this.editor = editor;
        this.element = null;
        this.objects = [];
        this.unsubscribe = [
            editor.events?.on(EditorEventType.SELECTION_CHANGED, () => this.render()),
            editor.events?.on(EditorEventType.DOCUMENT_CHANGED, () => this.render())
        ].filter(Boolean);
    }

    createElement() {
        this.element = document.createElement('section');
        this.element.className = 'editor-panel editor-object-list';
        this.element.classList.toggle('is-compact', isCompactEditorViewport());
        const heading = document.createElement('h3');
        heading.dataset.editorDragHandle = '';
        heading.title = 'Drag to move';
        heading.textContent = 'Objects [drag]';
        this.content = document.createElement('div');
        this.content.className = 'editor-object-list-content';
        this.content.addEventListener('click', event => {
            const item = event.target.closest('[data-object-id], [data-level-settings]');
            if (!item || !this.content.contains(item)) return;
            if (item.dataset.levelSettings !== undefined) this.editor.selectLevelSettings();
            else this.selectId(item.dataset.objectId);
        });
        this.element.append(heading, this.content);
        this.dragController = makeDraggablePanel(this.element, { handleSelector: '[data-editor-drag-handle]' });
        this.render();
        return this.element;
    }

    render() {
        const content = this.content;
        if (!content) return;
        const scrollTop = content.scrollTop;
        this.objects = this.editor.getAllGameObjects();
        const settingsSelected = this.editor.selectedObject === this.editor.levelSettingsNode;
        const fragment = document.createDocumentFragment();
        fragment.appendChild(this.#createItem({
            title: 'Level Settings',
            subtitle: 'Level metadata, positions, and rules',
            selected: settingsSelected,
            levelSettings: true
        }));

        for (const object of this.objects) {
            const position = this.editor.getObjectPosition(object);
            fragment.appendChild(this.#createItem({
                title: this.getIdentifier(object),
                subtitle: `Position: (${position ? Math.round(position.x) : '?'}, ${position ? Math.round(position.y) : '?'})`,
                selected: this.editor.selection.isSelected(object.id),
                objectId: object.id
            }));
        }
        if (this.objects.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'editor-object-list-empty';
            empty.textContent = 'No objects in level';
            fragment.appendChild(empty);
        }
        content.replaceChildren(fragment);
        content.scrollTop = scrollTop;
    }

    #createItem({ title, subtitle, selected, objectId, levelSettings = false }) {
        const item = document.createElement('div');
        item.className = 'object-list-item';
        item.classList.toggle('is-selected', selected);
        if (levelSettings) {
            item.classList.add('level-settings-item');
            item.dataset.levelSettings = 'true';
        } else {
            item.dataset.objectId = objectId;
        }
        const label = document.createElement('div');
        label.className = 'object-list-item-title';
        label.textContent = title;
        const detail = document.createElement('div');
        detail.className = 'object-list-item-detail';
        detail.textContent = subtitle;
        item.append(label, detail);
        return item;
    }

    selectId(id) {
        const object = this.objects.find(candidate => candidate.id === id);
        if (!object) return;
        this.editor.selectObject(object);
        const position = this.editor.getObjectPosition(object);
        const view = this.editor.editorCamera?.viewRect;
        if (position && view && (
            position.x < view.x || position.x > view.x + view.width ||
            position.y < view.y || position.y > view.y + view.height
        )) {
            this.editor.centerEditorOn(position);
        }
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
        if (this.element.dataset.userPositioned) {
            this.dragController?.clampToViewport();
            return;
        }
        this.element.classList.toggle('is-compact', isCompactEditorViewport());
    }

    destroy() {
        this.unsubscribe.forEach(unsubscribe => unsubscribe());
        this.unsubscribe = [];
    }
}

export default LevelEditorObjectListView;
