import LiveEditCommand from './liveEditCommand.js';

export class AdjustPlanetsCommand extends LiveEditCommand {
    static type = 'planets.adjust.batch';

    apply(states) {
        for (const entry of states) {
            this.context.restoreObjectPropertyState(entry.object, entry.state);
        }
        this.context.refresh(states.at(-1)?.object ?? null);
        return states.length > 0;
    }

    do() {
        return this.apply(this.payload.after);
    }

    undo() {
        return this.apply(this.payload.before);
    }
}

export default AdjustPlanetsCommand;
