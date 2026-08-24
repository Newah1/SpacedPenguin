import LiveEditCommand from './liveEditCommand.js';

export class AddObjectCommand extends LiveEditCommand {
    static type = 'object.add';

    do() {
        const { definition, objectId, index } = this.payload;
        if (!definition || !objectId) return false;
        if (!this.context.addObjectDefinition(definition, index)) return false;
        this.context.refresh(this.context.resolveObject(objectId));
        return true;
    }

    undo() {
        if (!this.context.removeObjectDefinition(this.payload.objectId)) return false;
        this.context.refresh(null);
        return true;
    }
}

export default AddObjectCommand;
