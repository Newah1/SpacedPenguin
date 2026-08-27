import LiveEditCommand from './liveEditCommand.js';

export class SetLevelSettingCommand extends LiveEditCommand {
    static type = 'level-setting.set';

    do() {
        this.payload.beforeDefinition ||= this.context.documentDefinition();
        this.payload.afterDefinition ||= this.context.mutateLevelSetting(
            this.payload.beforeDefinition,
            this.payload.property,
            this.payload.value
        );
        if (!this.payload.afterDefinition ||
            !this.context.applyDocumentDefinition(this.payload.afterDefinition)) return false;
        this.context.refresh(this.context.levelSettingsTarget);
        return true;
    }

    undo() {
        if (!this.context.applyDocumentDefinition(this.payload.beforeDefinition)) return false;
        this.context.refresh(this.context.levelSettingsTarget);
        return true;
    }

    mergeWith(command) {
        if (
            command.type !== this.type ||
            command.payload.property !== this.payload.property ||
            command.payload.sessionId !== this.payload.sessionId
        ) return false;
        this.payload.afterDefinition = command.payload.afterDefinition;
        return true;
    }
}

export default SetLevelSettingCommand;
