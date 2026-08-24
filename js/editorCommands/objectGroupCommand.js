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
        if (this.payload.objects && this.context.mutator) {
            return this.#applyLegacy(operation);
        }
        if (!this.payload.entries) {
            const objectIds = this.payload.objectIds || [];
            this.payload.entries = objectIds.map(objectId => this.context.getObjectDefinition(objectId));
            if (this.payload.entries.some(entry => !entry)) return false;
        }
        const before = this.context.documentDefinition();
        const ordered = operation === 'add'
            ? [...this.payload.entries].sort((a, b) => a.index - b.index)
            : [...this.payload.entries].sort((a, b) => b.index - a.index);
        for (const entry of ordered) {
            const applied = operation === 'add'
                ? this.context.patchDocumentObject({ type: 'object.add', object: entry.definition, index: entry.index })
                : this.context.patchDocumentObject({ type: 'object.remove', id: entry.definition.properties.id });
            if (!applied) {
                this.context.restoreDocument(before);
                return false;
            }
        }
        if (!this.context.rebuildProjection()) {
            this.context.restoreDocument(before);
            this.context.rebuildProjection();
            return false;
        }
        const selectionId = operation === 'add'
            ? this.payload.entries[0]?.definition?.properties?.id
            : null;
        this.context.refresh(selectionId ? this.context.resolveObject(selectionId) : null);
        return true;
    }

    #applyLegacy(operation) {
        const method = operation === 'add' ? 'addObject' : 'removeObject';
        const rollbackMethod = operation === 'add' ? 'removeObject' : 'addObject';
        const ordered = operation === 'add' ? this.payload.objects : [...this.payload.objects].reverse();
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
        this.context.refresh(operation === 'add' ? this.payload.objects[0] : null);
        return true;
    }
}

export default ObjectGroupCommand;
