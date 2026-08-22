import LiveEditCommand from './liveEditCommand.js';

export class ObjectGroupCommand extends LiveEditCommand {
    static type = 'object.group';

    do() {
        const { objects, operation = 'add' } = this.payload;
        return this.#apply(operation, objects, operation === 'add' ? objects[0] : null);
    }

    undo() {
        const { objects, operation = 'add' } = this.payload;
        const inverseOperation = operation === 'add' ? 'remove' : 'add';
        return this.#apply(inverseOperation, objects, operation === 'add' ? null : objects[0]);
    }

    #apply(operation, objects, selection) {
        const method = operation === 'add' ? 'addObject' : 'removeObject';
        const rollbackMethod = operation === 'add' ? 'removeObject' : 'addObject';
        const ordered = operation === 'add' ? objects : [...objects].reverse();
        const applied = [];

        for (const object of ordered) {
            if (this.context.mutator[method](object, object.constructor.name) === false) {
                for (const appliedObject of [...applied].reverse()) {
                    this.context.mutator[rollbackMethod](appliedObject, appliedObject.constructor.name);
                }
                return false;
            }
            applied.push(object);
        }

        this.context.refresh(selection);
        return true;
    }
}

export default ObjectGroupCommand;
