import RuntimeObjectMembership from './runtimeObjectMembership.js';

/**
 * Owns structural edits to the running level. The live Game remains the source
 * of truth; this class only keeps its render, type-specific, singleton, and
 * physics collections in sync.
 */
export class LiveLevelMutator {
    constructor(game) {
        this.game = game;
        this.membership = new RuntimeObjectMembership(game);
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
