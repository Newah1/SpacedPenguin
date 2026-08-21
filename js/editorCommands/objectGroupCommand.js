import LiveEditCommand from './liveEditCommand.js';

export class ObjectGroupCommand extends LiveEditCommand {
    static type = 'object.group';

    do() {
        const { objects, operation = 'add' } = this.payload;
        const ordered = operation === 'add' ? objects : [...objects].reverse();
        for (const object of ordered) {
            const method = operation === 'add' ? 'addObject' : 'removeObject';
            if (this.context.mutator[method](object, object.constructor.name) === false) return false;
        }
        this.context.refresh(operation === 'add' ? objects[0] : null);
        return true;
    }

    undo() {
        const { objects, operation = 'add' } = this.payload;
        const method = operation === 'add' ? 'removeObject' : 'addObject';
        const ordered = operation === 'add' ? [...objects].reverse() : objects;
        for (const object of ordered) this.context.mutator[method](object, object.constructor.name);
        this.context.refresh(operation === 'add' ? null : objects[0]);
        return true;
    }
}

export default ObjectGroupCommand;
