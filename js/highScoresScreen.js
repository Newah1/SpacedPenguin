import { UIScreen } from './uiManager.js';
import { createButton } from './buttonFramework.js';
import Utils from './utils.js';

const STYLE_ID = 'spaced-penguin-high-scores-style';

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .high-scores-overlay { position:absolute; inset:0; z-index:320; display:grid; place-items:center;
            padding:18px; background:rgba(0,0,0,.88); color:#fff3bb; pointer-events:auto; }
        .high-scores-panel { width:min(660px,94%); max-height:92%; overflow:auto; padding:24px;
            border:6px solid #f79433; border-radius:18px; background:#17130f;
            box-shadow:0 20px 70px #000; font-family:Arial,sans-serif; }
        .high-scores-panel h2 { margin:0 0 8px; color:#f79433; font-size:32px; text-align:center; }
        .high-scores-summary { margin:0 0 18px; text-align:center; line-height:1.5; }
        .high-score-form { display:grid; grid-template-columns:1fr 120px; gap:14px; margin:20px auto;
            max-width:500px; }
        .high-score-form label { display:grid; gap:6px; color:#ffd98c; font-weight:700; }
        .high-score-form input { min-width:0; padding:10px 12px; border:2px solid #f79433;
            border-radius:7px; background:#fff8dc; color:#211b18; font:700 17px Arial,sans-serif;
            text-transform:uppercase; user-select:text; }
        .high-score-error { min-height:20px; color:#ff8b74; text-align:center; font-weight:700; }
        .high-score-tabs,.high-score-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin:16px 0; }
        .high-score-tabs button,.high-score-actions button { min-width:125px; padding:10px 15px; border-radius:20px;
            font-weight:900; letter-spacing:.04em; }
        .high-score-tabs button[aria-pressed="true"] { --button-bg:#f79433; --button-fg:#211b18; }
        .high-score-list { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
        .high-score-list th,.high-score-list td { padding:8px 10px; border-bottom:1px solid rgba(247,148,51,.28); }
        .high-score-list th { color:#f79433; text-align:left; }
        .high-score-list .score { text-align:right; }
        .high-score-empty { padding:34px 0; color:#cdbd9a; text-align:center; }
        @media (max-width:600px) { .high-scores-panel { padding:17px; } .high-score-form { grid-template-columns:1fr; }
            .high-scores-panel h2 { font-size:26px; } }
    `;
    document.head.appendChild(style);
}

export class HighScoresScreen extends UIScreen {
    constructor(uiManager, game, options = {}) {
        super(uiManager);
        this.game = game;
        this.options = options;
        this.view = 'allTime';
        this.requiresEntry = Boolean(options.requiresEntry);
        ensureStyles();
        this.build();
    }

    build() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'high-scores-overlay';
        this.overlay.setAttribute('role', 'dialog');
        this.overlay.setAttribute('aria-modal', 'true');
        this.panel = document.createElement('section');
        this.panel.className = 'high-scores-panel';
        this.overlay.appendChild(this.panel);
        this.uiManager.canvas.parentElement.appendChild(this.overlay);
        this.renderContent();
    }

    renderContent() {
        this.panel.replaceChildren();
        const title = document.createElement('h2');
        title.textContent = this.requiresEntry ? 'A NEW HIGH SCORE!' : 'HIGH SCORES';
        this.panel.appendChild(title);

        if (this.requiresEntry) {
            this.renderEntryForm();
            return;
        }

        const summary = document.createElement('p');
        summary.className = 'high-scores-summary';
        summary.textContent = this.options.gameEnd
            ? `Final Score: ${Utils.formatScore(this.game.score)}   •   Your High Score: ${Utils.formatScore(this.game.highScore)}`
            : `Your High Score: ${Utils.formatScore(this.game.highScore)}`;
        this.panel.appendChild(summary);
        this.renderLeaderboard();
        this.renderActions();
    }

    renderEntryForm() {
        const intro = document.createElement('p');
        intro.className = 'high-scores-summary';
        intro.textContent = `Your score of ${Utils.formatScore(this.game.score)} made the top ten. Enter your name and two-letter state, province, or country abbreviation.`;
        this.panel.appendChild(intro);

        const form = document.createElement('form');
        form.className = 'high-score-form';
        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'First name';
        this.nameInput = document.createElement('input');
        this.nameInput.name = 'name';
        this.nameInput.maxLength = 20;
        this.nameInput.autocomplete = 'given-name';
        nameLabel.appendChild(this.nameInput);
        const regionLabel = document.createElement('label');
        regionLabel.textContent = 'Region';
        this.regionInput = document.createElement('input');
        this.regionInput.name = 'region';
        this.regionInput.maxLength = 2;
        this.regionInput.autocomplete = 'address-level1';
        regionLabel.appendChild(this.regionInput);
        form.append(nameLabel, regionLabel);
        this.panel.appendChild(form);

        this.error = document.createElement('div');
        this.error.className = 'high-score-error';
        this.error.setAttribute('role', 'alert');
        this.panel.appendChild(this.error);
        const actions = document.createElement('div');
        actions.className = 'high-score-actions';
        actions.appendChild(createButton('SAVE SCORE', () => this.submitEntry(), {
            backgroundColor: '#fff3bb', hoverColor: '#fff9d7', textColor: '#c95616', borderColor: '#f79433'
        }));
        this.panel.appendChild(actions);
        form.addEventListener('submit', event => {
            event.preventDefault();
            this.submitEntry();
        });
        queueMicrotask(() => this.nameInput?.focus());
    }

    submitEntry() {
        const name = this.nameInput.value.trim();
        const region = this.regionInput.value.trim().toUpperCase();
        if (!/^[A-Za-z]+$/.test(name)) {
            this.error.textContent = name
                ? 'Your first name must contain letters only and no spaces.'
                : 'Please enter your first name.';
            this.nameInput.focus();
            return;
        }
        if (!/^[A-Za-z]{2}$/.test(region)) {
            this.error.textContent = 'Please enter an exact two-letter region abbreviation.';
            this.regionInput.focus();
            return;
        }
        this.game.recordHighScore(name, region);
        this.requiresEntry = false;
        this.renderContent();
    }

    renderLeaderboard() {
        const tabs = document.createElement('div');
        tabs.className = 'high-score-tabs';
        const addTab = (label, view) => {
            const button = createButton(label, () => {
                this.view = view;
                this.renderContent();
            }, { backgroundColor: '#4b3b32', hoverColor: '#6a5041', textColor: '#fff3bb', borderColor: '#f79433' });
            button.setAttribute('aria-pressed', String(this.view === view));
            tabs.appendChild(button);
        };
        addTab('ALL TIME', 'allTime');
        addTab('TODAY', 'today');
        this.panel.appendChild(tabs);

        const entries = this.view === 'today'
            ? this.game.highScoreStore.getToday()
            : this.game.highScoreStore.getAllTime();
        if (!entries.length) {
            const empty = document.createElement('div');
            empty.className = 'high-score-empty';
            empty.textContent = 'No scores saved yet. Launch Kevin and claim the first spot!';
            this.panel.appendChild(empty);
            return;
        }
        const table = document.createElement('table');
        table.className = 'high-score-list';
        table.innerHTML = '<thead><tr><th>#</th><th>Player</th><th>Region</th><th class="score">Score</th></tr></thead>';
        const body = document.createElement('tbody');
        entries.forEach((entry, index) => {
            const row = document.createElement('tr');
            [index + 1, entry.name, entry.region, Utils.formatScore(entry.score)].forEach((value, cellIndex) => {
                const cell = document.createElement('td');
                cell.textContent = value;
                if (cellIndex === 3) cell.className = 'score';
                row.appendChild(cell);
            });
            body.appendChild(row);
        });
        table.appendChild(body);
        this.panel.appendChild(table);
    }

    renderActions() {
        const actions = document.createElement('div');
        actions.className = 'high-score-actions';
        if (this.options.gameEnd) {
            actions.appendChild(createButton('PLAY AGAIN', () => {
                this.close();
                this.game.startGame();
            }, { backgroundColor: '#fff3bb', hoverColor: '#fff9d7', textColor: '#c95616', borderColor: '#f79433' }));
            actions.appendChild(createButton('MAIN MENU', () => {
                this.close();
                this.game.returnToMenu();
            }, { backgroundColor: '#4b3b32', hoverColor: '#6a5041', textColor: '#fff3bb', borderColor: '#f79433' }));
        } else {
            actions.appendChild(createButton('BACK', () => this.close(), {
                backgroundColor: '#fff3bb', hoverColor: '#fff9d7', textColor: '#c95616', borderColor: '#f79433'
            }));
        }
        this.panel.appendChild(actions);
    }

    handleClick() {
        return true;
    }

    handleKeyPress(event) {
        if (event.target?.matches?.('input, textarea, select')) {
            return event.code === 'Escape';
        }
        if (event.code === 'Escape' && !this.requiresEntry) {
            this.close();
        }
        return true;
    }

    destroy() {
        this.overlay?.remove();
    }
}
