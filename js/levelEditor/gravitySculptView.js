import { makeDraggablePanel } from './draggablePanel.js';

import { EDITOR_CONFIG } from '../config/editorConfig.js';

const BUTTON_STYLE = `
    padding: 8px 12px; color: white; border: 0; border-radius: 5px;
    cursor: pointer; min-height: 38px; font-size: 13px;
`;

function button(label, color, action) {
    const element = document.createElement('button');
    element.textContent = label;
    element.style.cssText = `${BUTTON_STYLE} background: ${color};`;
    element.addEventListener('click', action);
    return element;
}

function checkbox(label, checked = true) {
    const wrapper = document.createElement('label');
    wrapper.style.cssText = 'display:flex; gap:7px; align-items:center; cursor:pointer;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    wrapper.append(input, document.createTextNode(label));
    return { wrapper, input };
}

export class GravitySculptView {
    constructor(editor) {
        this.editor = editor;
        this.planetInputs = [];
    }

    createElement() {
        this.panel = document.createElement('div');
        this.panel.id = 'gravity-sculpt-panel';
        this.panel.style.cssText = `
            position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
            width: min(560px, calc(100vw - 24px)); max-height: 48vh; overflow-y: auto;
            box-sizing: border-box; display: none; padding: 14px; border-radius: 8px;
            color: white; background: rgba(8, 12, 20, 0.96); border: 1px solid #ff9800;
            box-shadow: 0 5px 20px rgba(0,0,0,.65); font: 13px Arial, sans-serif;
            pointer-events: auto; z-index: 1005;
        `;
        const heading = document.createElement('div');
        heading.textContent = 'Gravity Sculpt  [drag]';
        heading.dataset.editorDragHandle = '';
        heading.title = 'Drag to move';
        heading.style.cssText = 'font-size:18px; font-weight:bold; color:#ffad33; margin-bottom:5px; cursor:grab; touch-action:none; user-select:none;';
        this.status = document.createElement('div');
        this.status.style.cssText = 'margin-bottom:10px; color:#d8e6ff; line-height:1.35;';
        this.options = document.createElement('div');
        this.options.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px 14px; margin-bottom:10px;';
        const position = checkbox('Adjust positions');
        const mass = checkbox('Adjust gravity / mass');
        const launch = checkbox('Optimize launch angle / power');
        this.adjustPosition = position.input;
        this.adjustMass = mass.input;
        this.adjustLaunch = launch.input;
        this.options.append(position.wrapper, mass.wrapper, launch.wrapper);
        const toleranceLabel = document.createElement('label');
        toleranceLabel.style.cssText = 'grid-column:1 / -1; display:grid; grid-template-columns:auto 1fr auto; gap:8px; align-items:center;';
        const toleranceText = document.createElement('span');
        toleranceText.textContent = 'Waypoint tolerance';
        this.checkpointTolerance = document.createElement('input');
        this.checkpointTolerance.type = 'range';
        this.checkpointTolerance.min = String(EDITOR_CONFIG.gravitySculpt.checkpointToleranceRange.minimum);
        this.checkpointTolerance.max = String(EDITOR_CONFIG.gravitySculpt.checkpointToleranceRange.maximum);
        this.checkpointTolerance.step = String(EDITOR_CONFIG.gravitySculpt.checkpointToleranceRange.step);
        this.checkpointTolerance.value = String(EDITOR_CONFIG.gravitySculpt.checkpointTolerance);
        this.toleranceValue = document.createElement('span');
        this.toleranceValue.textContent = `${this.checkpointTolerance.value}px`;
        this.checkpointTolerance.addEventListener('input', () => {
            this.toleranceValue.textContent = `${this.checkpointTolerance.value}px`;
        });
        toleranceLabel.append(toleranceText, this.checkpointTolerance, this.toleranceValue);
        this.options.appendChild(toleranceLabel);
        const budgetLabel = document.createElement('label');
        budgetLabel.style.cssText = 'grid-column:1 / -1; display:grid; grid-template-columns:auto 1fr auto; gap:8px; align-items:center;';
        const budgetText = document.createElement('span');
        budgetText.textContent = 'Search budget';
        this.budgetMultiplier = document.createElement('input');
        this.budgetMultiplier.type = 'range';
        this.budgetMultiplier.min = String(EDITOR_CONFIG.gravitySculpt.budgetMultiplierRange.minimum);
        this.budgetMultiplier.max = String(EDITOR_CONFIG.gravitySculpt.budgetMultiplierRange.maximum);
        this.budgetMultiplier.step = String(EDITOR_CONFIG.gravitySculpt.budgetMultiplierRange.step);
        this.budgetMultiplier.value = String(EDITOR_CONFIG.gravitySculpt.budgetMultiplier);
        this.budgetValue = document.createElement('span');
        this.budgetValue.style.cssText = 'min-width:82px; text-align:right; color:#ffcf80;';
        const updateBudgetValue = () => {
            const multiplier = Number(this.budgetMultiplier.value);
            this.budgetValue.textContent = `${multiplier.toFixed(2).replace(/\.00$/, '')}× (~${(multiplier ** 2).toFixed(2).replace(/\.00$/, '')}× time)`;
        };
        this.budgetMultiplier.addEventListener('input', updateBudgetValue);
        updateBudgetValue();
        budgetLabel.title = 'Scales every optimization population and generation count. Runtime grows approximately with the square of this value.';
        budgetLabel.append(budgetText, this.budgetMultiplier, this.budgetValue);
        this.options.appendChild(budgetLabel);
        this.goals = document.createElement('div');
        this.goals.style.cssText = 'border-top:1px solid rgba(255,255,255,.18); padding-top:8px; margin-top:4px;';
        const goalsHeading = document.createElement('div');
        goalsHeading.textContent = 'Hard gameplay goals';
        goalsHeading.style.cssText = 'font-weight:bold; margin-bottom:6px; color:#ffcf80;';
        this.goalOptions = document.createElement('div');
        this.goalOptions.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px 14px;';
        const targetGoal = checkbox('Must reach target');
        const collisionGoal = checkbox('No planet collisions');
        const boundsGoal = checkbox('Stay in bounds');
        this.requireTarget = targetGoal.input;
        this.avoidPlanetCollisions = collisionGoal.input;
        this.stayInBounds = boundsGoal.input;
        this.goalOptions.append(targetGoal.wrapper, collisionGoal.wrapper, boundsGoal.wrapper);
        const timeLabel = document.createElement('label');
        timeLabel.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:7px;';
        timeLabel.append(document.createTextNode('Max flight seconds (0 = off)'));
        this.maxFlightSeconds = document.createElement('input');
        this.maxFlightSeconds.type = 'number';
        this.maxFlightSeconds.min = '0';
        this.maxFlightSeconds.step = '0.5';
        this.maxFlightSeconds.value = '0';
        this.maxFlightSeconds.style.cssText = 'width:65px;';
        timeLabel.appendChild(this.maxFlightSeconds);
        this.bonusGoals = document.createElement('div');
        this.bonusGoals.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px 14px; margin-top:7px;';
        this.goals.append(goalsHeading, this.goalOptions, timeLabel, this.bonusGoals);
        this.planets = document.createElement('div');
        this.planets.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px 14px; margin:8px 0 12px;';
        this.actions = document.createElement('div');
        this.actions.style.cssText = 'display:flex; flex-wrap:wrap; gap:7px;';
        this.drawButton = button('Set Waypoints', '#2196f3', () => this.editor.gravitySculptController.toggleWaypointEntry());
        this.solveButton = button('Solve', '#4caf50', () => this.editor.gravitySculptController.solve());
        this.testButton = button('Test Candidate', '#7c4dff', () => this.editor.gravitySculptController.testCandidate());
        this.applyButton = button('Apply Candidate', '#ff9800', () => this.editor.gravitySculptController.applyCandidate());
        this.cancelButton = button('Close', '#667085', () => this.editor.gravitySculptController.close());
        this.actions.append(this.drawButton, this.solveButton, this.testButton, this.applyButton, this.cancelButton);
        this.testActions = document.createElement('div');
        this.testActions.style.cssText = 'display:none; flex-wrap:wrap; gap:8px;';
        this.acceptTestButton = button('Accept Tested Layout', '#4caf50', () => this.editor.gravitySculptController.finishTest(true));
        this.rejectTestButton = button('Reject & Restore', '#d04444', () => this.editor.gravitySculptController.finishTest(false));
        this.testActions.append(this.acceptTestButton, this.rejectTestButton);
        this.candidateControls = document.createElement('div');
        this.candidateControls.style.cssText = 'display:none; align-items:center; gap:8px; margin:0 0 10px;';
        this.previousCandidate = button('Previous', '#44546a', () => this.editor.gravitySculptController.cycleCandidate(-1));
        this.nextCandidate = button('Next', '#44546a', () => this.editor.gravitySculptController.cycleCandidate(1));
        this.candidateLabel = document.createElement('span');
        this.candidateLabel.style.cssText = 'font-weight:bold; color:#59e6ff; min-width:100px; text-align:center;';
        this.candidateControls.append(this.previousCandidate, this.candidateLabel, this.nextCandidate);
        this.panel.append(
            heading,
            this.status,
            this.options,
            this.goals,
            this.planets,
            this.candidateControls,
            this.actions,
            this.testActions
        );
        this.dragController = makeDraggablePanel(this.panel, { handleSelector: '[data-editor-drag-handle]' });
        this.setPhase('empty');
        return this.panel;
    }

    open() {
        this.panel.style.display = 'block';
        this.dragController?.clampToViewport();
        this.populatePlanets();
        this.populateBonusGoals();
        this.setPhase(this.editor.gravitySculptController.state.path.length > 1 ? 'ready' : 'empty');
    }

    close() {
        this.panel.style.display = 'none';
    }

    populatePlanets() {
        this.planets.replaceChildren();
        this.planetInputs = this.editor.game.planets.map((planet, index) => {
            const orbiting = Boolean(planet.orbitSystem?.orbitTargetId ||
                (planet.orbitSystem?.orbitCenter && planet.orbitSystem?.orbitRadius > 0));
            const item = checkbox(orbiting ? `${planet.name || `Planet ${index + 1}`} (orbit locked)` : (planet.name || `Planet ${index + 1}`), !orbiting);
            item.input.disabled = orbiting;
            item.input.dataset.planetIndex = String(index);
            if (orbiting) item.wrapper.style.opacity = '0.5';
            this.planets.appendChild(item.wrapper);
            return item.input;
        });
    }

    populateBonusGoals() {
        this.bonusGoals.replaceChildren();
        this.bonusInputs = this.editor.game.bonuses.map((bonus, index) => {
            const item = checkbox(`Require ${bonus.name || `Bonus ${index + 1}`}`, false);
            item.input.dataset.bonusIndex = String(index);
            this.bonusGoals.appendChild(item.wrapper);
            return item.input;
        });
        if (this.bonusInputs.length === 0) {
            const empty = document.createElement('span');
            empty.textContent = 'No bonuses in this level';
            empty.style.opacity = '0.55';
            this.bonusGoals.appendChild(empty);
        }
    }

    selections() {
        return {
            planetIndices: this.planetInputs
                .filter(input => input.checked && !input.disabled)
                .map(input => Number(input.dataset.planetIndex)),
            adjustPosition: this.adjustPosition.checked,
            adjustMass: this.adjustMass.checked,
            adjustLaunch: this.adjustLaunch.checked,
            checkpointTolerance: Number(this.checkpointTolerance.value),
            budgetMultiplier: Number(this.budgetMultiplier.value),
            goals: {
                requireTarget: this.requireTarget.checked,
                avoidPlanetCollisions: this.avoidPlanetCollisions.checked,
                stayInBounds: this.stayInBounds.checked,
                requiredBonusIndices: (this.bonusInputs || [])
                    .filter(input => input.checked)
                    .map(input => Number(input.dataset.bonusIndex)),
                maxFlightSeconds: Number(this.maxFlightSeconds.value) > 0
                    ? Number(this.maxFlightSeconds.value)
                    : null
            }
        };
    }

    showCandidate(index, count, candidate) {
        this.candidateControls.style.display = count > 1 ? 'flex' : 'none';
        this.candidateLabel.textContent = `Candidate ${index + 1} / ${count}`;
        const coverage = Math.round(candidate.checkpointCoverage * 100);
        const robustCoverage = Math.round((candidate.robustCheckpointCoverage ?? candidate.checkpointCoverage) * 100);
        const robustGoals = Math.round((candidate.robustGoalSuccessRate ??
            (candidate.constraintViolations?.length ? 0 : 1)) * 100);
        const constraintNames = {
            target: 'reach target',
            planet_collision: 'avoid planet collisions',
            out_of_bounds: 'stay in bounds',
            time_limit: 'flight time limit'
        };
        const constraints = candidate.constraintViolations?.length
            ? ` Unmet: ${candidate.constraintViolations.map(value =>
                constraintNames[value] || value.replace(/^bonus_(\d+)$/, (_match, index) => `collect Bonus ${Number(index) + 1}`)
            ).join(', ')}.`
            : ' All hard goals met.';
        const missed = candidate.missedWaypointCount
            ? ` ${candidate.missedWaypointCount} required waypoint${candidate.missedWaypointCount === 1 ? '' : 's'} missed.`
            : ' Every required waypoint reached.';
        const launch = candidate.launch
            ? ` Launch ${candidate.launch.angleDegrees.toFixed(1)}° at ${candidate.launch.pullbackPower.toFixed(0)} power.`
            : '';
        const comfort = Number.isFinite(candidate.pathEfficiency)
            ? ` Route ${candidate.pathEfficiency.toFixed(2)}× minimum; peak gravity ` +
                `${candidate.peakGravityAcceleration.toFixed(0)}. Flight time is not scored.`
            : '';
        this.setPhase(
            'result',
            `${coverage}% central / ${robustCoverage}% robust waypoint coverage; ` +
            `${robustGoals}% nearby launches satisfy hard goals.${missed}${constraints}${comfort}${launch}`
        );
        this.testButton.disabled = !candidate.launch;
    }

    setTestMode(testing, message = '') {
        this.actions.style.display = testing ? 'none' : 'flex';
        this.candidateControls.style.display = testing ? 'none' : this.candidateControls.style.display;
        this.testActions.style.display = testing ? 'flex' : 'none';
        if (testing) {
            this.status.textContent = message ||
                'Testing with the exact recommended launch. Accept the layout or restore the editor snapshot.';
        }
    }

    setPhase(phase, detail = '') {
        const messages = {
            empty: 'Choose planets, then set ordered waypoints for the flight to approach.',
            drawing: `Click the playfield to add numbered waypoints, then click Done Adding.${detail ? ` ${detail} set.` : ''}`,
            ready: 'Waypoints captured. The solver is free to invent the arcs between them.',
            solving: `Running staged trajectory optimization… ${detail}`,
            result: `Candidate ready. ${detail}`,
            error: detail
        };
        this.status.textContent = messages[phase] || detail;
        this.solveButton.disabled = this.editor.gravitySculptController.state.path.length < 2 ||
            ['empty', 'drawing', 'solving'].includes(phase);
        this.applyButton.disabled = phase !== 'result';
        this.testButton.disabled = phase !== 'result';
        this.drawButton.disabled = phase === 'solving';
        this.drawButton.textContent = phase === 'drawing' ? 'Done Adding' : 'Set Waypoints';
        this.solveButton.textContent = phase === 'solving'
            ? 'Solving…'
            : (this.editor.gravitySculptController.state.result ? 'Reroll' : 'Solve');
        if (phase !== 'result') this.candidateControls.style.display = 'none';
    }
}

export default GravitySculptView;
