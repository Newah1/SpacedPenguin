import { ConsoleInputContext } from './contexts/consoleInputContext.js';
import { EditableInputContext } from './contexts/editableInputContext.js';
import { EditorInputContext } from './contexts/editorInputContext.js';
import { GameplayInputContext } from './contexts/gameplayInputContext.js';
import { GlobalInputContext } from './contexts/globalInputContext.js';
import { MenuInputContext } from './contexts/menuInputContext.js';
import { ModalInputContext } from './contexts/modalInputContext.js';
import { PausedInputContext } from './contexts/pausedInputContext.js';
import { WindowInputContext } from './contexts/windowInputContext.js';

export function createDefaultInputContexts(rootContext) {
    return [
        new GlobalInputContext(rootContext),
        new ModalInputContext(rootContext),
        new ConsoleInputContext(rootContext),
        new EditableInputContext(),
        new EditorInputContext(rootContext),
        new GameplayInputContext(rootContext),
        new PausedInputContext(rootContext),
        new MenuInputContext(rootContext),
        new WindowInputContext(rootContext)
    ];
}

export function registerDefaultInputContexts(manager, rootContext) {
    return createDefaultInputContexts(rootContext).map(context => manager.register(context));
}
