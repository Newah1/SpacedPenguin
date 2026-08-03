import LiveEditCommand from './liveEditCommand.js';

function restoreOrbitCenter(context, object, position) {
    object.orbitSystem.orbitCenter = { ...position };
    context.updateOrbitSystem(object);
    context.refresh(object);
}

export class MoveOrbitCenterCommand extends LiveEditCommand {
    static type = 'orbit-center.move';

    do() {
        restoreOrbitCenter(this.context, this.payload.object, this.payload.after);
        return true;
    }

    undo() {
        restoreOrbitCenter(this.context, this.payload.object, this.payload.before);
        return true;
    }
}

export default MoveOrbitCenterCommand;
