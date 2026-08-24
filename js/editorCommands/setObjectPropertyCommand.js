import LiveEditCommand from './liveEditCommand.js';

export class SetObjectPropertyCommand extends LiveEditCommand {
    static type = 'object.property.set';

    do() {
        const object = this.payload.object || this.context.resolveObject?.(this.payload.objectId);
        if (!object) return false;
        if (!this.payload.before) {
            this.payload.before = this.context.captureObjectPropertyState(object);
            this.context.applyObjectProperty(object, this.payload.property, this.payload.value);
            this.payload.after = this.context.captureObjectPropertyState(object);
        } else {
            this.context.restoreObjectPropertyState(object, this.payload.after);
        }
        this.context.refresh(object);
        return true;
    }

    undo() {
        const object = this.payload.object || this.context.resolveObject?.(this.payload.objectId);
        if (!object) return false;
        this.context.restoreObjectPropertyState(object, this.payload.before);
        this.context.refresh(object);
        return true;
    }

    mergeWith(command) {
        if (
            command.type !== this.type ||
            (command.payload.objectId ?? command.payload.object?.id) !==
                (this.payload.objectId ?? this.payload.object?.id) ||
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
