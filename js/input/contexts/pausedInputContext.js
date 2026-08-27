import { GameState } from '../../runtime/gameState.js';
import { InputPriority } from '../inputPriorities.js';
import { InputResponse } from '../inputResult.js';
import { InputType } from '../inputTypes.js';
import { gameFrom } from './contextHelpers.js';

export class PausedInputContext {
    id = 'paused';
    priority = InputPriority.PAUSED;
    inputTypes = [InputType.KEY_DOWN, InputType.KEY_UP];

    constructor(rootContext) {
        this.rootContext = rootContext;
    }

    matches() {
        const game = gameFrom(this.rootContext);
        return game?.state === GameState.PAUSED && !game.levelEditor?.active;
    }

    handle(type, event) {
        if (type === InputType.KEY_DOWN && (event.code === 'Space' || event.code === 'Enter')) {
            gameFrom(this.rootContext).setState(GameState.PLAYING);
            return InputResponse.handled({ preventDefault: true });
        }
        return InputResponse.consumed();
    }
}
