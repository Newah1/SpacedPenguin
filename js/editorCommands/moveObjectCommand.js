import LiveEditCommand from './liveEditCommand.js';

function setPosition(object, position) {
    if (typeof object.x === 'number' && typeof object.y === 'number') {
        object.x = position.x;
        object.y = position.y;
    } else if (object.position) {
        object.position.x = position.x;
        object.position.y = position.y;
    }
}

export class MoveObjectCommand extends LiveEditCommand {
    static type = 'object.move';

    do() {
        const object = this.payload.object || this.context.resolveObject?.(this.payload.objectId);
        if (!object) return false;
        setPosition(object, this.payload.after);
        this.context.synchronizeObject?.(object);
        this.context.refresh(object);
        return true;
    }

    undo() {
        const object = this.payload.object || this.context.resolveObject?.(this.payload.objectId);
        if (!object) return false;
        setPosition(object, this.payload.before);
        this.context.synchronizeObject?.(object);
        this.context.refresh(object);
        return true;
    }
}

export default MoveObjectCommand;
