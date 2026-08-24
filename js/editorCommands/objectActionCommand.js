import LiveEditCommand from './liveEditCommand.js';

export class ObjectActionCommand extends LiveEditCommand {
    static type = 'object.action';

    do() {
        const object = this.context.resolveObject?.(this.payload.objectId);
        if (!object) return false;
        if (!this.payload.before) {
            this.payload.before = this.context.captureObjectPropertyState(object);
            if (this.context.applyObjectAction(object, this.payload.action, this.payload.options) === false) {
                return false;
            }
            this.payload.after = this.context.captureObjectPropertyState(object);
        } else {
            this.context.restoreObjectPropertyState(object, this.payload.after);
        }
        this.context.refresh(object);
        return true;
    }

    undo() {
        const object = this.context.resolveObject?.(this.payload.objectId);
        if (!object) return false;
        this.context.restoreObjectPropertyState(object, this.payload.before);
        this.context.refresh(object);
        return true;
    }
}

export default ObjectActionCommand;
