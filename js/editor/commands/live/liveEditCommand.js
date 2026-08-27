/**
 * Contract for one reversible authored-document mutation.
 *
 * Implementations must declare a stable static `type` and provide symmetrical
 * do/undo behavior against the document/projector transaction in `context`.
 */
export class LiveEditCommand {
    static type = null;

    constructor(context, payload) {
        if (new.target === LiveEditCommand) {
            throw new TypeError('LiveEditCommand is an abstract contract');
        }
        if (!new.target.type) {
            throw new TypeError(`${new.target.name} must declare a static type`);
        }
        this.context = context;
        this.payload = payload;
        this.type = new.target.type;
    }

    do() {
        throw new TypeError(`${this.constructor.name}.do() is not implemented`);
    }

    undo() {
        throw new TypeError(`${this.constructor.name}.undo() is not implemented`);
    }
}

export default LiveEditCommand;
