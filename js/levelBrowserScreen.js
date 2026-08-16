import { UIScreen } from './uiManager.js';
import { createButton } from './buttonFramework.js';

const STYLE_ID = 'spaced-penguin-level-browser-style';

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .level-browser-overlay { position:absolute; inset:0; z-index:330; overflow:auto; padding:24px; background:rgba(0,0,0,.9); color:#fff6d6; pointer-events:auto; touch-action:manipulation; }
        .level-browser-panel { width:min(920px,100%); margin:auto; padding:24px; border:4px solid #cb7928; border-radius:14px; background:#211b18; box-shadow:0 18px 60px rgba(0,0,0,.7); }
        .level-browser-panel h2 { margin:0 0 18px; color:#f5e4aa; text-align:center; letter-spacing:.12em; }
        .level-browser-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:16px; }
        .level-card { display:grid; gap:8px; padding:10px; border:2px solid #6d4a35; border-radius:10px; background:#33251f; color:inherit; text-align:left; }
        .level-card img { width:100%; aspect-ratio:3/2; object-fit:cover; background:#050b1d; border-radius:6px; }
        .level-card strong { color:#ffd98c; font-size:18px; }
        .level-card small { min-height:2.5em; color:#d3c5a9; }
        .level-card-actions { display:flex; gap:8px; justify-content:flex-end; }
        .level-card-actions button { flex:1; padding:8px 6px; }
        .level-browser-empty { padding:34px; text-align:center; color:#d3c5a9; }
        .level-browser-actions { display:flex; justify-content:center; margin-top:20px; }
    `;
    document.head.appendChild(style);
}

export class LevelBrowserScreen extends UIScreen {
    constructor(uiManager, game) {
        super(uiManager);
        this.game = game;
        ensureStyles();
        this.overlay = document.createElement('div');
        this.overlay.className = 'level-browser-overlay';
        this.overlay.setAttribute('role', 'dialog');
        this.overlay.setAttribute('aria-modal', 'true');
        this.panel = document.createElement('section');
        this.panel.className = 'level-browser-panel';
        this.overlay.appendChild(this.panel);
        uiManager.canvas.parentElement.appendChild(this.overlay);
        this.renderContent();
    }

    renderContent() {
        this.panel.replaceChildren();
        const title = document.createElement('h2');
        title.textContent = 'LEVEL BROWSER';
        this.panel.appendChild(title);
        const records = this.game.levelSaveService.list();
        if (!records.length) {
            const empty = document.createElement('div');
            empty.className = 'level-browser-empty';
            empty.textContent = 'No saved levels yet. Create one in the Level Editor.';
            this.panel.appendChild(empty);
        } else {
            const grid = document.createElement('div');
            grid.className = 'level-browser-grid';
            records.forEach(record => {
                const card = document.createElement('article');
                card.className = 'level-card';
                const image = document.createElement('img');
                image.alt = `${record.name} thumbnail`;
                if (record.thumbnail) image.src = record.thumbnail;
                const name = document.createElement('strong');
                name.textContent = record.name;
                const description = document.createElement('small');
                description.textContent = record.description || 'No description';
                const actions = document.createElement('div');
                actions.className = 'level-card-actions';
                actions.append(createButton('PLAY', () => this.play(record), {
                    backgroundColor:'#2e8b57', hoverColor:'#3ca86b', textColor:'#fff', borderColor:'#73d49a'
                }));
                if (this.game.levelSaveService.canEdit(record)) {
                    actions.appendChild(createButton('EDIT', () => this.edit(record), {
                        backgroundColor:'#3d74b8', hoverColor:'#568fd2', textColor:'#fff', borderColor:'#8db8ee'
                    }));
                }
                card.append(image, name, description, actions);
                grid.appendChild(card);
            });
            this.panel.appendChild(grid);
        }
        const actions = document.createElement('div');
        actions.className = 'level-browser-actions';
        actions.appendChild(createButton('BACK', () => this.close(), {
            backgroundColor:'#4b3b32', hoverColor:'#6a5041', textColor:'#fff3bb', borderColor:'#f79433'
        }));
        this.panel.appendChild(actions);
    }

    play(record) {
        this.close();
        this.game.loadSavedLevel(record);
    }

    edit(record) {
        this.close();
        this.game.loadSavedLevel(record, { edit: true });
    }

    handleClick() { return true; }
    handleKeyPress(event) {
        if (event.code === 'Escape') this.close();
        return true;
    }
    destroy() { this.overlay?.remove(); }
}
