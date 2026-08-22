import { InputPriority } from '../inputPriorities.js';
import { InputResponse } from '../inputResult.js';
import { InputType } from '../inputTypes.js';
import { gameFrom } from './contextHelpers.js';

export class ConsoleInputContext {
    id = 'console';
    priority = InputPriority.CONSOLE;
    inputTypes = [InputType.KEY_DOWN, InputType.KEY_UP];

    constructor(rootContext) {
        this.rootContext = rootContext;
    }

    matches() {
        return gameFrom(this.rootContext)?.console?.visible === true;
    }

    handle() {
        return InputResponse.consumed();
    }
}
