import LiveEditCommand from './liveEditCommand.js';

export class SetObjectPropertyCommand extends LiveEditCommand {
    static type = 'object.property.set';

    do() {
        this.context.restoreObjectPropertyState(this.payload.object, this.payload.after);
        this.context.refresh(this.payload.object);
        return true;
    }

    undo() {
        this.context.restoreObjectPropertyState(this.payload.object, this.payload.before);
        this.context.refresh(this.payload.object);
        return true;
    }

    mergeWith(command) {
        if (
            command.type !== this.type ||
            command.payload.object !== this.payload.object ||
            command.payload.property !== this.payload.property ||
            command.payload.sessionId !== this.payload.sessionId
        ) {
            return false;
        }
        this.payload.after = command.payload.after;
        return true;
    }
}

export default SetObjectPropertyCommand;
