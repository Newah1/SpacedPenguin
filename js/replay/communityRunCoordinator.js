import { createIdempotencyKey } from '../catalog/communityLevelClient.js';
import { calculateCommunityScore } from './communityScore.js';
import { RunTranscriptRecorder } from './runTranscript.js';

export class CommunityRunCoordinator {
    constructor(game, client = null) {
        this.game = game;
        this.client = client;
        this.runTick = 0;
        this.recorder = null;
        this.completedRun = null;
        this.recordedLevel = null;
        this.pendingScoreSubmission = null;
    }

    activeClient() {
        return this.client || this.game.communityLevelClient || null;
    }

    begin(levelDefinition = null) {
        this.runTick = 0;
        this.recorder = new RunTranscriptRecorder();
        this.completedRun = null;
        this.pendingScoreSubmission = null;
        const definition = levelDefinition || (this.game.penguin && this.game.target && this.game.slingshot
            ? this.game.exportCurrentLevel()
            : null);
        this.recordedLevel = definition ? structuredClone(definition) : null;
        this.game.levelEditor?.updatePublishAvailability?.();
        this.game.invalidateSimulationState();
    }

    invalidate() {
        this.recorder = null;
        this.completedRun = null;
        this.recordedLevel = null;
        this.pendingScoreSubmission = null;
        this.game.levelEditor?.updatePublishAvailability?.();
    }

    recordLaunch(angle, power) {
        if (!this.recorder) this.begin();
        this.recorder.recordLaunch(this.runTick, angle, power);
    }

    recordRetry() {
        if (!this.recorder || this.recorder.actions.length === 0) return;
        this.recorder.recordRetry(this.runTick);
    }

    complete() {
        if (!this.recorder || this.recorder.actions.length === 0) return null;
        this.completedRun = {
            proof: this.recorder.freeze(),
            level: structuredClone(this.recordedLevel || this.game.exportCurrentLevel())
        };
        this.game.levelEditor?.updatePublishAvailability?.();
        return this.completedRun;
    }

    isCommunityLevel() {
        return this.game.levelMetadata?.catalogReference?.source === 'community';
    }

    currentScore() {
        return calculateCommunityScore({
            distance: this.game.distance,
            tries: this.game.tries,
            bonusScore: this.game.currentAttemptScore,
            multiplier: this.game.levelRules?.scoreMultiplier ?? 1
        });
    }

    async publishEditedLevel() {
        const client = this.activeClient();
        if (!client) throw new Error('No community level server is configured.');
        if (!this.completedRun) throw new Error('Complete this exact level in Play Mode before publishing it.');
        const level = this.game.levelEditor?.mode === 'play'
            ? structuredClone(this.completedRun.level)
            : this.game.levelEditor?.currentDocumentDefinition?.() || this.game.exportCurrentLevel();
        if (JSON.stringify(level) !== JSON.stringify(this.completedRun.level)) {
            this.completedRun = null;
            throw new Error('The level changed after it was completed. Complete it again before publishing.');
        }
        const result = await client.publishLevel(level, this.completedRun.proof);
        const published = result.item || result;
        this.game.levelMetadata.catalogReference = { id: published.id, source: 'community' };
        return published;
    }

    getInitials() {
        const storage = typeof localStorage === 'undefined' ? null : localStorage;
        return storage?.getItem('spacedPenguinCommunityInitials') || '';
    }

    async offerScoreUpload(initials) {
        if (!this.activeClient() || !this.isCommunityLevel() || !this.completedRun) return null;
        const storage = typeof localStorage === 'undefined' ? null : localStorage;
        const normalizedInitials = String(initials || '').trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(normalizedInitials)) throw new Error('Initials must be exactly three letters.');
        storage?.setItem('spacedPenguinCommunityInitials', normalizedInitials);
        const score = this.currentScore();
        this.pendingScoreSubmission = {
            levelId: this.game.levelMetadata.catalogReference.id,
            initials: normalizedInitials,
            claimedScore: score.score,
            proof: this.completedRun.proof,
            idempotencyKey: createIdempotencyKey()
        };
        return this.submitPendingScore();
    }

    async submitPendingScore() {
        const submission = this.pendingScoreSubmission;
        const client = this.activeClient();
        if (!submission || !client) return null;
        const response = await client.submitScore(submission.levelId, submission);
        this.pendingScoreSubmission = null;
        return response;
    }
}

export default CommunityRunCoordinator;
