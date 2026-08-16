import { isCompactEditorViewport } from '../config/inputConfig.js';
import { makeDraggablePanel } from './draggablePanel.js';
import { createButton } from '../buttonFramework.js';
import { getEditorObjectDefinition } from '../editorObjectRegistry.js';

function button(label, background, action) {
    const element = createButton(label, action, {
        backgroundColor: background,
        hoverColor: background,
        textColor: 'white',
        borderColor: 'rgba(255, 255, 255, .25)'
    });
    element.style.cssText += 'padding: 8px 12px; min-height: 44px; font-size: 14px; white-space: nowrap; flex-shrink: 0;';
    return element;
}

export class LevelEditorToolbarView {
    constructor(editor) {
        this.editor = editor;
        this.addButtons = {};
    }

    createElements() {
        this.wrapper = document.createElement('div');
        this.wrapper.style.cssText = 'position: relative; width: 100%;';
        this.toolbar = document.createElement('div');
        this.toolbar.style.cssText = `
            position: absolute; top: 10px; left: 10px; right: 330px;
            background: rgba(0, 0, 0, 0.8); padding: 10px; border-radius: 5px;
            color: white; font-family: Arial, sans-serif; pointer-events: auto;
            display: flex; flex-wrap: wrap; gap: 5px; align-items: center; min-height: 44px;
        `;
        this.modeButton = button('Switch to Play Mode', '#4CAF50', () => this.editor.toggleMode());
        this.toggleButton = button('Add Objects ▼', '#2196F3', event => {
            event.stopPropagation();
            this.section.style.display === 'none' ? this.open() : this.close();
        });
        this.deleteButton = button('Delete Selected', '#f44336', () => this.editor.deleteSelectedObject());
        this.cloneButton = button('Clone Selected', '#9C27B0', () => this.editor.cloneSelected());
        this.exportButton = button('Export Level', '#FF9800', () => this.editor.exportLevel());
        this.saveButton = button('Save', '#2e8b57', () => this.editor.saveLevel());
        this.loadButton = button('Load', '#3d74b8', () => this.editor.loadLevel());
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
        this.section.style.cssText = `
            position: absolute; top: 64px; left: 10px; right: 330px;
            background: rgba(0, 0, 0, 0.95); padding: 15px; border-radius: 8px;
            display: none; flex-wrap: wrap; gap: 8px; z-index: 1002;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.2);
            max-height: 300px; overflow-y: auto; pointer-events: auto;
        `;
        this.addButtonContainer = document.createElement('div');
        this.addButtonContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px; width: 100%;';
        this.section.appendChild(this.addButtonContainer);
        this.toolbarControls = [
            this.modeButton, this.toggleButton, this.deleteButton,
            this.cloneButton, this.sculptButton, this.exportButton,
            this.saveButton, this.loadButton, this.menuButton
        ];
        this.toolbar.append(...this.toolbarControls, this.minimizeButton);
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
            loadButton: this.loadButton,
            menuButton: this.menuButton,
            sculptButton: this.sculptButton,
            minimizeButton: this.minimizeButton,
            addButtons: this.addButtons
        };
    }

    updateContextActions(selection = this.editor.selectedObject) {
        const className = selection?.constructor?.name;
        const definition = className ? getEditorObjectDefinition(className) : null;
        const canEditObject = Boolean(selection && !selection.isLevelSettings && definition?.editable);
        const canCloneObject = canEditObject && !definition.singleton;

        if (this.deleteButton) {
            this.deleteButton.hidden = !canEditObject;
            this.deleteButton.setAttribute('aria-hidden', String(!canEditObject));
        }
        if (this.cloneButton) {
            this.cloneButton.hidden = !canCloneObject;
            this.cloneButton.setAttribute('aria-hidden', String(!canCloneObject));
        }
    }

    createMobileToolbar() {
        const toolbar = document.createElement('div');
        toolbar.style.cssText = `
            position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9); padding: 8px; border-radius: 25px;
            display: ${isCompactEditorViewport() ? 'flex' : 'none'}; gap: 8px;
            align-items: center; pointer-events: auto; z-index: 1001;
        `;
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
        this.mobileToolbar.style.display = compact ? 'flex' : 'none';
        if (this.mobileToolbar.dataset.userPositioned) this.mobileToolbarDrag?.clampToViewport();
    }
}

export default LevelEditorToolbarView;
