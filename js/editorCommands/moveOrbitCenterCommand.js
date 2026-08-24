import LiveEditCommand from './liveEditCommand.js';

function restoreOrbitCenter(context, object, position) {
    object.orbitSystem.orbitCenter = { ...position };
    context.updateOrbitSystem(object);
    context.synchronizeObject?.(object);
    context.refresh(object);
}

export class MoveOrbitCenterCommand extends LiveEditCommand {
    static type = 'orbit-center.move';

    do() {
        const object = this.payload.object || this.context.resolveObject?.(this.payload.objectId);
        if (!object) return false;
        restoreOrbitCenter(this.context, object, this.payload.after);
        return true;
    }

    undo() {
        const object = this.payload.object || this.context.resolveObject?.(this.payload.objectId);
        if (!object) return false;
        restoreOrbitCenter(this.context, object, this.payload.before);
        return true;
    }
}

export default MoveOrbitCenterCommand;
