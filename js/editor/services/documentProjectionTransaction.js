/**
 * Commits one already-authored definition to the document and its runtime mirror.
 * Validation happens before the projector is touched. Any projection failure
 * restores both sides to the exact prior definition before the error escapes.
 */
export function projectDocumentDefinition({
    document,
    projector,
    definition,
    source = 'editor document mutation',
    onCommitted,
    onRecoveryFailure
}) {
    const previous = document.toDefinition();
    let documentChanged = false;
    let projectionStarted = false;
    try {
        document.replace(definition, { validate: true });
        documentChanged = true;
        const next = document.toDefinition();
        document.validate(source);
        projectionStarted = true;
        projector.applyDefinition(previous, next);
        onCommitted?.(next, previous);
        return true;
    } catch (error) {
        if (documentChanged) document.replace(previous, { validate: false });
        if (projectionStarted) {
            try {
                projector.rebuild(previous);
            } catch (recoveryError) {
                onRecoveryFailure?.(recoveryError);
            }
        }
        throw error;
    }
}

export default projectDocumentDefinition;
