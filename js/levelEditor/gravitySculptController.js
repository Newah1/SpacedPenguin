import { GameState } from '../game.js';
import { EDITOR_CONFIG } from '../config/editorConfig.js';
import { captureGameSimulationState } from '../gameSimulationAdapter.js';
import { solveGravitySculpt } from '../gravitySculptor.js';
import { LiveEditCommandType } from '../editorCommands/index.js';

const INITIAL_STATE = Object.freeze({
    active: false,
    drawing: false,
    strokeActive: false,
    path: [],
    preview: [],
    result: null,
    candidateIndex: 0,
    testSession: null,
    lastSeed: null,
    solveToken: 0
});

function freshState() {
    return structuredClone(INITIAL_STATE);
}

function randomSeed(previousSeed) {
    let seed;
    do {
        if (globalThis.crypto?.getRandomValues) {
            seed = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
        } else {
            seed = Math.floor(Math.random() * 0x100000000) >>> 0;
        }
    } while (seed === previousSeed);
    return seed;
}

export default class GravitySculptController {
    constructor(editor) {
        this.editor = editor;
        this.state = freshState();
    }

    get game() { return this.editor.game; }
    get view() { return this.editor.gravitySculptView; }

    toggle() {
        if (this.editor.mode !== 'edit') return;
        if (this.state.active) this.close();
        else {
            this.state.active = true;
            this.view.open();
        }
    }

    close() {
        if (this.state.testSession) this.finishTest(false);
        const solveToken = this.state.solveToken + 1;
        Object.assign(this.state, freshState(), { solveToken });
        this.view.close();
    }

    beginWaypointEntry() {
        if (!this.state.active) return;
        const start = this.game.slingshot?.anchor || this.game.slingshot?.position || {
            x: this.game.penguin.x,
            y: this.game.penguin.y
        };
        Object.assign(this.state, {
            drawing: true,
            strokeActive: false,
            path: [{ ...start }],
            preview: [],
            result: null,
            candidateIndex: 0
        });
        this.view.setPhase('drawing');
    }

    toggleWaypointEntry() {
        if (this.state.drawing) this.finishWaypointEntry();
        else this.beginWaypointEntry();
    }

    addWaypoint(position) {
        if (!this.state.drawing) return;
        const last = this.state.path.at(-1);
        const farEnough = !last || Math.hypot(position.x - last.x, position.y - last.y) >=
            EDITOR_CONFIG.gravitySculpt.waypointMinimumSpacing;
        if (!farEnough) return;
        this.state.path.push({ ...position });
        const count = this.state.path.length - 1;
        this.view.setPhase('drawing', `${count} waypoint${count === 1 ? '' : 's'}`);
    }

    finishWaypointEntry() {
        if (!this.state.drawing) return;
        this.state.strokeActive = false;
        this.state.drawing = false;
        this.view.setPhase(this.state.path.length > 1 ? 'ready' : 'empty');
    }

    async solve() {
        const selections = this.view.selections();
        const validationError = this.validateSelections(selections);
        if (validationError) {
            this.view.setPhase('error', validationError);
            return;
        }
        const token = ++this.state.solveToken;
        const seed = randomSeed(this.state.lastSeed);
        this.state.lastSeed = seed;
        this.view.setPhase('solving', '0%');
        try {
            const result = await solveGravitySculpt({
                state: captureGameSimulationState(this.game),
                desiredPath: this.state.path,
                planetIndices: selections.planetIndices,
                options: { ...EDITOR_CONFIG.gravitySculpt, ...selections, seed },
                onProgress: progress => this.reportProgress(token, progress)
            });
            if (token !== this.state.solveToken) return;
            this.state.result = result;
            this.state.candidateIndex = 0;
            this.showCandidate(0);
        } catch (error) {
            if (token === this.state.solveToken) {
                this.view.setPhase('error', error.message || 'The solver could not produce a candidate.');
            }
        }
    }

    validateSelections(selections) {
        if (selections.planetIndices.length === 0) return 'Select at least one stationary planet.';
        if (!selections.adjustPosition && !selections.adjustMass && !selections.adjustLaunch) {
            return 'Enable planet or launch adjustment.';
        }
        return null;
    }

    reportProgress(token, progress) {
        if (token !== this.state.solveToken) return;
        const percent = Math.round(progress.generation / progress.total * 100);
        this.view.setPhase(
            'solving',
            `${progress.stage} ${percent}% · ${progress.evaluations} simulations`
        );
    }

    showCandidate(index) {
        const candidates = this.state.result?.candidates;
        if (!candidates?.length) return;
        this.state.candidateIndex = (index + candidates.length) % candidates.length;
        const candidate = candidates[this.state.candidateIndex];
        this.state.preview = candidate.trajectory;
        this.view.showCandidate(this.state.candidateIndex, candidates.length, candidate);
    }

    cycleCandidate(direction) {
        this.showCandidate(this.state.candidateIndex + direction);
    }

    activeCandidate() {
        const result = this.state.result;
        return result?.candidates?.[this.state.candidateIndex] || result || null;
    }

    createAdjustmentBatch(candidate) {
        const adjustments = (candidate?.adjustments || []).flatMap(adjustment => {
            const object = this.game.planets[adjustment.index];
            if (!object) return [];
            return [{
                objectId: object.id,
                position: { ...adjustment.position },
                mass: adjustment.mass
            }];
        });
        return { adjustments };
    }

    testCandidate() {
        const candidate = this.activeCandidate();
        if (!candidate?.launch || this.state.testSession) return;
        const batch = this.createAdjustmentBatch(candidate);
        this.state.testSession = { candidate, batch };
        const candidateDefinition = this.editor.documentMutations.applyPlanetAdjustments(
            this.editor.currentDocumentDefinition(),
            batch.adjustments
        );
        if (!candidateDefinition) return;
        this.editor.runtimeProjector.rebuild(candidateDefinition);
        this.editor.mode = 'play';
        this.editor.updateModeButton();
        this.editor.selectObject(null);
        this.game.uiManager?.closeAllScreens?.();
        this.game.tryAgain();
        this.game.setState?.(GameState.LEVEL_EDITOR);
        this.view.setTestMode(
            true,
            `Testing ${candidate.launch.angleDegrees.toFixed(1)}° at ` +
            `${candidate.launch.pullbackPower.toFixed(0)} power. Accept or restore when ready.`
        );
        this.game.launchPenguin(
            candidate.launch.velocity,
            { angle: candidate.launch.angleDegrees, power: candidate.launch.pullbackPower }
        );
    }

    finishTest(accept) {
        const session = this.state.testSession;
        if (!session) return;
        this.state.testSession = null;
        this.editor.mode = 'edit';
        this.editor.rebuildDocumentProjection();
        if (accept) this.editor.commandBus.execute(LiveEditCommandType.ADJUST_PLANETS, session.batch);
        this.game.uiManager?.closeAllScreens?.();
        this.game.setState?.(GameState.LEVEL_EDITOR);
        this.game.resetPenguinToSlingshot?.();
        this.game.physics?.clearTrace?.();
        this.editor.updateModeButton();
        this.view.setTestMode(false);
        this.showCandidate(this.state.candidateIndex);
        this.game.updateUI?.();
    }

    isTesting() {
        return Boolean(this.state.testSession);
    }

    onTestTargetHit() {
        if (!this.state.testSession) return;
        this.view.setTestMode(
            true,
            'Target reached during the candidate test. Accept this layout or restore the editor snapshot.'
        );
    }

    applyCandidate() {
        const candidate = this.activeCandidate();
        if (!candidate) return;
        const batch = this.createAdjustmentBatch(candidate);
        if (this.editor.commandBus.execute(LiveEditCommandType.ADJUST_PLANETS, batch)) this.close();
    }
}
