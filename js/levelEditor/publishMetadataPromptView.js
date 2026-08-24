import { createButton } from '../buttonFramework.js';

export class PublishMetadataPromptView {
    constructor(editor) {
        this.editor = editor;
        this.promise = null;
        this.finish = null;
    }

    prompt() {
        if (this.promise) return this.promise;
        const editor = this.editor;
        const metadata = editor.game.levelMetadata || {};
        this.promise = new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'level-editor-publish-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'publish-level-title');
            const form = document.createElement('form');
            form.className = 'level-editor-publish-form';
            const title = document.createElement('h2');
            title.id = 'publish-level-title';
            title.textContent = 'PUBLISH LEVEL';
            title.className = 'level-editor-publish-title';
            const copy = document.createElement('p');
            copy.textContent = 'Confirm how this level will appear in Community Levels.';
            copy.className = 'level-editor-publish-copy';
            const makeLabel = (text, control) => {
                const label = document.createElement('label');
                label.textContent = text;
                label.className = 'level-editor-publish-label';
                control.classList.add('level-editor-publish-input');
                label.appendChild(control);
                return label;
            };
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.required = true;
            nameInput.maxLength = 80;
            nameInput.value = metadata.name || '';
            nameInput.autocomplete = 'off';
            const descriptionInput = document.createElement('textarea');
            descriptionInput.rows = 4;
            descriptionInput.maxLength = 500;
            descriptionInput.value = metadata.description || '';
            const error = document.createElement('p');
            error.setAttribute('role', 'alert');
            error.className = 'level-editor-publish-error';
            const actions = document.createElement('div');
            actions.className = 'level-editor-publish-actions';
            const background = [editor.toolbarWrapper, editor.propertiesPanel, editor.objectListPanel,
                editor.mobileToolbar, editor.gravitySculptPanel].filter(Boolean);
            for (const element of background) element.inert = true;
            this.finish = result => {
                for (const element of background) element.inert = false;
                overlay.remove();
                this.promise = null;
                this.finish = null;
                resolve(result);
            };
            const cancel = createButton('CANCEL', () => this.finish(null), {
                backgroundColor: '#4b3b32', hoverColor: '#6a5041', textColor: '#fff3bb',
                borderColor: '#f79433'
            });
            cancel.classList.add('level-editor-publish-button');
            const publish = createButton('PUBLISH', null, {
                backgroundColor: '#7b4bb7', hoverColor: '#9564d2', textColor: '#fff',
                borderColor: '#c6a1ef', type: 'submit'
            });
            publish.type = 'submit';
            publish.classList.add('level-editor-publish-button');
            actions.append(cancel, publish);
            form.append(title, copy, makeLabel('Level name', nameInput),
                makeLabel('Description', descriptionInput), error, actions);
            form.addEventListener('submit', event => {
                event.preventDefault();
                const name = nameInput.value.trim();
                if (!name) {
                    error.textContent = 'Enter a level name before publishing.';
                    nameInput.focus();
                    return;
                }
                this.finish({ name, description: descriptionInput.value.trim() });
            });
            overlay.addEventListener('keydown', event => {
                event.stopPropagation();
                if (event.code === 'Escape') {
                    event.preventDefault();
                    this.finish(null);
                }
            });
            overlay.appendChild(form);
            editor.container.appendChild(overlay);
            nameInput.focus();
            nameInput.select();
        });
        return this.promise;
    }

    cancel() {
        this.finish?.(null);
    }
}

export default PublishMetadataPromptView;
