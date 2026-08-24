import { LiveEditCommandType } from '../../editorCommands/index.js';

export const EditorCommandIntent = Object.freeze({
    DELETE_SELECTED_OBJECT: 'selection.delete'
});

export class DeletePortalCommandStrategy {
    constructor({ commandBus, findPortal }) {
        this.commandBus = commandBus;
        this.findPortal = findPortal || (() => null);
    }

    listen() {
        return this.commandBus.on(EditorCommandIntent.DELETE_SELECTED_OBJECT, payload =>
            this.execute(payload));
    }

    execute({ object } = {}) {
        if (object?.constructor?.name !== 'Portal') return false;
        const pair = this.findPortal(object.pairedPortalId);
        return Boolean(this.commandBus.execute(LiveEditCommandType.OBJECT_GROUP, {
            objectIds: pair ? [object.id, pair.id] : [object.id],
            operation: 'remove'
        }));
    }
}

export class DeleteObjectCommandStrategy {
    constructor({ commandBus, logger }) {
        this.commandBus = commandBus;
        this.logger = logger;
    }

    listen() {
        return this.commandBus.on(EditorCommandIntent.DELETE_SELECTED_OBJECT, payload =>
            this.execute(payload));
    }

    execute({ object } = {}) {
        if (!object || object.constructor?.name === 'Portal') return false;
        if (object.isLevelSettings) {
            this.logger?.warn('Level Settings cannot be deleted');
            return true;
        }

        const className = object.constructor?.name;
        this.logger?.debug(`Deleting ${className}...`);
        const deleted = this.commandBus.execute(LiveEditCommandType.REMOVE_OBJECT, {
            objectId: object.id,
            className
        });
        if (deleted) this.logger?.success(`Successfully deleted ${className}`);
        return Boolean(deleted);
    }
}

export function registerDeleteObjectCommandStrategies({ commandBus, findPortal, logger }) {
    const strategies = [
        new DeletePortalCommandStrategy({ commandBus, findPortal }),
        new DeleteObjectCommandStrategy({ commandBus, logger })
    ];
    return strategies.map(strategy => strategy.listen());
}
