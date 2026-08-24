import LiveEditCommand from './liveEditCommand.js';

export class RemoveObjectCommand extends LiveEditCommand {
    static type = 'object.remove';

    do() {
        const { objectId } = this.payload;
        if (!objectId && this.payload.object && this.context.mutator) {
            this.context.mutator.removeObject(
                this.payload.object,
                this.payload.className || this.payload.object.constructor.name
            );
            this.context.refresh(null);
            return true;
        }
        if (!this.payload.definition) {
            const snapshot = this.context.getObjectDefinition(objectId);
            if (!snapshot) return false;
            this.payload.definition = snapshot.definition;
            this.payload.index = snapshot.index;
        }
        if (!this.context.removeObjectDefinition(objectId)) return false;
        this.context.refresh(null);
        return true;
    }

    undo() {
        if (!this.payload.objectId && this.payload.object && this.context.mutator) {
            if (!this.context.mutator.addObject(
                this.payload.object,
                this.payload.className || this.payload.object.constructor.name
            )) return false;
            this.context.refresh(this.payload.object);
            return true;
        }
        if (!this.context.addObjectDefinition(this.payload.definition, this.payload.index)) return false;
        this.context.refresh(this.context.resolveObject(this.payload.objectId));
        return true;
    }
}

export default RemoveObjectCommand;
