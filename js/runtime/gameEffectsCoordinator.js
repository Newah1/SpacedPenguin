import { AudioCue, getAudioCue } from '../config/audioConfig.js';

/** Translates deterministic domain events into browser-only effects. */
export class GameEffectsCoordinator {
    constructor(game) {
        this.game = game;
    }

    penguinMoved(event, deltaTime) {
        const game = this.game;
        game.penguin.update(event.deltaTime ?? deltaTime, false);
        game.recordPathPoint(game.penguin.x, game.penguin.y);
    }

    bonusCollected(event, bonus) {
        const game = this.game;
        game.playSound(getAudioCue(AudioCue.BONUS).soundId);
        if (bonus && game.bonusPopup) game.bonusPopup.show(event.value, bonus.position);
    }

    planetCollision(_event, planet) {
        const game = this.game;
        game.penguin.beginCrash(planet, false);
        game.playSound(getAudioCue(AudioCue.HIT_PLANET).soundId);
        game.endRecordingShotPath();
        game.preserveCrashedPenguin();
        game.tryAgain({ recordAction: false });
    }

    planetBounce() {
        this.game.playSound(getAudioCue(AudioCue.HIT_PLANET).soundId);
    }

    portalTeleported(event) {
        const game = this.game;
        if (event.playSound) game.playSound(getAudioCue(AudioCue.PORTAL_WOOSH).soundId);
        game.beginPortalTransition?.(event);
        game.recordPortalTransit?.(event.entryPosition, event.exitPosition);
        game.penguin.markTrailDiscontinuity?.(event.exitPosition);
    }

    speedBoosterActivated(event) {
        if (event.playSound) this.game.playSound(getAudioCue(AudioCue.SPEED_BOOSTER_WOOSH).soundId);
    }

    targetHit() {
        const game = this.game;
        game.endRecordingShotPath();
        game.target.onHit();
        game.handleTargetHit();
    }

    targetBlocked(event) {
        this.game.endRecordingShotPath();
        this.game.showMessage(`Collect ${event.remaining} more bonuses!`);
    }

    outOfBounds() {
        this.game.endRecordingShotPath();
    }

    attemptResetRequired() {
        this.game.tryAgain({ recordAction: false });
    }

    ruleFailure(event) {
        this.game.showMessage(event.reason);
        this.game.setState('gameOver');
    }
}

export default GameEffectsCoordinator;
