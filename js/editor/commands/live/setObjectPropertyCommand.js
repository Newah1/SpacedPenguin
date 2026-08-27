import LiveEditCommand from './liveEditCommand.js';

export class SetObjectPropertyCommand extends LiveEditCommand {
    static type = 'object.property.set';

    do() {
        this.payload.beforeDefinition ||= this.context.documentDefinition();
        this.payload.afterDefinition ||= this.context.mutateObjectProperty(
            this.payload.beforeDefinition,
            this.payload.objectId,
            this.payload.property,
            this.payload.value
        );
        if (!this.payload.afterDefinition ||
            !this.context.applyDocumentDefinition(this.payload.afterDefinition)) return false;
        this.context.refresh(this.context.resolveObject(this.payload.objectId));
        return true;
    }

    undo() {
        if (!this.context.applyDocumentDefinition(this.payload.beforeDefinition)) return false;
        this.context.refresh(this.context.resolveObject(this.payload.objectId));
        return true;
    }

    mergeWith(command) {
        if (
            command.type !== this.type ||
            command.payload.objectId !== this.payload.objectId ||
            command.payload.property !== this.payload.property ||
            command.payload.sessionId !== this.payload.sessionId
        ) return false;
        this.payload.afterDefinition = command.payload.afterDefinition;
        return true;
    }
}

export default SetObjectPropertyCommand;
