import LiveEditCommand from './liveEditCommand.js';

export class ObjectGroupCommand extends LiveEditCommand {
    static type = 'object.group';

    do() {
        return this.#apply(this.payload.operation || 'add');
    }

    undo() {
        return this.#apply((this.payload.operation || 'add') === 'add' ? 'remove' : 'add');
    }

    #apply(operation) {
        if (!this.payload.entries) {
            const objectIds = this.payload.objectIds || [];
            this.payload.entries = objectIds.map(objectId => this.context.getObjectDefinition(objectId));
            if (this.payload.entries.some(entry => !entry)) return false;
        }
        const ordered = operation === 'add'
            ? [...this.payload.entries].sort((a, b) => a.index - b.index)
            : [...this.payload.entries].sort((a, b) => b.index - a.index);
        const patches = ordered.map(entry => operation === 'add'
            ? { type: 'object.add', object: entry.definition, index: entry.index }
            : { type: 'object.remove', id: entry.definition.properties.id });
        if (!this.context.applyDocumentPatches(patches)) return false;
        const selectionId = operation === 'add'
            ? this.payload.entries[0]?.definition?.properties?.id
            : null;
        this.context.refresh(selectionId ? this.context.resolveObject(selectionId) : null);
        return true;
    }
}

export default ObjectGroupCommand;
