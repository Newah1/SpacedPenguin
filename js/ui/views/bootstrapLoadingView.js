export class BootstrapLoadingView {
    constructor(documentRef = document) {
        this.document = documentRef;
    }

    show() {
        const legacyLoading = this.document.getElementById('loading');
        if (legacyLoading) legacyLoading.style.display = 'none';

        let screen = this.document.getElementById('loadingScreen');
        if (!screen) {
            screen = this.document.createElement('div');
            screen.id = 'loadingScreen';
            screen.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #000;
                color: #fff;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                font-family: Arial, sans-serif;
                z-index: 1000;
            `;
            const title = this.document.createElement('h1');
            title.textContent = 'SPACED PENGUIN';
            title.style.cssText = 'font-size: 48px; margin-bottom: 20px;';
            const loadingText = this.document.createElement('div');
            loadingText.id = 'loadingText';
            loadingText.textContent = 'Loading assets...';
            loadingText.style.cssText = 'font-size: 16px;';
            screen.append(title, loadingText);
            this.document.body.appendChild(screen);
        }
        screen.style.display = 'flex';
    }

    hide() {
        const screen = this.document.getElementById('loadingScreen');
        if (screen) screen.style.display = 'none';
    }

    setProgress(progress, resourceName) {
        this.setMessage(`Loading ${resourceName}... ${Math.round(progress)}%`);
    }

    setMessage(message) {
        const loadingText = this.document.getElementById('loadingText');
        if (loadingText) loadingText.textContent = message;
    }

    setBackgroundAssets(pendingAssets) {
        let card = this.document.getElementById('backgroundAssetLoading');
        if (!pendingAssets.length) {
            card?.remove();
            return;
        }
        if (!card) {
            card = this.document.createElement('div');
            card.id = 'backgroundAssetLoading';
            card.setAttribute('role', 'status');
            card.setAttribute('aria-live', 'polite');
            card.style.cssText = `
                position: fixed;
                right: 14px;
                bottom: 14px;
                z-index: 900;
                max-width: min(320px, calc(100vw - 28px));
                padding: 10px 13px;
                border: 1px solid rgba(126, 184, 255, .55);
                border-radius: 9px;
                background: rgba(2, 12, 28, .92);
                color: #e8f3ff;
                box-shadow: 0 7px 24px rgba(0, 0, 0, .45);
                font: 13px/1.35 "Trebuchet MS", Arial, sans-serif;
                pointer-events: none;
            `;
            this.document.body.appendChild(card);
        }
        const names = pendingAssets.slice(0, 2).map(name => name.replace(/^(audio|ui|planet|sprite)_/, ''));
        const remainder = pendingAssets.length - names.length;
        card.textContent = `Loading ${names.join(', ')}${remainder > 0 ? ` +${remainder} more` : ''}…`;
    }

    destroy() {
        this.document.getElementById('loadingScreen')?.remove();
        this.document.getElementById('backgroundAssetLoading')?.remove();
    }
}
