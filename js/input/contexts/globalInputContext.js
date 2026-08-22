import { GameState } from '../../gameState.js';
import { InputPriority } from '../inputPriorities.js';
import { InputResponse } from '../inputResult.js';
import { InputType } from '../inputTypes.js';
import { gameFrom } from './contextHelpers.js';

export class GlobalInputContext {
    id = 'global';
    priority = InputPriority.GLOBAL;
    inputTypes = [InputType.KEY_DOWN];

    constructor(rootContext) {
        this.rootContext = rootContext;
    }

    matches(type, event) {
        if (type !== InputType.KEY_DOWN) return false;
        const game = gameFrom(this.rootContext);
        if (!game) return false;
        const editorOwnsModifiedKeys = game.levelEditor?.active === true && game.levelEditor.mode === 'edit';
        if (event.ctrlKey || event.metaKey) return !editorOwnsModifiedKeys;
        if ((game.uiManager?.activeScreens?.length ?? 0) > 0) return false;
        if (event.code === 'Backquote' || event.code === 'F1') return true;
        return event.code === 'Escape' && (
            game.levelEditor?.active ||
            game.state === GameState.PLAYING ||
            game.state === GameState.PAUSED
        );
    }

    handle(type, event) {
        const game = gameFrom(this.rootContext);
        if (event.ctrlKey || event.metaKey) return InputResponse.consumed();
        if (event.code === 'Backquote') game.console?.toggle();
        else if (event.code === 'F1') game.levelEditor?.toggle();
        else if (game.levelEditor?.active) game.levelEditor.toggle();
        else game.showQuitDialog();
        return InputResponse.handled({ preventDefault: true });
    }
}
