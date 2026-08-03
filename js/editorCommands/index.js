import AddObjectCommand from './addObjectCommand.js';
import CommandHistory from './commandHistory.js';
import CommandRegistry from './commandRegistry.js';
import MoveObjectCommand from './moveObjectCommand.js';
import MoveOrbitCenterCommand from './moveOrbitCenterCommand.js';
import RemoveObjectCommand from './removeObjectCommand.js';

export const LiveEditCommandType = Object.freeze({
    ADD_OBJECT: AddObjectCommand.type,
    REMOVE_OBJECT: RemoveObjectCommand.type,
    MOVE_OBJECT: MoveObjectCommand.type,
    MOVE_ORBIT_CENTER: MoveOrbitCenterCommand.type
});

export const liveEditCommandRegistry = new CommandRegistry([
    AddObjectCommand,
    RemoveObjectCommand,
    MoveObjectCommand,
    MoveOrbitCenterCommand
]);

export function createLiveEditHistory(context, limit) {
    return new CommandHistory(liveEditCommandRegistry, context, limit);
}

export {
    AddObjectCommand,
    CommandHistory,
    CommandRegistry,
    MoveObjectCommand,
    MoveOrbitCenterCommand,
    RemoveObjectCommand
};
