import { GameState } from '../../runtime/gameState.js';
import { InputPriority } from '../inputPriorities.js';
import { InputResponse } from '../inputResult.js';
import { InputType } from '../inputTypes.js';
import { gameFrom } from './contextHelpers.js';

export class MenuInputContext {
    id = 'menu';
    priority = InputPriority.MENU;
    inputTypes = [
        InputType.KEY_DOWN,
        InputType.KEY_UP,
        InputType.POINTER_DOWN,
        InputType.POINTER_MOVE,
        InputType.POINTER_UP,
        InputType.POINTER_CANCEL,
        InputType.CLICK
    ];

    constructor(rootContext) {
        this.rootContext = rootContext;
    }

    matches() {
        return gameFrom(this.rootContext)?.state === GameState.MENU;
    }

    handle(type, event) {
        const game = gameFrom(this.rootContext);
        switch (type) {
            case InputType.KEY_DOWN:
                if (event.ctrlKey || event.metaKey) return InputResponse.pass();
                if (event.code === 'Space' || event.code === 'Enter') {
                    game.startGame();
                    return InputResponse.handled({ preventDefault: true });
                }
                return InputResponse.consumed();
            case InputType.POINTER_DOWN: {
                const handled = this.rootContext.handleMenuPointerDown?.(event) === true;
                if (handled) event.target?.setPointerCapture?.(event.pointerId);
                return handled
                    ? InputResponse.handled({ preventDefault: true })
                    : InputResponse.consumed();
            }
            case InputType.POINTER_MOVE: {
                const handled = this.rootContext.handleMenuPointerMove?.(event) === true;
                return handled
                    ? InputResponse.handled({ preventDefault: true })
                    : InputResponse.consumed();
            }
            case InputType.POINTER_UP:
            case InputType.POINTER_CANCEL: {
                const handled = this.rootContext.handleMenuPointerUp?.(event) === true;
                return handled
                    ? InputResponse.handled({ preventDefault: true })
                    : InputResponse.consumed();
            }
            case InputType.CLICK:
                return this.handleClick(event, game);
            default:
                return InputResponse.consumed();
        }
    }

    handleClick(event, game) {
        if (this.rootContext.consumeMenuInteraction?.()) return InputResponse.consumed();
        if (this.rootContext.handleMenuButtonClick?.(event)) return InputResponse.handled();
        if (this.rootContext.shouldStartGameFromMenu && !this.rootContext.shouldStartGameFromMenu(event)) {
            return InputResponse.consumed();
        }
        game.startGame();
        return InputResponse.handled();
    }
}
