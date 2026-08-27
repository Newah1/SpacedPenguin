import LiveEditCommand from './liveEditCommand.js';

export class ObjectActionCommand extends LiveEditCommand {
    static type = 'object.action';

    do() {
        this.payload.beforeDefinition ||= this.context.documentDefinition();
        this.payload.afterDefinition ||= this.context.mutateObjectAction(
            this.payload.beforeDefinition,
            this.payload.objectId,
            this.payload.action,
            this.payload.options
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
}

export default ObjectActionCommand;
