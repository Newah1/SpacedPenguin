import LiveEditCommand from './liveEditCommand.js';

export class CommandRegistry {
    constructor(commandClasses = []) {
        this.commandClasses = new Map();
        commandClasses.forEach(commandClass => this.register(commandClass));
    }

    register(commandClass) {
        if (!(commandClass?.prototype instanceof LiveEditCommand) || !commandClass.type) {
            throw new TypeError('Registered commands must implement LiveEditCommand and declare a static type');
        }
        if (this.commandClasses.has(commandClass.type)) {
            throw new TypeError(`A command is already registered for type: ${commandClass.type}`);
        }
        this.commandClasses.set(commandClass.type, commandClass);
        return this;
    }

    create(type, context, payload) {
        const CommandClass = this.commandClasses.get(type);
        if (!CommandClass) throw new TypeError(`Unknown live edit command type: ${type}`);
        return new CommandClass(context, payload);
    }
}

export default CommandRegistry;
