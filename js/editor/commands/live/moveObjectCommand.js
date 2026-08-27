import LiveEditCommand from './liveEditCommand.js';

export class MoveObjectCommand extends LiveEditCommand {
    static type = 'object.move';

    do() {
        this.payload.beforeDefinition ||= this.context.documentDefinition();
        this.payload.afterDefinition = this.context.mutateObjectPosition(
            this.payload.beforeDefinition,
            this.payload.objectId,
            this.payload.after
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

export default MoveObjectCommand;
