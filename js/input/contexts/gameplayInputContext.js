import { GameState } from '../../runtime/gameState.js';
import { InputPriority } from '../inputPriorities.js';
import { InputResponse } from '../inputResult.js';
import { InputType } from '../inputTypes.js';
import { gameFrom } from './contextHelpers.js';

export class GameplayInputContext {
    id = 'gameplay';
    priority = InputPriority.GAMEPLAY;
    inputTypes = [
        InputType.KEY_DOWN,
        InputType.KEY_UP,
        InputType.MOUSE_DOWN,
        InputType.MOUSE_MOVE,
        InputType.MOUSE_UP,
        InputType.TOUCH_START,
        InputType.TOUCH_MOVE,
        InputType.TOUCH_END
    ];

    constructor(rootContext) {
        this.rootContext = rootContext;
    }

    matches() {
        const game = gameFrom(this.rootContext);
        return game?.state === GameState.PLAYING || (
            game?.levelEditor?.active === true && game.levelEditor.mode === 'play'
        );
    }

    handle(type, event) {
        const game = gameFrom(this.rootContext);
        switch (type) {
            case InputType.MOUSE_DOWN:
                game.handleMouseDown(event);
                return InputResponse.handled();
            case InputType.MOUSE_MOVE:
                game.handleMouseMove(event);
                return InputResponse.handled();
            case InputType.MOUSE_UP:
                game.handleMouseUp(event);
                return InputResponse.handled();
            case InputType.TOUCH_START:
                game.handleTouchStart(event);
                return InputResponse.handled();
            case InputType.TOUCH_MOVE:
                game.handleTouchMove(event);
                return InputResponse.handled();
            case InputType.TOUCH_END:
                game.handleTouchEnd(event);
                return InputResponse.handled();
            case InputType.KEY_DOWN:
                return this.handleKeyDown(event, game);
            default:
                return InputResponse.consumed();
        }
    }

    handleKeyDown(event, game) {
        if (event.ctrlKey || event.metaKey) return InputResponse.pass();
        switch (event.code) {
            case 'KeyR':
                game.resetLevel();
                return InputResponse.handled({ preventDefault: true });
            case 'KeyQ':
                game.showQuitDialog();
                return InputResponse.handled({ preventDefault: true });
            case 'Space':
                if (game.penguin?.state !== PenguinState.CRASHED && game.penguin?.state !== PenguinState.HIT_TARGET) {
                    return InputResponse.consumed();
                }
                game.resetLevel();
                return InputResponse.handled({ preventDefault: true });
            default:
                if (game.penguin?.state === PenguinState.SOARING) game.tryAgain();
                return InputResponse.consumed();
        }
    }
}
import { PenguinState } from '../../runtime/penguinState.js';
