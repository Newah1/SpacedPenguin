import { isCompactEditorViewport } from '../../config/inputConfig.js';
import { makeDraggablePanel } from './draggablePanel.js';
import { createButton } from '../../ui/buttonFramework.js';
import { getGameObjectDefinition } from '../../runtime/gameObjectRegistry.js';
import { EditorEventType } from '../state/editorEvents.js';

function button(label, background, action) {
    const element = createButton(label, action, {
        backgroundColor: background,
        hoverColor: background,
        textColor: 'white',
        borderColor: 'rgba(255, 255, 255, .25)'
    });
    element.classList.add('editor-toolbar-button');
    return element;
}

export class LevelEditorToolbarView {
    constructor(editor) {
        this.editor = editor;
        this.addButtons = {};
        this.unsubscribe = [
            editor.events?.on(EditorEventType.SELECTION_CHANGED, event =>
                this.updateContextActions(event.object)),
            editor.events?.on(EditorEventType.MODE_CHANGED, event => this.updateMode(event.mode)),
            editor.events?.on(EditorEventType.HISTORY_CHANGED, () => this.updatePublishAvailability())
        ].filter(Boolean);
    }

    createElements() {
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'editor-toolbar-wrapper';
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'editor-toolbar';
        this.modeButton = button('Switch to Play Mode', '#4CAF50', () => this.editor.toggleMode());
        this.toggleButton = button('Add Objects ▼', '#2196F3', event => {
            event.stopPropagation();
            this.section.style.display === 'none' ? this.open() : this.close();
        });
        this.deleteButton = button('Delete Selected', '#f44336', () => this.editor.deleteSelectedObject());
        this.cloneButton = button('Clone Selected', '#9C27B0', () => this.editor.cloneSelected());
        this.exportButton = button('Export Level', '#FF9800', () => this.editor.exportLevel());
        this.saveButton = button('Save', '#2e8b57', () => this.editor.saveLevel());
        this.publishButton = button('Publish', '#7b4bb7', () => this.editor.publishLevel());
        this.publishButton.hidden = !this.editor.game.communityLevelClient;
        this.publishHint = document.createElement('span');
        this.publishHint.textContent = 'Play-test first';
        this.publishHint.title = 'Complete this level in Play Mode to unlock Publish';
        this.publishHint.setAttribute('aria-label', this.publishHint.title);
        this.publishHint.className = 'editor-publish-hint';
        this.publishControl = document.createElement('span');
        this.publishControl.className = 'editor-publish-control';
        this.publishControl.append(this.publishButton, this.publishHint);
        this.updatePublishAvailability();
        this.loadButton = button('Open Level…', '#3d74b8', () => this.editor.loadLevel());
        this.menuButton = button('Main Menu', '#704c3b', () => this.editor.exitToMenu());
        this.sculptButton = button('Gravity Sculpt', '#00A6A6', () => this.editor.gravitySculptController.toggle());
        this.minimizeButton = button('−', '#555', event => {
            event.stopPropagation();
            this.setMinimized(!this.minimized);
        });
        this.minimizeButton.title = 'Minimize editor toolbar';
        this.minimizeButton.setAttribute('aria-label', this.minimizeButton.title);
        this.minimizeButton.style.fontSize = '22px';
        this.minimizeButton.style.padding = '4px 12px';
        this.section = document.createElement('div');
        this.section.className = 'editor-add-section';
        this.addButtonContainer = document.createElement('div');
        this.addButtonContainer.className = 'editor-add-button-container';
        this.section.appendChild(this.addButtonContainer);
        this.toolbarControls = [
            this.modeButton, this.toggleButton, this.deleteButton,
            this.cloneButton, this.sculptButton, this.exportButton,
            this.saveButton, this.publishControl,
            this.loadButton, this.menuButton
        ];
        this.status = document.createElement('span');
        this.status.setAttribute('role', 'status');
        this.status.setAttribute('aria-live', 'polite');
        this.status.className = 'editor-status';
        this.toolbar.append(...this.toolbarControls, this.status, this.minimizeButton);
        this.wrapper.append(this.toolbar, this.section);
        this.mobileToolbar = this.createMobileToolbar();
        this.toolbarDrag = makeDraggablePanel(this.toolbar);
        this.sectionDrag = makeDraggablePanel(this.section);
        this.mobileToolbarDrag = makeDraggablePanel(this.mobileToolbar);
        this.updateContextActions();
        return {
            toolbarWrapper: this.wrapper,
            toolbar: this.toolbar,
            modeButton: this.modeButton,
            collapsibleToggle: this.toggleButton,
            collapsibleSection: this.section,
            addButtonContainer: this.addButtonContainer,
            mobileToolbar: this.mobileToolbar,
            deleteButton: this.deleteButton,
            cloneButton: this.cloneButton,
            exportButton: this.exportButton,
            saveButton: this.saveButton,
            publishButton: this.publishButton,
            loadButton: this.loadButton,
            menuButton: this.menuButton,
            sculptButton: this.sculptButton,
            minimizeButton: this.minimizeButton,
            addButtons: this.addButtons,
            editorStatus: this.status
        };
    }

    showStatus(message, kind = 'success') {
        this.status.textContent = message;
        this.status.dataset.kind = kind;
        this.status.style.color = kind === 'error' ? '#ff9a85' : kind === 'pending' ? '#ffe49b' : '#b8f5c5';
    }

    updateContextActions(selection = this.editor.selectedObject) {
        const className = selection?.constructor?.name;
        const definition = className ? getGameObjectDefinition(className) : null;
        const canEditObject = Boolean(selection && !selection.isLevelSettings && definition?.editable);
        const canCloneObject = canEditObject && definition.capabilities.clone;

        if (this.deleteButton) {
            this.deleteButton.hidden = !canEditObject;
            this.deleteButton.setAttribute('aria-hidden', String(!canEditObject));
        }
        if (this.cloneButton) {
            this.cloneButton.hidden = !canCloneObject;
            this.cloneButton.setAttribute('aria-hidden', String(!canCloneObject));
        }
    }

    updatePublishAvailability() {
        if (!this.publishButton) return;
        const canPublish = Boolean(
            this.editor.game.communityLevelClient &&
            this.editor.game.completedRun
        );
        this.publishButton.disabled = !canPublish;
        this.publishButton.textContent = canPublish ? 'Publish' : '🔒 Publish';
        if (this.publishHint) this.publishHint.hidden = this.publishButton.hidden || canPublish;
        if (this.publishControl) this.publishControl.hidden = this.publishButton.hidden;
        this.publishButton.title = canPublish
            ? 'Publish this completed level'
            : 'Complete this level in Play Mode to enable publishing';
        this.publishButton.setAttribute('aria-label', this.publishButton.title);
    }

    createMobileToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'editor-mobile-toolbar';
        toolbar.classList.toggle('is-visible', isCompactEditorViewport());
        toolbar.append(
            button('Clear', '#f44336', () => this.editor.selectObject(null)),
            button('Add', '#2196F3', () => this.editor.showMobileAddMenu())
        );
        return toolbar;
    }

    populate(classNames) {
        this.addButtonContainer.replaceChildren();
        this.addButtons = {};
        for (const className of classNames) {
            const element = button(`Add ${className}`, '#2196F3', event => {
                event.stopPropagation();
                this.editor.addObject(className);
            });
            this.addButtons[className] = element;
            this.addButtonContainer.appendChild(element);
        }
        this.editor.addButtons = this.addButtons;
    }

    updateMode(mode) {
        const editing = mode === 'edit';
        this.modeButton.textContent = editing ? 'Switch to Play Mode' : 'Switch to Edit Mode';
        this.modeButton.style.background = editing ? '#4CAF50' : '#FF9800';
    }

    open() {
        this.section.style.display = 'flex';
        this.sectionDrag?.clampToViewport();
        this.toggleButton.textContent = 'Add Objects ▲';
    }

    close() {
        this.section.style.display = 'none';
        this.toggleButton.textContent = 'Add Objects ▼';
    }

    setMinimized(minimized) {
        this.minimized = minimized;
        for (const control of this.toolbarControls) {
            control.style.display = minimized ? 'none' : '';
        }
        this.status.style.display = minimized ? 'none' : '';
        if (minimized) this.close();
        this.minimizeButton.textContent = minimized ? '+' : '−';
        this.minimizeButton.title = minimized ? 'Restore editor toolbar' : 'Minimize editor toolbar';
        this.minimizeButton.setAttribute('aria-label', this.minimizeButton.title);
        this.toolbar.dataset.minimized = String(minimized);
        this.toolbar.style.minHeight = minimized ? '0' : '44px';

        if (minimized) this.toolbar.style.right = 'auto';
        else this.resize();
        this.toolbarDrag?.clampToViewport();
    }

    resize() {
        const compact = isCompactEditorViewport();
        if (this.toolbar.dataset.userPositioned) this.toolbarDrag?.clampToViewport();
        else if (this.minimized) this.toolbar.style.right = 'auto';
        else Object.assign(this.toolbar.style, compact
            ? { left: '10px', right: '10px' }
            : { left: '10px', right: '330px' });
        if (this.section.dataset.userPositioned) this.sectionDrag?.clampToViewport();
        else Object.assign(this.section.style, compact
            ? { right: '10px' }
            : { right: '330px' });
        this.mobileToolbar.classList.toggle('is-visible', compact);
        if (this.mobileToolbar.dataset.userPositioned) this.mobileToolbarDrag?.clampToViewport();
    }

    destroy() {
        this.unsubscribe.forEach(unsubscribe => unsubscribe());
        this.unsubscribe = [];
    }
}

export default LevelEditorToolbarView;
