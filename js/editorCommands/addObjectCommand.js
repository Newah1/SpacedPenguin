import LiveEditCommand from './liveEditCommand.js';

export class AddObjectCommand extends LiveEditCommand {
    static type = 'object.add';

    do() {
        const { definition, objectId, index } = this.payload;
        if (!definition && this.payload.object && this.context.mutator) {
            const object = this.payload.object;
            if (!this.context.mutator.addObject(object, this.payload.className || object.constructor.name)) return false;
            this.context.refresh(object);
            return true;
        }
        if (!definition || !objectId) return false;
        if (!this.context.addObjectDefinition(definition, index)) return false;
        this.context.refresh(this.context.resolveObject(objectId));
        return true;
    }

    undo() {
        if (!this.payload.definition && this.payload.object && this.context.mutator) {
            this.context.mutator.removeObject(
                this.payload.object,
                this.payload.className || this.payload.object.constructor.name
            );
            this.context.refresh(null);
            return true;
        }
        if (!this.context.removeObjectDefinition(this.payload.objectId)) return false;
        this.context.refresh(null);
        return true;
    }
}

export default AddObjectCommand;
