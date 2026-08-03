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
        setPosition(this.payload.object, this.payload.after);
        this.context.refresh(this.payload.object);
        return true;
    }

    undo() {
        setPosition(this.payload.object, this.payload.before);
        this.context.refresh(this.payload.object);
        return true;
    }
}

export default MoveObjectCommand;
