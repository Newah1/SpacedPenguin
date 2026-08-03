import LiveEditCommand from './liveEditCommand.js';

export class SetLevelSettingCommand extends LiveEditCommand {
    static type = 'level-setting.set';

    do() {
        this.context.restoreLevelSettingsState(this.payload.after);
        this.context.refresh(this.payload.target);
        return true;
    }

    undo() {
        this.context.restoreLevelSettingsState(this.payload.before);
        this.context.refresh(this.payload.target);
        return true;
    }

    mergeWith(command) {
        if (
            command.type !== this.type ||
            command.payload.property !== this.payload.property ||
            command.payload.sessionId !== this.payload.sessionId
        ) {
            return false;
        }
        this.payload.after = command.payload.after;
        return true;
    }
}

export default SetLevelSettingCommand;
