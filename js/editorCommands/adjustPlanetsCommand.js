import LiveEditCommand from './liveEditCommand.js';

export class AdjustPlanetsCommand extends LiveEditCommand {
    static type = 'planets.adjust.batch';

    apply(states) {
        const resolved = states.map(entry => ({
            entry,
            object: entry.object || this.context.resolveObject?.(entry.objectId)
        }));
        if (resolved.some(item => !item.object)) return false;
        for (const { entry, object } of resolved) {
            this.context.restoreObjectPropertyState(object, entry.state);
        }
        const last = states.at(-1);
        this.context.refresh(last?.object || this.context.resolveObject?.(last?.objectId) || null);
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
