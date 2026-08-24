import { EditorEventType } from './editorEvents.js';

export class EditorCommandBus {
    constructor({ history, events, canExecute, validate } = {}) {
        this.history = history;
        this.events = events;
        this.canExecute = canExecute || (() => true);
        this.validate = validate || (() => true);
        this.transaction = null;
        this.lastError = null;
    }

    execute(type, payload, metadata = {}) {
        if (!this.canExecute() || this.transaction) return false;
        this.history.context.changeSource = metadata.source || 'command';
        let result;
        try {
            result = this.history.execute(type, payload);
        } catch (error) {
            this.lastError = error;
            return false;
        } finally {
            this.history.context.changeSource = null;
        }
        if (!result) return false;
        try {
            this.validate();
            this.lastError = null;
        } catch (error) {
            this.lastError = error;
            this.history.undo();
            this.history.redoStack.pop();
            return false;
        }
        this.#emitChange(type, payload, metadata);
        return result;
    }

    begin(type, payload, metadata = {}) {
        if (!this.canExecute() || this.transaction) return false;
        this.transaction = { type, payload: { ...payload }, metadata, command: null };
        this.history.context.liveTransaction = true;
        this.history.context.changeSource = metadata.source || 'transaction';
        return true;
    }

    update(payloadChanges) {
        if (!this.transaction) return false;
        const payload = { ...this.transaction.payload, ...payloadChanges };
        const command = this.history.registry.create(
            this.transaction.type,
            this.history.context,
            payload
        );
        try {
            if (command.do() === false) return false;
        } catch (error) {
            this.lastError = error;
            try { command.undo(); } catch {}
            this.history.context.liveTransaction = false;
            this.history.context.changeSource = null;
            this.transaction = null;
            return false;
        }
        // Commands may add serializable before/after snapshots to their payload.
        // Carry those snapshots into the next live update so cancellation and the
        // single committed undo entry always return to the transaction start.
        this.transaction.payload = { ...command.payload };
        this.transaction.command = command;
        return true;
    }

    commit() {
        const transaction = this.transaction;
        if (!transaction) return false;
        this.history.context.liveTransaction = false;
        this.history.context.changeSource = null;
        this.transaction = null;
        if (!transaction.command) return false;
        try {
            this.validate();
            this.lastError = null;
        } catch (error) {
            this.lastError = error;
            transaction.command.undo();
            return false;
        }
        this.history.recordCommand(transaction.command);
        this.#emitChange(transaction.type, transaction.payload, transaction.metadata);
        return true;
    }

    cancel() {
        const transaction = this.transaction;
        if (!transaction) return false;
        this.history.context.liveTransaction = false;
        this.history.context.changeSource = null;
        this.transaction = null;
        if (transaction.command) transaction.command.undo();
        return true;
    }

    undo() {
        if (this.transaction || !this.history.undo()) return false;
        this.#emitHistory('undo');
        this.events?.emit(EditorEventType.DOCUMENT_CHANGED, { source: 'undo' });
        return true;
    }

    redo() {
        if (this.transaction || !this.history.redo()) return false;
        this.#emitHistory('redo');
        this.events?.emit(EditorEventType.DOCUMENT_CHANGED, { source: 'redo' });
        return true;
    }

    clear() {
        if (this.transaction) this.cancel();
        this.history.clear();
        this.#emitHistory('clear');
    }

    #emitChange(type, payload, metadata) {
        this.events?.emit(EditorEventType.DOCUMENT_CHANGED, {
            type,
            objectId: payload.objectId ?? payload.id ?? null,
            property: payload.property ?? null,
            source: metadata.source || 'command'
        });
        this.#emitHistory('execute');
    }

    #emitHistory(action) {
        this.events?.emit(EditorEventType.HISTORY_CHANGED, {
            action,
            canUndo: this.history.undoStack.length > 0,
            canRedo: this.history.redoStack.length > 0
        });
    }
}

export default EditorCommandBus;
