import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';
import { createKeyboardEventFixture } from './testFixtures.js';

const { KeyboardInputAction } = await import('../js/inputActions.js');

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
