import { INPUT_CONFIG } from '../../config/inputConfig.js';
import { InputPriority } from '../inputPriorities.js';
import { InputResponse } from '../inputResult.js';
import { InputType } from '../inputTypes.js';

export class WindowInputContext {
    id = 'window';
    priority = InputPriority.FALLBACK;
    inputTypes = [InputType.RESIZE, InputType.ORIENTATION_CHANGE];

    constructor(rootContext, schedule = globalThis.setTimeout) {
        this.rootContext = rootContext;
        this.schedule = schedule;
    }

    matches() {
        return true;
    }

    handle(type) {
        if (type === InputType.ORIENTATION_CHANGE) {
            this.schedule(() => this.rootContext.setupResponsiveCanvas?.(), INPUT_CONFIG.orientationSettleMs);
        } else {
            this.rootContext.setupResponsiveCanvas?.();
        }
        return InputResponse.handled();
    }
}
