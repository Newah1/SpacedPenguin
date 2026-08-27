import LiveEditCommand from './liveEditCommand.js';

export class MoveWaypointCommand extends LiveEditCommand {
    static type = 'waypoint.move';

    do() {
        this.payload.beforeDefinition ||= this.context.documentDefinition();
        this.payload.afterDefinition = this.context.mutateWaypoint(
            this.payload.beforeDefinition,
            this.payload.objectId,
            this.payload.waypointIndex,
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

export default MoveWaypointCommand;
