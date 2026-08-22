import { InputPriority } from '../inputPriorities.js';
import { InputResponse } from '../inputResult.js';
import { InputType } from '../inputTypes.js';
import { gameFrom } from './contextHelpers.js';

const INPUT_TYPES = [
    InputType.KEY_DOWN,
    InputType.KEY_UP,
    InputType.MOUSE_DOWN,
    InputType.MOUSE_MOVE,
    InputType.MOUSE_UP,
    InputType.TOUCH_START,
    InputType.TOUCH_MOVE,
    InputType.TOUCH_END,
    InputType.POINTER_DOWN,
    InputType.POINTER_MOVE,
    InputType.POINTER_UP,
    InputType.POINTER_CANCEL,
    InputType.CLICK,
    InputType.CONTEXT_MENU,
    InputType.WHEEL
];

export class ModalInputContext {
    id = 'modal';
    priority = InputPriority.MODAL;
    inputTypes = INPUT_TYPES;

    constructor(rootContext) {
        this.rootContext = rootContext;
    }

    matches() {
        return (gameFrom(this.rootContext)?.uiManager?.activeScreens?.length ?? 0) > 0;
    }

    handle(type, event) {
        const ui = gameFrom(this.rootContext).uiManager;
        switch (type) {
            case InputType.KEY_DOWN: {
                const handled = ui.handleKeyPress?.(event) === true;
                return handled
                    ? InputResponse.handled({ preventDefault: true })
                    : InputResponse.consumed();
            }
            case InputType.CLICK: {
                const handled = ui.handleClick?.(event) === true;
                if (handled) event.__spacedPenguinUiHandled = true;
                return handled
                    ? InputResponse.handled({ preventDefault: true, stopImmediatePropagation: true })
                    : InputResponse.consumed();
            }
            case InputType.POINTER_MOVE:
                ui.handlePointerMove?.(event);
                return InputResponse.handled();
            case InputType.POINTER_DOWN: {
                const handled = ui.handlePointerDown?.(event) === true;
                return InputResponse.handled({ preventDefault: handled });
            }
            case InputType.POINTER_UP:
            case InputType.POINTER_CANCEL:
                ui.handlePointerUp?.(event);
                return InputResponse.handled();
            case InputType.TOUCH_START:
                ui.handleTouchStart?.(event);
                return InputResponse.handled();
            case InputType.TOUCH_END:
                ui.handleTouchEnd?.(event);
                return InputResponse.handled();
            default:
                return InputResponse.consumed();
        }
    }
}
