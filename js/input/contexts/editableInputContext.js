import { InputPriority } from '../inputPriorities.js';
import { InputResponse } from '../inputResult.js';
import { InputType } from '../inputTypes.js';
import { isEditableInputTarget } from './contextHelpers.js';

export class EditableInputContext {
    id = 'editable';
    priority = InputPriority.TEXT_EDIT;
    inputTypes = [InputType.KEY_DOWN, InputType.KEY_UP];

    matches(type, event) {
        return isEditableInputTarget(event.target) && !(event.ctrlKey || event.metaKey);
    }

    handle() {
        return InputResponse.consumed();
    }
}
