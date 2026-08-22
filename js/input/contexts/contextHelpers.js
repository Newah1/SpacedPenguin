export function isEditableInputTarget(target) {
    return target?.matches?.('input, textarea, select, [contenteditable="true"]') === true;
}

export function gameFrom(rootContext) {
    return rootContext.game;
}
