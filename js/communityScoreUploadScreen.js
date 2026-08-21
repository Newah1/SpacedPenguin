import { UIScreen } from './uiManager.js';
import { createButton } from './buttonFramework.js';
import { createCommunityLeaderboard } from './communityLeaderboardView.js';
import Utils from './utils.js';

const STYLE_ID = 'spaced-penguin-score-upload-style';

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .score-upload-overlay { position:absolute; inset:0; z-index:340; display:grid; place-items:center;
            padding:18px; background:rgba(0,0,0,.82); color:#fff3bb; pointer-events:auto; }
        .score-upload-panel { width:min(480px,94%); max-height:90%; overflow:auto; padding:24px; border:5px solid #cb7928;
            border-radius:14px; background:#211b18; box-shadow:0 20px 70px #000;
            font-family:Arial,sans-serif; text-align:center; }
        .score-upload-panel h2 { margin:0 0 10px; color:#f5e4aa; font-size:27px; }
        .score-upload-summary { margin:0 0 18px; color:#fff6d6; line-height:1.45; }
        .score-upload-form label { display:grid; gap:7px; max-width:190px; margin:0 auto 12px;
            color:#ffd98c; font-weight:800; text-align:left; }
        .score-upload-form input { width:100%; padding:10px 12px; border:2px solid #cb7928;
            border-radius:7px; background:#fff8dc; color:#211b18; font:900 20px Arial,sans-serif;
            letter-spacing:.18em; text-align:center; text-transform:uppercase; user-select:text; }
        .score-upload-status { min-height:22px; margin:8px 0; color:#ff9a85; font-weight:700; }
        .score-upload-status[data-kind="success"] { color:#8ee68e; }
        .score-upload-actions { display:flex; justify-content:center; gap:12px; margin-top:14px; }
        .score-upload-actions button { min-width:130px; padding:10px 16px; border-radius:20px;
            font-weight:900; letter-spacing:.04em; }
    `;
    document.head.appendChild(style);
}

export class CommunityScoreUploadScreen extends UIScreen {
    constructor(uiManager, game, options = {}) {
        super(uiManager);
        this.game = game;
        this.options = options;
        ensureStyles();
        this.build();
    }

    build() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'score-upload-overlay';
        this.overlay.setAttribute('role', 'dialog');
        this.overlay.setAttribute('aria-modal', 'true');
        this.overlay.setAttribute('aria-labelledby', 'score-upload-title');

        const panel = document.createElement('section');
        panel.className = 'score-upload-panel';
        const title = document.createElement('h2');
        title.id = 'score-upload-title';
        title.textContent = 'UPLOAD SCORE';
        const summary = document.createElement('p');
        summary.className = 'score-upload-summary';
        summary.textContent = `Submit ${Utils.formatScore(this.game.currentCommunityScore().score)} to this level’s leaderboard.`;

        this.form = document.createElement('form');
        this.form.className = 'score-upload-form';
        const label = document.createElement('label');
        label.textContent = 'Three initials';
        this.initialsInput = document.createElement('input');
        this.initialsInput.name = 'initials';
        this.initialsInput.maxLength = 3;
        this.initialsInput.autocomplete = 'off';
        this.initialsInput.inputMode = 'text';
        this.initialsInput.value = this.game.getCommunityScoreInitials?.() || '';
        label.appendChild(this.initialsInput);
        this.status = document.createElement('div');
        this.status.className = 'score-upload-status';
        this.status.setAttribute('role', 'status');
        this.status.setAttribute('aria-live', 'polite');

        const actions = document.createElement('div');
        actions.className = 'score-upload-actions';
        this.uploadButton = createButton('UPLOAD', () => this.submit(), {
            backgroundColor: '#5f3d91', hoverColor: '#7950b5', textColor: '#fff', borderColor: '#e9c27a'
        });
        this.closeButton = createButton('CANCEL', () => this.close(), {
            backgroundColor: '#4b3b32', hoverColor: '#6a5041', textColor: '#fff3bb', borderColor: '#e9c27a'
        });
        actions.append(this.uploadButton, this.closeButton);
        this.form.append(label, this.status, actions);
        this.form.addEventListener('submit', event => {
            event.preventDefault();
            this.submit();
        });
        this.leaderboardHost = document.createElement('div');
        panel.append(title, summary, this.form, this.leaderboardHost);
        this.overlay.appendChild(panel);
        this.uiManager.canvas.parentElement.appendChild(this.overlay);
        this.refreshLeaderboard();
        queueMicrotask(() => this.initialsInput?.focus());
    }

    renderLeaderboard(scores = [], options = {}) {
        this.leaderboardHost?.replaceChildren(createCommunityLeaderboard(scores, options));
    }

    async refreshLeaderboard() {
        const reference = this.game.levelMetadata?.catalogReference;
        const client = this.game.communityLevelClient;
        if (!client || reference?.source !== 'community' || !reference.id) {
            this.renderLeaderboard([]);
            return [];
        }

        this.leaderboardAbort?.abort();
        const controller = new AbortController();
        this.leaderboardAbort = controller;
        this.renderLeaderboard([], { loading: true });
        try {
            const response = await client.getScores(reference.id, {
                limit: 10,
                signal: controller.signal
            });
            if (controller !== this.leaderboardAbort) return [];
            const scores = response?.items || [];
            this.renderLeaderboard(scores);
            return scores;
        } catch (error) {
            if (error?.name === 'AbortError' || controller !== this.leaderboardAbort) return [];
            this.renderLeaderboard([], { error: 'High scores are unavailable right now.' });
            return [];
        }
    }

    async submit() {
        if (this.uploadButton.disabled) return;
        const initials = this.initialsInput.value.trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(initials)) {
            this.status.dataset.kind = 'error';
            this.status.textContent = 'Enter exactly three letters.';
            this.initialsInput.focus();
            return;
        }

        this.uploadButton.disabled = true;
        this.initialsInput.disabled = true;
        this.status.dataset.kind = '';
        this.status.textContent = 'Uploading…';
        try {
            const response = this.game.pendingCommunityScoreSubmission
                ? await this.game.submitPendingCommunityScore()
                : await this.game.offerCommunityScoreUpload(initials);
            const score = response?.result?.score ?? this.game.currentCommunityScore().score;
            const rank = response?.rank ? ` Rank #${response.rank}.` : '';
            this.status.dataset.kind = 'success';
            this.status.textContent = `Score ${Utils.formatScore(score)} uploaded.${rank}`;
            this.uploadButton.hidden = true;
            this.closeButton.textContent = 'DONE';
            await this.refreshLeaderboard();
            this.options.onUploaded?.(response);
        } catch (error) {
            this.status.dataset.kind = 'error';
            this.status.textContent = `${error.message || 'Upload failed.'} Try again when ready.`;
            this.uploadButton.textContent = 'RETRY';
            this.uploadButton.disabled = false;
            this.initialsInput.disabled = Boolean(this.game.pendingCommunityScoreSubmission);
        }
    }

    handleClick() { return true; }

    handleKeyPress(event) {
        const isTextInput = event.target?.matches?.('input, textarea, select');
        if (event.code === 'Escape') {
            this.close();
            return true;
        }
        // Let the browser deliver typing and Enter to the native form control.
        // Returning true here makes the global keyboard handler preventDefault().
        if (isTextInput) return false;
        return true;
    }

    destroy() {
        this.leaderboardAbort?.abort();
        this.overlay?.remove();
    }
}
