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
        if (command.do() === false) return false;
        this.recordCommand(command);
        return true;
    }

    recordExecuted(type, payload) {
        const command = this.registry.create(type, this.context, payload);
        this.recordCommand(command);
        return command;
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
        const command = this.undoStack.pop();
        if (!command) return false;
        if (command.undo() === false) {
            this.undoStack.push(command);
            return false;
        }
        this.redoStack.push(command);
        return true;
    }

    redo() {
        const command = this.redoStack.pop();
        if (!command) return false;
        if (command.do() === false) {
            this.redoStack.push(command);
            return false;
        }
        this.undoStack.push(command);
        return true;
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }
}

export default CommandHistory;
