import { InputPriority } from '../inputPriorities.js';
import { InputResponse } from '../inputResult.js';
import { InputType } from '../inputTypes.js';
import { gameFrom } from './contextHelpers.js';

export class EditorInputContext {
    id = 'editor';
    priority = InputPriority.EDITOR;
    inputTypes = [
        InputType.KEY_DOWN,
        InputType.KEY_UP,
        InputType.POINTER_DOWN,
        InputType.POINTER_MOVE,
        InputType.POINTER_UP,
        InputType.POINTER_CANCEL,
        InputType.CONTEXT_MENU,
        InputType.WHEEL
    ];

    constructor(rootContext) {
        this.rootContext = rootContext;
    }

    matches() {
        const editor = gameFrom(this.rootContext)?.levelEditor;
        return editor?.active === true && editor.mode === 'edit';
    }

    handle(type, event) {
        const game = gameFrom(this.rootContext);
        const editor = game.levelEditor;
        switch (type) {
            case InputType.POINTER_DOWN:
                editor.handlePointerDown(event);
                return InputResponse.handled();
            case InputType.POINTER_MOVE:
                editor.handlePointerMove(event);
                return InputResponse.handled();
            case InputType.POINTER_UP:
                editor.handlePointerUp(event);
                return InputResponse.handled();
            case InputType.POINTER_CANCEL:
                if (editor.handlePointerCancel) editor.handlePointerCancel(event);
                else editor.handlePointerUp(event);
                return InputResponse.handled();
            case InputType.CONTEXT_MENU:
                editor.handleRightClick(event);
                return InputResponse.handled();
            case InputType.WHEEL:
                editor.zoomEditorAt(event.clientX, event.clientY, event.deltaY);
                return InputResponse.handled({ preventDefault: true });
            case InputType.KEY_UP:
                if (event.code !== 'Space') return InputResponse.consumed();
                editor.toolManager?.setSpacePan(false);
                editor.spacePan = false;
                if (!editor.panning) game.canvas.style.cursor = '';
                return InputResponse.handled();
            case InputType.KEY_DOWN:
                return this.handleKeyDown(event, game, editor);
            default:
                return InputResponse.consumed();
        }
    }

    handleKeyDown(event, game, editor) {
        switch (event.code) {
            case 'Space':
                editor.toolManager?.setSpacePan(true);
                editor.spacePan = true;
                game.canvas.style.cursor = 'grab';
                return InputResponse.handled({ preventDefault: true });
            case 'KeyF':
                editor.fitEditorCamera();
                return InputResponse.handled({ preventDefault: true });
            case 'Home':
                editor.centerEditorOn(game.slingshot?.position || game.penguin?.position);
                return InputResponse.handled({ preventDefault: true });
            case 'Delete':
                editor.deleteSelectedObject();
                return InputResponse.handled({ preventDefault: true });
            case 'KeyS':
                if (!(event.ctrlKey || event.metaKey)) return InputResponse.consumed();
                editor.saveLevel();
                return InputResponse.handled({ preventDefault: true });
            case 'KeyZ':
                if (!(event.ctrlKey || event.metaKey)) return InputResponse.consumed();
                if (event.shiftKey) editor.redo();
                else editor.undo();
                return InputResponse.handled({ preventDefault: true });
            default:
                return InputResponse.consumed();
        }
    }
}
