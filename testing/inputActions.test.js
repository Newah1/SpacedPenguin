import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';
import { createKeyboardEventFixture } from './testFixtures.js';

const { KeyboardInputAction, UIInputAction } = await import('../js/inputActions.js');

test('blocking canvas screens stop clicks before menu handling', () => {
    let canvasClickStopped = false;
    const action = new UIInputAction({
        game: {
            uiManager: {
                activeScreens: [{}],
                handleClick: () => true
            }
        }
    });
    const event = {
        preventDefault() {},
        stopImmediatePropagation() {
            canvasClickStopped = true;
        }
    };

    action.handleClick(event);

    assert.equal(event.__spacedPenguinUiHandled, true);
    assert.equal(canvasClickStopped, true);
});

test('Q routes gameplay quit through the Game quit dialog', () => {
    let quitDialogCalls = 0;
    const game = {
        showQuitDialog: () => quitDialogCalls++
    };
    const action = new KeyboardInputAction({ game });
    const event = createKeyboardEventFixture('KeyQ');

    action.handleGameplayKeys(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(quitDialogCalls, 1);
});

test('Escape opens the return-to-menu confirmation during gameplay', () => {
    let quitDialogCalls = 0;
    const game = {
        state: 'playing',
        uiManager: { handleKeyPress: () => false },
        showQuitDialog: () => quitDialogCalls++
    };
    const action = new KeyboardInputAction({ game });
    const event = createKeyboardEventFixture('Escape');

    action.handleKeyDown(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(quitDialogCalls, 1);
});

test('active modal input does not leak into gameplay shortcuts', () => {
    let quitDialogCalls = 0;
    const game = {
        state: 'playing',
        uiManager: { handleKeyPress: () => true },
        showQuitDialog: () => quitDialogCalls++
    };
    const action = new KeyboardInputAction({ game });
    const event = createKeyboardEventFixture('Escape');

    action.handleKeyDown(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(quitDialogCalls, 0);
});

test('Backquote toggles the console while playing regardless of key value', () => {
    let toggleCalls = 0;
    const game = {
        state: 'playing',
        console: {
            visible: false,
            toggle: () => toggleCalls++
        }
    };
    const action = new KeyboardInputAction({ game });
    const event = createKeyboardEventFixture('Backquote');
    event.key = 'Dead';

    action.handleKeyDown(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(toggleCalls, 1);
});

test('Backquote closes the console through the same global shortcut', () => {
    let toggleCalls = 0;
    const game = {
        state: 'playing',
        console: {
            visible: true,
            toggle: () => toggleCalls++
        }
    };
    const action = new KeyboardInputAction({ game });
    const event = createKeyboardEventFixture('Backquote');

    action.handleKeyDown(event);

    assert.equal(toggleCalls, 1);
});
