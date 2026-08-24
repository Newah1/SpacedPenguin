const INTERACTIVE_SELECTOR = 'button, input, select, textarea, option, a, label, [contenteditable="true"]';

/** Make an editor overlay movable without stealing clicks from its controls. */
export function makeDraggablePanel(element, { handleSelector = null } = {}) {
    if (!element) return null;

    let drag = null;

    const clampToViewport = () => {
        if (element.style.display === 'none') return;
        const rect = element.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);
        const left = Math.min(maxLeft, Math.max(0, rect.left));
        const top = Math.min(maxTop, Math.max(0, rect.top));
        if (left !== rect.left || top !== rect.top) setPosition(left, top);
    };

    const setPosition = (left, top) => {
        Object.assign(element.style, {
            position: 'fixed',
            left: `${left}px`,
            top: `${top}px`,
            right: 'auto',
            bottom: 'auto',
            transform: 'none'
        });
        element.dataset.userPositioned = 'true';
    };

    const isHandle = target => {
        if (!(target instanceof Element)) return false;
        if (target.closest(INTERACTIVE_SELECTOR)) return false;
        return handleSelector ? Boolean(target.closest(handleSelector)) : true;
    };

    element.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !isHandle(event.target)) return;
        const rect = element.getBoundingClientRect();
        drag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
        setPosition(rect.left, rect.top);
        element.setPointerCapture?.(event.pointerId);
        element.style.cursor = 'grabbing';
        event.preventDefault();
        event.stopPropagation();
    });

    element.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const maxLeft = Math.max(0, window.innerWidth - element.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - element.offsetHeight);
        setPosition(
            Math.min(maxLeft, Math.max(0, event.clientX - drag.offsetX)),
            Math.min(maxTop, Math.max(0, event.clientY - drag.offsetY))
        );
        event.preventDefault();
    });

    const finish = event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        drag = null;
        element.style.cursor = '';
        event.stopPropagation();
    };
    element.addEventListener('pointerup', finish);
    element.addEventListener('pointercancel', finish);

    if (handleSelector) {
        element.addEventListener('pointerover', event => {
            if (isHandle(event.target)) event.target.closest(handleSelector).style.cursor = 'grab';
        });
    } else {
        element.style.cursor = 'grab';
    }

    return { clampToViewport };
}

export default makeDraggablePanel;
