import LiveEditCommand from './liveEditCommand.js';

export class AdjustPlanetsCommand extends LiveEditCommand {
    static type = 'planets.adjust.batch';

    do() {
        this.payload.beforeDefinition ||= this.context.documentDefinition();
        this.payload.afterDefinition ||= this.context.mutatePlanetAdjustments(
            this.payload.beforeDefinition,
            this.payload.adjustments
        );
        return Boolean(this.payload.afterDefinition &&
            this.context.applyDocumentDefinition(this.payload.afterDefinition));
    }

    undo() {
        return this.context.applyDocumentDefinition(this.payload.beforeDefinition);
    }
}

export default AdjustPlanetsCommand;
