import { isCompactEditorViewport } from '../../config/inputConfig.js';
import { makeDraggablePanel } from './draggablePanel.js';
import { createButton } from '../../ui/buttonFramework.js';
import { getGameObjectDefinition } from '../../runtime/gameObjectRegistry.js';
import { EditorEventType } from '../state/editorEvents.js';

function button(label, tone, action, accessibleLabel = label) {
    const element = createButton(label, action, {
        textColor: '#fff6d6'
    });
    element.classList.add('editor-toolbar-button');
    element.dataset.toolbarTone = tone;
    element.setAttribute('aria-label', accessibleLabel);
    return element;
}

function group(...controls) {
    const element = document.createElement('div');
    element.className = 'editor-toolbar-group';
    element.append(...controls);
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
        this.modeBadge = document.createElement('span');
        this.modeBadge.className = 'editor-mode-badge';
        this.modeBadge.textContent = 'EDIT';
        this.modeBadge.title = 'Drag toolbar';
        this.modeButton = button('▶ Play-test', 'primary', () => this.editor.toggleMode(), 'Switch to Play Mode');
        this.toggleButton = button('+ Object ▼', 'accent', event => {
            event.stopPropagation();
            this.section.style.display === 'none' ? this.open() : this.close();
        }, 'Add Objects');
        this.deleteButton = button('Delete', 'danger', () => this.editor.deleteSelectedObject(), 'Delete Selected');
        this.cloneButton = button('Clone', 'neutral', () => this.editor.cloneSelected(), 'Clone Selected');
        this.exportButton = button('Export', 'neutral', () => this.editor.exportLevel(), 'Export Level');
        this.saveButton = button('Save', 'success', () => this.editor.saveLevel());
        this.publishButton = button('Publish', 'primary', () => this.editor.publishLevel());
        this.publishButton.hidden = !this.editor.game.communityLevelClient;
        this.updatePublishAvailability();
        this.loadButton = button('Open', 'neutral', () => this.editor.loadLevel(), 'Open Level…');
        this.menuButton = button('Exit', 'quiet', () => this.editor.exitToMenu(), 'Main Menu');
        this.sculptButton = button('✦ Sculpt', 'accent', () => this.editor.gravitySculptController.toggle(), 'Gravity Sculpt');
        this.minimizeButton = button('−', 'quiet', event => {
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
        this.contextGroup = group(this.cloneButton, this.deleteButton);
        this.toolbarControls = [
            group(this.modeBadge, this.modeButton, this.toggleButton),
            this.contextGroup,
            group(this.sculptButton),
            group(this.saveButton, this.loadButton, this.exportButton, this.publishButton),
            group(this.menuButton)
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
        if (this.contextGroup) this.contextGroup.hidden = !canEditObject;
    }

    updatePublishAvailability() {
        if (!this.publishButton) return;
        const canPublish = Boolean(
            this.editor.game.communityLevelClient &&
            this.editor.game.completedRun
        );
        this.publishButton.disabled = !canPublish;
        this.publishButton.textContent = canPublish ? 'Publish' : '🔒 Publish';
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
            button('Clear', 'danger', () => this.editor.selectObject(null)),
            button('+ Object', 'accent', () => this.editor.showMobileAddMenu(), 'Add')
        );
        return toolbar;
    }

    populate(classNames) {
        this.addButtonContainer.replaceChildren();
        this.addButtons = {};
        for (const className of classNames) {
            const element = button(`Add ${className}`, 'accent', event => {
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
        this.modeBadge.textContent = editing ? 'EDIT' : 'PLAY-TEST';
        this.modeBadge.dataset.mode = editing ? 'edit' : 'play';
        this.modeButton.textContent = editing ? '▶ Play-test' : '✎ Edit';
        this.modeButton.setAttribute('aria-label', editing ? 'Switch to Play Mode' : 'Switch to Edit Mode');
        this.modeButton.dataset.toolbarTone = editing ? 'primary' : 'accent';
    }

    open() {
        this.section.style.display = 'flex';
        this.sectionDrag?.clampToViewport();
        this.toggleButton.textContent = '+ Object ▲';
    }

    close() {
        this.section.style.display = 'none';
        this.toggleButton.textContent = '+ Object ▼';
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
