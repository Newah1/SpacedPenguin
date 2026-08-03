import LiveEditCommand from './liveEditCommand.js';

export class AddObjectCommand extends LiveEditCommand {
    static type = 'object.add';

    do() {
        const { object, className = object.constructor.name } = this.payload;
        if (!this.context.mutator.addObject(object, className)) return false;
        this.context.refresh(object);
        return true;
    }

    undo() {
        const { object, className = object.constructor.name } = this.payload;
        this.context.mutator.removeObject(object, className);
        this.context.refresh(null);
        return true;
    }
}

export default AddObjectCommand;
