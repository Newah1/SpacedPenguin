import { UIScreen } from './uiManager.js';
import { createButton } from './buttonFramework.js';
import { createCommunityLeaderboard } from './communityLeaderboardView.js';
import { createLevelThumbnail } from './levelThumbnailRenderer.js';

const STYLE_ID = 'spaced-penguin-level-browser-style';
const SEARCH_DELAY_MS = 250;
let nextBrowserId = 1;

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .level-browser-overlay { position:absolute; inset:0; z-index:330; box-sizing:border-box; overflow:auto; padding:24px; background:rgba(0,0,0,.9); color:#fff6d6; pointer-events:auto; touch-action:manipulation; }
        .level-browser-panel { position:relative; box-sizing:border-box; width:min(920px,100%); min-height:100%; margin:auto; padding:24px; border:4px solid #cb7928; border-radius:14px; background:#211b18; box-shadow:0 18px 60px rgba(0,0,0,.7); }
        .level-browser-panel h2 { margin:0 0 18px; color:#f5e4aa; text-align:center; letter-spacing:.12em; }
        .level-browser-toolbar { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; margin-bottom:14px; }
        .level-browser-toolbar input { box-sizing:border-box; min-width:0; padding:10px; border:2px solid #8b684b; border-radius:6px; background:#130f0d; color:#fff6d6; font:inherit; }
        .level-browser-toolbar input:focus-visible { outline:3px solid #fff; outline-offset:2px; }
        .level-browser-sources { display:flex; grid-column:1 / -1; justify-content:center; gap:6px; padding:4px; border:1px solid #6d4a35; border-radius:10px; background:#130f0d; }
        .level-browser-source-tab { flex:1 1 0; max-width:220px; padding:9px 14px; border:2px solid transparent; border-radius:7px; background:transparent; color:#d3c5a9; font:inherit; font-weight:700; cursor:pointer; }
        .level-browser-source-tab[aria-selected="true"] { border-color:#f79433; background:#5b351f; color:#fff6d6; }
        .level-browser-source-tab:focus-visible { outline:3px solid #fff; outline-offset:2px; }
        .level-browser-status { min-height:1.5em; margin:0 0 12px; color:#d3c5a9; }
        .level-browser-status.is-error { color:#ffad9f; }
        .level-browser-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:16px; }
        .level-card { display:grid; align-content:start; gap:8px; padding:10px; border:2px solid #6d4a35; border-radius:10px; background:#33251f; color:inherit; text-align:left; }
        .level-card img { width:100%; aspect-ratio:3/2; object-fit:cover; background:#050b1d; border-radius:6px; }
        .level-card strong { color:#ffd98c; font-size:18px; }
        .level-card small { min-height:2.5em; color:#d3c5a9; display:-webkit-box; overflow:hidden; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
        .level-card-actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; }
        .level-card-actions button { flex:1 1 64px; padding:8px 6px; }
        .level-browser-empty { padding:34px; text-align:center; color:#d3c5a9; }
        .level-browser-empty button { margin-top:16px; }
        .level-browser-pagination, .level-browser-actions { display:flex; justify-content:center; gap:10px; margin-top:20px; }
        .level-browser-pagination button, .level-browser-actions button, .level-browser-toolbar button { padding:10px 18px; }
        .level-browser-details { margin:0 0 18px; padding:18px; border:2px solid #8b684b; border-radius:10px; background:#2b211c; }
        .level-browser-details[hidden] { display:none; }
        .level-browser-details h3 { margin:0 0 8px; color:#ffd98c; }
        .level-browser-details p { white-space:pre-wrap; color:#e4d8bd; }
        .level-browser-details-meta { display:flex; flex-wrap:wrap; gap:8px 18px; margin:12px 0; color:#cbbda2; }
        .level-browser-confirmation { position:absolute; inset:0; z-index:2; display:grid; place-items:center; padding:24px; background:rgba(0,0,0,.78); }
        .level-browser-confirmation-card { width:min(520px,100%); padding:22px; border:3px solid #f79433; border-radius:12px; background:#2b211c; box-shadow:0 18px 60px #000; }
        .level-browser-confirmation-card h3 { margin-top:0; color:#ffd98c; }
        .level-browser-confirmation-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:10px; margin-top:20px; }
        .level-browser-sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
        @media (max-width:600px) { .level-browser-overlay { padding:8px; } .level-browser-panel { padding:14px; } .level-browser-source-tab { padding-inline:7px; font-size:13px; } }
    `;
    document.head.appendChild(style);
}

function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

function actionColors(kind) {
    if (kind === 'play') {
        return { backgroundColor:'#2e8b57', hoverColor:'#3ca86b', textColor:'#fff', borderColor:'#73d49a' };
    }
    if (kind === 'edit') {
        return { backgroundColor:'#3d74b8', hoverColor:'#568fd2', textColor:'#fff', borderColor:'#8db8ee' };
    }
    return { backgroundColor:'#4b3b32', hoverColor:'#6a5041', textColor:'#fff3bb', borderColor:'#f79433' };
}

export class LevelBrowserScreen extends UIScreen {
    constructor(uiManager, game, options = {}) {
        super(uiManager);
        this.game = game;
        this.catalog = game.levelCatalogService;
        this.mode = options.mode === 'open' ? 'open' : 'browse';
        this.initialSource = options.initialSource || null;
        this.items = [];
        this.nextCursor = null;
        this.total = null;
        this.queryVersion = 0;
        this.detailsVersion = 0;
        this.loading = false;
        this.searchTimer = null;
        this.previousFocus = document.activeElement;
        this.browserId = nextBrowserId++;
        this.thumbnailCache = new Map();
        this.inertEditor = Boolean(game.levelEditor?.active && game.levelEditor.container);
        if (this.inertEditor) game.levelEditor.container.inert = true;
        ensureStyles();
        this.build();
        this.loadFirstPage();
    }

    build() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'level-browser-overlay';
        this.overlay.setAttribute('role', 'dialog');
        this.overlay.setAttribute('aria-modal', 'true');
        this.overlay.setAttribute('aria-labelledby', `level-browser-title-${this.browserId}`);

        this.panel = document.createElement('section');
        this.panel.className = 'level-browser-panel';
        const title = document.createElement('h2');
        title.id = `level-browser-title-${this.browserId}`;
        title.textContent = this.mode === 'open' ? 'OPEN LEVEL' : 'BROWSE LEVELS';

        this.toolbar = document.createElement('form');
        this.toolbar.className = 'level-browser-toolbar';
        const searchLabel = document.createElement('label');
        searchLabel.className = 'level-browser-sr-only';
        searchLabel.htmlFor = `level-browser-search-${this.browserId}`;
        searchLabel.textContent = 'Search levels';
        this.searchInput = document.createElement('input');
        this.searchInput.id = searchLabel.htmlFor;
        this.searchInput.type = 'search';
        this.searchInput.placeholder = 'Search this source';
        this.searchInput.autocomplete = 'off';
        const searchButton = createButton('SEARCH', () => {}, actionColors('neutral'));
        searchButton.type = 'submit';

        const sources = this.catalog?.getSources?.() || [];
        this.sourceTabs = document.createElement('div');
        this.sourceTabs.className = 'level-browser-sources';
        this.sourceTabs.setAttribute('role', 'tablist');
        this.sourceTabs.setAttribute('aria-label', 'Level source');
        this.sourceButtons = new Map();
        const rememberedSource = this.game.levelBrowserSources?.[this.mode];
        const preferredSource = this.initialSource || rememberedSource ||
            (this.mode === 'open' ? 'local' : this.catalog?.defaultSource);
        this.selectedSourceId = sources.some(source => source.id === preferredSource)
            ? preferredSource
            : sources[0]?.id;
        for (const source of sources) {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'level-browser-source-tab';
            tab.dataset.source = source.id;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', String(source.id === this.selectedSourceId));
            tab.tabIndex = source.id === this.selectedSourceId ? 0 : -1;
            tab.textContent = source.label;
            tab.addEventListener('click', () => this.selectSource(source.id));
            tab.addEventListener('keydown', event => this.handleSourceKey(event, source.id));
            this.sourceButtons.set(source.id, tab);
            this.sourceTabs.appendChild(tab);
        }
        this.sourceTabs.hidden = sources.length <= 1;
        this.toolbar.append(this.sourceTabs, searchLabel, this.searchInput, searchButton);

        this.status = document.createElement('p');
        this.status.className = 'level-browser-status';
        this.status.setAttribute('role', 'status');
        this.status.setAttribute('aria-live', 'polite');

        this.details = document.createElement('section');
        this.details.className = 'level-browser-details';
        this.details.hidden = true;

        this.grid = document.createElement('div');
        this.grid.className = 'level-browser-grid';
        this.grid.setAttribute('aria-label', 'Level results');

        this.pagination = document.createElement('div');
        this.pagination.className = 'level-browser-pagination';
        this.loadMoreButton = createButton('LOAD MORE', () => {
            if (this.queryFailed) this.loadFirstPage();
            else this.loadNextPage();
        }, actionColors('neutral'));
        this.loadMoreButton.hidden = true;
        this.pagination.appendChild(this.loadMoreButton);

        const actions = document.createElement('div');
        actions.className = 'level-browser-actions';
        actions.appendChild(createButton('BACK', () => this.close(), actionColors('neutral')));

        this.panel.append(title, this.toolbar, this.status, this.details, this.grid, this.pagination, actions);
        this.overlay.appendChild(this.panel);
        this.uiManager.canvas.parentElement.appendChild(this.overlay);

        this.toolbar.addEventListener('submit', event => {
            event.preventDefault();
            this.cancelSearchTimer();
            this.loadFirstPage();
        });
        this.searchInput.addEventListener('input', () => {
            this.cancelSearchTimer();
            this.searchTimer = setTimeout(() => this.loadFirstPage(), SEARCH_DELAY_MS);
        });
        this.overlay.addEventListener('keydown', event => {
            event.stopPropagation();
            if (this.confirmationElement) {
                if (event.code === 'Escape') {
                    event.preventDefault();
                    this.resolveReplacementPrompt?.('cancel');
                }
                return;
            }
            if (event.code === 'Tab') {
                const focusable = [...this.overlay.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')]
                    .filter(element => !element.hidden && element.getClientRects().length > 0);
                if (focusable.length) {
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault();
                        last.focus();
                    } else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault();
                        first.focus();
                    }
                }
                return;
            }
            if (event.code !== 'Escape') return;
            event.preventDefault();
            if (!this.details.hidden) this.closeDetails();
            else this.close();
        });
        this.searchInput.focus();
    }

    cancelSearchTimer() {
        if (this.searchTimer !== null) clearTimeout(this.searchTimer);
        this.searchTimer = null;
    }

    selectedSource() {
        return this.selectedSourceId || this.catalog?.defaultSource;
    }

    selectSource(sourceId) {
        if (!this.sourceButtons.has(sourceId) || sourceId === this.selectedSourceId) return;
        this.selectedSourceId = sourceId;
        for (const [id, button] of this.sourceButtons) {
            button.setAttribute('aria-selected', String(id === sourceId));
            button.tabIndex = id === sourceId ? 0 : -1;
        }
        this.game.levelBrowserSources = { ...(this.game.levelBrowserSources || {}), [this.mode]: sourceId };
        this.loadFirstPage();
    }

    handleSourceKey(event, sourceId) {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.code)) return;
        event.preventDefault();
        const ids = [...this.sourceButtons.keys()];
        const index = ids.indexOf(sourceId);
        const direction = event.code === 'ArrowRight' ? 1 : -1;
        const nextId = ids[(index + direction + ids.length) % ids.length];
        this.selectSource(nextId);
        this.sourceButtons.get(nextId)?.focus();
    }

    sourceLabel() {
        return this.catalog?.getSources?.().find(source => source.id === this.selectedSource())?.label || 'Levels';
    }

    setStatus(message, { error = false } = {}) {
        this.status.textContent = message;
        this.status.classList.toggle('is-error', error);
    }

    async loadFirstPage() {
        this.queryAbort?.abort();
        const version = ++this.queryVersion;
        this.queryAbort = new AbortController();
        this.items = [];
        this.queryFailed = false;
        this.nextCursor = null;
        this.total = null;
        this.grid.replaceChildren();
        this.closeDetails({ restoreFocus: false });
        this.setStatus('Loading levels…');
        this.loadMoreButton.hidden = true;
        await this.loadPage({ version, cursor: null, reset: true });
    }

    async loadNextPage() {
        if (this.loading || !this.nextCursor) return;
        const version = this.queryVersion;
        await this.loadPage({ version, cursor: this.nextCursor, reset: false });
    }

    async loadPage({ version, cursor, reset }) {
        if (!this.catalog) {
            this.showQueryError(new Error('No level catalog is configured.'), version);
            return;
        }
        this.loading = true;
        this.loadMoreButton.disabled = true;
        if (!reset) this.setStatus('Loading more levels…');
        try {
            const result = await this.catalog.query({
                source: this.selectedSource(),
                text: this.searchInput.value,
                cursor,
                pageSize: 24,
                signal: this.queryAbort.signal
            });
            if (version !== this.queryVersion) return;
            this.items.push(...result.items);
            this.nextCursor = result.nextCursor;
            this.total = result.total ?? null;
            this.renderResults();
        } catch (error) {
            if (error?.name !== 'AbortError') this.showQueryError(error, version);
        } finally {
            if (version === this.queryVersion) {
                this.loading = false;
                this.loadMoreButton.disabled = false;
            }
        }
    }

    showQueryError(error, version) {
        if (version !== this.queryVersion) return;
        this.queryFailed = true;
        this.setStatus(error?.message || 'Unable to load levels.', { error: true });
        this.loadMoreButton.textContent = 'RETRY';
        this.loadMoreButton.hidden = false;
    }

    renderResults() {
        this.queryFailed = false;
        this.grid.replaceChildren();
        if (!this.items.length) {
            const empty = document.createElement('div');
            empty.className = 'level-browser-empty';
            const source = this.selectedSource();
            empty.textContent = this.searchInput.value.trim()
                ? `No ${this.sourceLabel().toLocaleLowerCase()} match this search.`
                : source === 'local'
                    ? (this.mode === 'open'
                        ? 'No saved levels yet. Save this level to make it available here.'
                        : 'No saved levels yet. Create one in the Level Editor.')
                    : source === 'community'
                        ? 'No community levels are available yet.'
                        : 'No official levels are available.';
            if (source === 'local' && this.mode === 'browse') {
                const create = createButton('CREATE NEW LEVEL', () => {
                    this.close();
                    this.game.openLevelEditor();
                }, actionColors('edit'));
                empty.append(document.createElement('br'), create);
            }
            this.grid.appendChild(empty);
        } else {
            for (const summary of this.items) this.grid.appendChild(this.createCard(summary));
        }
        const count = this.items.length;
        this.setStatus(this.total == null
            ? `${this.sourceLabel()}: ${count} level${count === 1 ? '' : 's'} loaded.`
            : `${this.sourceLabel()}: ${count} of ${this.total} level${this.total === 1 ? '' : 's'} loaded.`);
        this.loadMoreButton.textContent = 'LOAD MORE';
        this.loadMoreButton.hidden = !this.nextCursor;
    }

    createCard(summary) {
        const card = document.createElement('article');
        card.className = 'level-card';
        const image = document.createElement('img');
        image.alt = summary.thumbnail ? `${summary.name} thumbnail` : '';
        image.loading = 'lazy';
        image.decoding = 'async';
        if (summary.thumbnail) image.src = summary.thumbnail;
        else this.generateDefinitionThumbnail(summary, image);
        const name = document.createElement('strong');
        name.textContent = summary.name;
        const description = document.createElement('small');
        description.textContent = summary.description || 'No description';
        const actions = this.createLevelActions(summary, { includeDetails: true });
        card.append(image, name, description, actions);
        return card;
    }

    async generateDefinitionThumbnail(summary, image) {
        const cacheKey = `${summary.source}:${summary.definitionHash || summary.id}`;
        const cached = this.thumbnailCache.get(cacheKey);
        if (cached) {
            image.src = cached;
            image.alt = `${summary.name} thumbnail`;
            return;
        }
        const version = this.queryVersion;
        try {
            const definition = await this.catalog.getDefinition(summary, { signal: this.queryAbort?.signal });
            if (version !== this.queryVersion || !image.isConnected) return;
            const thumbnail = createLevelThumbnail(definition, {
                assetLoader: this.game.assetLoader,
                stars: this.game.stars
            });
            if (!thumbnail) return;
            this.thumbnailCache.set(cacheKey, thumbnail);
            image.src = thumbnail;
            image.alt = `${summary.name} thumbnail`;
        } catch (error) {
            if (error?.name !== 'AbortError') console.warn('Unable to generate community level thumbnail.', error);
        }
    }

    createLevelActions(summary, { includeDetails = false } = {}) {
        const actions = document.createElement('div');
        actions.className = 'level-card-actions';
        if (includeDetails) {
            actions.appendChild(createButton('DETAILS', event => {
                this.showDetails(summary, event.currentTarget);
            }, actionColors('neutral')));
        }
        if (this.mode === 'open') {
            if (summary.source !== 'local' || summary.capabilities?.edit !== false) {
                const label = summary.source === 'local' ? 'OPEN' : 'OPEN A COPY';
                actions.appendChild(createButton(label, () => this.activateLevel(summary, { edit: true }), actionColors('edit')));
            }
        } else {
            if (summary.capabilities?.play !== false) {
                actions.appendChild(createButton('PLAY', () => this.activateLevel(summary), actionColors('play')));
            }
            if (summary.source !== 'local' || summary.capabilities?.edit !== false) {
                const label = summary.source === 'local' ? 'EDIT' : 'EDIT A COPY';
                actions.appendChild(createButton(label, () => this.activateLevel(summary, { edit: true }), actionColors('edit')));
            }
        }
        return actions;
    }

    async showDetails(summary, returnFocus = null) {
        this.detailsAbort?.abort();
        this.detailsReturnFocus = returnFocus;
        const version = ++this.detailsVersion;
        this.detailsAbort = new AbortController();
        this.details.hidden = false;
        this.details.setAttribute('aria-busy', 'true');
        this.details.textContent = 'Loading details…';
        try {
            const [details, scores] = await Promise.all([
                this.catalog.getDetails(summary, { signal: this.detailsAbort.signal }),
                summary.source === 'community' && this.game.communityLevelClient
                    ? this.game.communityLevelClient.getScores(summary.id, {
                        limit: 10,
                        signal: this.detailsAbort.signal
                    })
                    : Promise.resolve({ items: [] })
            ]);
            if (version !== this.detailsVersion) return;
            this.renderDetails(details, scores.items || []);
        } catch (error) {
            if (error?.name === 'AbortError' || version !== this.detailsVersion) return;
            this.details.textContent = error?.message || 'Unable to load level details.';
        } finally {
            if (version === this.detailsVersion) this.details.removeAttribute('aria-busy');
        }
    }

    renderDetails(details, scores = []) {
        this.details.replaceChildren();
        const title = document.createElement('h3');
        title.textContent = details.name;
        const description = document.createElement('p');
        description.textContent = details.description || 'No description';
        const metadata = document.createElement('div');
        metadata.className = 'level-browser-details-meta';
        const values = [
            details.author && `By ${details.author}`,
            Number.isInteger(details.objectCount) && `${details.objectCount} objects`,
            details.updatedAt && `Updated ${formatDate(details.updatedAt)}`,
            details.tags?.length && details.tags.join(', ')
        ].filter(Boolean);
        for (const value of values) {
            const item = document.createElement('span');
            item.textContent = value;
            metadata.appendChild(item);
        }
        const actions = this.createLevelActions(details);
        const close = createButton('CLOSE DETAILS', () => this.closeDetails(), actionColors('neutral'));
        actions.prepend(close);
        this.details.append(title, description, metadata);
        if (details.source === 'community') {
            this.details.append(createCommunityLeaderboard(scores));
        }
        this.details.append(actions);
        title.tabIndex = -1;
        title.focus();
    }

    closeDetails({ restoreFocus = true } = {}) {
        this.detailsAbort?.abort();
        this.detailsVersion++;
        if (!this.details) return;
        this.details.hidden = true;
        this.details.replaceChildren();
        if (restoreFocus && this.detailsReturnFocus?.isConnected) this.detailsReturnFocus.focus();
        this.detailsReturnFocus = null;
    }

    async activateLevel(summary, { edit = false } = {}) {
        if (this.mode === 'open' && this.game.levelEditor?.isDirty?.()) {
            const choice = await this.promptForUnsavedChanges(summary.name);
            if (choice === 'cancel') return;
            if (choice === 'save' && !await this.game.levelEditor.saveLevel()) return;
        }
        this.setStatus(`${edit ? 'Opening' : 'Loading'} ${summary.name}…`);
        const buttons = [...this.overlay.querySelectorAll('button')];
        buttons.forEach(button => { button.disabled = true; });
        try {
            await this.game.loadCatalogLevel(summary, { edit });
        } catch (error) {
            this.setStatus(error?.message || 'Unable to open this level.', { error: true });
            buttons.forEach(button => { button.disabled = false; });
            this.searchInput.focus();
        }
    }

    promptForUnsavedChanges(levelName) {
        return new Promise(resolve => {
            this.confirmationElement?.remove();
            const overlay = document.createElement('div');
            overlay.className = 'level-browser-confirmation';
            overlay.setAttribute('role', 'alertdialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', `level-browser-confirm-title-${this.browserId}`);
            const card = document.createElement('section');
            card.className = 'level-browser-confirmation-card';
            const title = document.createElement('h3');
            title.id = `level-browser-confirm-title-${this.browserId}`;
            title.textContent = 'UNSAVED CHANGES';
            const message = document.createElement('p');
            message.textContent = `Save your changes before opening “${levelName}”?`;
            const actions = document.createElement('div');
            actions.className = 'level-browser-confirmation-actions';
            const finish = choice => {
                for (const element of this.confirmationBackground || []) element.inert = false;
                this.confirmationBackground = null;
                overlay.remove();
                this.confirmationElement = null;
                this.resolveReplacementPrompt = null;
                resolve(choice);
            };
            this.resolveReplacementPrompt = finish;
            actions.append(
                createButton('SAVE & OPEN', () => finish('save'), actionColors('play')),
                createButton('DISCARD', () => finish('discard'), actionColors('neutral')),
                createButton('CANCEL', () => finish('cancel'), actionColors('neutral'))
            );
            card.append(title, message, actions);
            overlay.appendChild(card);
            this.confirmationBackground = [...this.panel.children];
            for (const element of this.confirmationBackground) element.inert = true;
            this.panel.appendChild(overlay);
            this.confirmationElement = overlay;
            actions.querySelector('button')?.focus();
        });
    }

    handleClick() { return true; }

    handleKeyPress(event) {
        if (event.code === 'Escape') {
            if (!this.details.hidden) this.closeDetails();
            else this.close();
        }
        return true;
    }

    destroy() {
        this.cancelSearchTimer();
        this.queryAbort?.abort();
        this.detailsAbort?.abort();
        this.resolveReplacementPrompt?.('cancel');
        this.overlay?.remove();
        if (this.inertEditor && this.game.levelEditor?.container) this.game.levelEditor.container.inert = false;
        if (this.previousFocus?.isConnected) this.previousFocus.focus();
    }
}
