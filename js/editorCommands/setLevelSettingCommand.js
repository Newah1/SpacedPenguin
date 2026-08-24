import LiveEditCommand from './liveEditCommand.js';

export class SetLevelSettingCommand extends LiveEditCommand {
    static type = 'level-setting.set';

    do() {
        if (!this.payload.before) {
            this.payload.before = this.context.captureLevelSettingsState();
            this.context.applyLevelSetting(this.payload.property, this.payload.value);
            this.payload.after = this.context.captureLevelSettingsState();
        } else {
            this.context.restoreLevelSettingsState(this.payload.after);
        }
        this.context.refresh(this.context.levelSettingsTarget || this.payload.target);
        return true;
    }

    undo() {
        this.context.restoreLevelSettingsState(this.payload.before);
        this.context.refresh(this.context.levelSettingsTarget || this.payload.target);
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
