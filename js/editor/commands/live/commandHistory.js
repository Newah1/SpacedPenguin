export class CommandHistory {
    constructor(registry, context, limit = 100) {
        this.registry = registry;
        this.context = context;
        this.limit = limit;
        this.undoStack = [];
        this.redoStack = [];
    }

    execute(type, payload) {
        const command = this.registry.create(type, this.context, payload);
        try {
            if (command.do() === false) return false;
        } catch (error) {
            try { command.undo(); } catch {}
            throw error;
        }
        this.recordCommand(command);
        return true;
    }

    recordCommand(command) {
        const previous = this.undoStack.at(-1);
        if (previous?.mergeWith?.(command)) {
            this.redoStack = [];
            return;
        }
        this.undoStack.push(command);
        if (this.undoStack.length > this.limit) this.undoStack.shift();
        this.redoStack = [];
    }

    undo() {
        const command = this.undoStack.at(-1);
        if (!command) return false;
        if (command.undo() === false) return false;
        this.undoStack.pop();
        this.redoStack.push(command);
        return true;
    }

    redo() {
        const command = this.redoStack.at(-1);
        if (!command) return false;
        try {
            if (command.do() === false) {
                return false;
            }
        } catch (error) {
            try { command.undo(); } catch {}
            throw error;
        }
        this.redoStack.pop();
        this.undoStack.push(command);
        return true;
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }
}

export default CommandHistory;
