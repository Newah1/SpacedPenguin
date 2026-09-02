import { Bonus as CoreBonus } from './gameObjects.js';

// Preserve the original Director presentation: a collected bonus switches to
// its hit sprite and keeps animating until the attempt resets. The core Bonus
// class currently treats `collected` as a visibility guard, so temporarily
// clear only that presentation guard while delegating to its existing drawing
// and animation behavior. Gameplay state remains collected throughout.
export class Bonus extends CoreBonus {
    update(deltaTime, options = {}) {
        this.withPresentationVisible(() => super.update(deltaTime, options));
    }

    drawSprite(ctx) {
        this.withPresentationVisible(() => super.drawSprite(ctx));
    }

    withPresentationVisible(callback) {
        const collected = this.collected;
        if (collected) this.collected = false;
        try {
            return callback();
        } finally {
            this.collected = collected;
        }
    }
}
