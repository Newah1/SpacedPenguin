import RuntimeObjectMembership from './runtimeObjectMembership.js';

/**
 * Owns structural edits to the running level through RuntimeWorld.
 */
export class LiveLevelMutator {
    constructor(game) {
        this.game = game;
        this.membership = game.runtimeWorld?.().membership || new RuntimeObjectMembership(game);
    }

    addObject(object, identity) {
        if (!object) return false;
        return this.membership.add(object, identity);
    }

    removeObject(object, identity) {
        if (!object) return false;
        return this.membership.remove(object, identity);
    }

    getSingleton(className) {
        return this.membership.getSingleton(className);
    }
}

export default LiveLevelMutator;
