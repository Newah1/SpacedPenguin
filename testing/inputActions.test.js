import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';
import { InputManager } from '../js/input/inputManager.js';
import { InputPriority } from '../js/input/inputPriorities.js';
import { InputResponse, InputResult, normalizeInputResponse } from '../js/input/inputResult.js';
import { InputType } from '../js/input/inputTypes.js';
import { registerDefaultInputContexts } from '../js/input/registerDefaultInputContexts.js';
import { EditorInputContext } from '../js/input/contexts/editorInputContext.js';
import { GameplayInputContext } from '../js/input/contexts/gameplayInputContext.js';
import { MenuInputContext } from '../js/input/contexts/menuInputContext.js';
import { WindowInputContext } from '../js/input/contexts/windowInputContext.js';
import { createEventTargetFixture, createKeyboardEventFixture } from './testFixtures.js';

function recordingTarget() {
    const added = [];
    const removed = [];
    return {
        added,
        removed,
        addEventListener(type, handler, options) { added.push({ type, handler, options }); },
        removeEventListener(type, handler, options) { removed.push({ type, handler, options }); }
    };
}

function event(code = '') {
    return {
        ...createKeyboardEventFixture(code),
        stopPropagationCalls: 0,
        stopImmediatePropagationCalls: 0,
        stopPropagation() { this.stopPropagationCalls++; },
        stopImmediatePropagation() { this.stopImmediatePropagationCalls++; }
    };
}

function managerFixture(rootOverrides = {}) {
    const canvas = recordingTarget();
    const document = recordingTarget();
    const window = recordingTarget();
    const root = { canvas, ...rootOverrides };
    return { root, canvas, document, window, manager: new InputManager(root, { document, window }) };
}

test('manager installs one generic listener per DOM input type and removes the same listeners', () => {
    const { manager, canvas, document, window } = managerFixture();
    assert.equal(canvas.added.length, 13);
    assert.deepEqual(document.added.map(entry => entry.type), ['keydown', 'keyup']);
    assert.deepEqual(window.added.map(entry => entry.type), ['resize', 'orientationchange']);
    assert.equal(canvas.added.find(entry => entry.type === 'wheel').options.passive, false);
    document.added.find(entry => entry.type === 'keydown').handler(event('KeyA'));
    manager.destroy();
    assert.equal(canvas.removed.length, canvas.added.length);
    assert.equal(document.removed.length, document.added.length);
    assert.equal(window.removed.length, window.added.length);
});

test('registration validates context contracts and rejects duplicate ids', () => {
    const { manager } = managerFixture();
    assert.throws(() => manager.register({ inputTypes: ['keydown'] }), /non-empty id/);
    assert.throws(() => manager.register({ id: 'empty', inputTypes: [] }), /declare inputTypes/);
    manager.register({ id: 'valid', inputTypes: ['keydown'], matches: () => true, handle: () => InputResponse.consumed() });
    assert.throws(() => manager.register({ id: 'valid', inputTypes: ['keyup'] }), /already registered/);
});

test('dispatch is priority ordered, ties use registration order, and PASS alone continues routing', () => {
    const { manager } = managerFixture();
    const calls = [];
    const context = (id, priority, result) => ({
        id,
        priority,
        inputTypes: [InputType.KEY_DOWN],
        matches: () => calls.push(`match:${id}`) && true,
        handle: () => calls.push(`handle:${id}`) && result
    });
    manager.register(context('low', 1, InputResponse.handled()));
    manager.register(context('firstTie', 2, InputResponse.pass()));
    manager.register(context('secondTie', 2, InputResponse.consumed()));
    manager.dispatch(InputType.KEY_DOWN, event('KeyA'));
    assert.deepEqual(calls, ['match:firstTie', 'handle:firstTie', 'match:secondTie', 'handle:secondTie']);
});

test('dispatch applies browser effects independently from application routing result', () => {
    const { manager } = managerFixture();
    manager.register({
        id: 'effects', priority: 1, inputTypes: [InputType.CLICK], matches: () => true,
        handle: () => InputResponse.consumed({ preventDefault: true, stopImmediatePropagation: true })
    });
    const fixture = event();
    const response = manager.dispatch(InputType.CLICK, fixture);
    assert.equal(response.result, InputResult.CONSUMED);
    assert.equal(fixture.defaultPrevented, true);
    assert.equal(fixture.stopImmediatePropagationCalls, 1);

    manager.unregister('effects');
    manager.register({
        id: 'propagation', priority: 1, inputTypes: [InputType.CLICK], matches: () => true,
        handle: () => InputResponse.handled({ stopPropagation: true })
    });
    manager.dispatch(InputType.CLICK, fixture);
    assert.equal(fixture.stopPropagationCalls, 1);
    assert.equal(normalizeInputResponse(InputResult.PASS).result, InputResult.PASS);
    assert.equal(normalizeInputResponse(undefined).result, InputResult.CONSUMED);
});

test('unregister closures are idempotent and immediately remove every route', () => {
    const { manager } = managerFixture();
    let calls = 0;
    const unregister = manager.register({
        id: 'temporary', priority: 1, inputTypes: ['keydown', 'keyup'], matches: () => true,
        handle: () => { calls++; return InputResponse.handled(); }
    });
    manager.dispatch('keydown', event());
    assert.equal(unregister(), true);
    assert.equal(unregister(), false);
    manager.dispatch('keydown', event());
    assert.equal(calls, 1);
    assert.equal(manager.unregister('missing'), false);
    const context = { id: 'object', inputTypes: ['keydown'], matches: () => false, handle: () => InputResponse.handled() };
    manager.register(context);
    assert.equal(manager.unregister(context), true);
});

test('default context priorities encode the policy hierarchy', () => {
    assert.deepEqual(InputPriority, {
        GLOBAL: 1000, MODAL: 900, CONSOLE: 800, TEXT_EDIT: 700,
        EDITOR: 600, GAMEPLAY: 500, PAUSED: 400, MENU: 300, FALLBACK: 0
    });
});

test('global shortcuts are physical-key based and browser modifier shortcuts pass through', () => {
    let toggles = 0;
    const game = { state: 'playing', console: { visible: false, toggle: () => toggles++ } };
    const { manager, root } = managerFixture({ game });
    registerDefaultInputContexts(manager, root);
    const backquote = event('Backquote');
    backquote.key = 'Dead';
    manager.dispatch('keydown', backquote);
    assert.equal(toggles, 1);
    assert.equal(backquote.defaultPrevented, true);

    const reload = event('KeyR');
    reload.ctrlKey = true;
    manager.dispatch('keydown', reload);
    assert.equal(reload.defaultPrevented, false);
});

test('global editor, quit, and modal shortcut ownership follows live state', () => {
    const calls = [];
    const game = {
        state: 'playing',
        levelEditor: { active: false, mode: 'edit', toggle: () => calls.push('editor') },
        showQuitDialog: () => calls.push('quit'),
        uiManager: { activeScreens: [] }
    };
    const { manager, root } = managerFixture({ game });
    registerDefaultInputContexts(manager, root);
    manager.dispatch('keydown', event('F1'));
    manager.dispatch('keydown', event('Escape'));
    game.levelEditor.active = true;
    manager.dispatch('keydown', event('Escape'));
    game.levelEditor.active = false;
    game.state = 'paused';
    manager.dispatch('keydown', event('Escape'));
    assert.deepEqual(calls, ['editor', 'quit', 'editor', 'quit']);

    game.levelEditor.active = false;
    game.uiManager.activeScreens.push({});
    assert.equal(manager.registrations.get('global').context.matches('keydown', event('F1')), false);
    const modified = event('KeyS'); modified.ctrlKey = true;
    game.levelEditor.active = true;
    assert.equal(manager.registrations.get('global').context.matches('keydown', modified), false);
});

test('modal context owns the whole event domain even when a screen declines a key', () => {
    let resets = 0;
    const game = {
        state: 'playing',
        uiManager: { activeScreens: [{}], handleKeyPress: () => false },
        resetLevel: () => resets++,
        penguin: { state: 'ready' }
    };
    const { manager, root } = managerFixture({ game });
    registerDefaultInputContexts(manager, root);
    const key = event('KeyR');
    const response = manager.dispatch('keydown', key);
    assert.equal(response.result, InputResult.CONSUMED);
    assert.equal(resets, 0);
    assert.equal(key.defaultPrevented, false);
});

test('modal click handling preserves its event marker and propagation behavior', () => {
    const game = {
        state: 'menu',
        uiManager: { activeScreens: [{}], handleClick: () => true }
    };
    const { manager, root } = managerFixture({ game });
    registerDefaultInputContexts(manager, root);
    const click = event();
    manager.dispatch('click', click);
    assert.equal(click.__spacedPenguinUiHandled, true);
    assert.equal(click.defaultPrevented, true);
    assert.equal(click.stopImmediatePropagationCalls, 1);
});

test('modal context maps every legacy UI event and consumes unsupported modal input', () => {
    const calls = [];
    const uiManager = {
        activeScreens: [{}],
        handleKeyPress: () => true,
        handlePointerMove: value => calls.push(['move', value]),
        handlePointerDown: value => { calls.push(['down', value]); return false; },
        handlePointerUp: value => calls.push(['up', value]),
        handleTouchStart: value => calls.push(['touchStart', value]),
        handleTouchEnd: value => calls.push(['touchEnd', value])
    };
    const game = { state: 'playing', uiManager };
    const { manager, root } = managerFixture({ game });
    registerDefaultInputContexts(manager, root);
    const key = event('KeyA'); manager.dispatch('keydown', key);
    assert.equal(key.defaultPrevented, true);
    for (const type of ['pointermove', 'pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'wheel']) {
        manager.dispatch(type, event());
    }
    assert.deepEqual(calls.map(call => call[0]), ['move', 'down', 'up', 'up', 'touchStart', 'touchEnd']);
});

test('console and editable contexts consume application input without preventing native behavior', () => {
    let retries = 0;
    const game = { state: 'playing', console: { visible: true }, penguin: { state: 'soaring' }, tryAgain: () => retries++ };
    const { manager, root } = managerFixture({ game });
    registerDefaultInputContexts(manager, root);
    const consoleKey = event('KeyA');
    manager.dispatch('keydown', consoleKey);
    assert.equal(retries, 0);
    assert.equal(consoleKey.defaultPrevented, false);

    game.console.visible = false;
    const editableKey = event('KeyA');
    editableKey.target = { matches: selector => selector.includes('input') };
    manager.dispatch('keydown', editableKey);
    assert.equal(retries, 0);
    assert.equal(editableKey.defaultPrevented, false);
});

test('editor edit mode claims unknown keys so R cannot leak into gameplay', () => {
    let resets = 0;
    const game = {
        state: 'playing',
        canvas: { style: {} },
        levelEditor: { active: true, mode: 'edit' },
        resetLevel: () => resets++,
        penguin: { state: 'ready' }
    };
    const { manager, root } = managerFixture({ game });
    game.canvas = root.canvas;
    registerDefaultInputContexts(manager, root);
    const key = event('KeyR');
    const response = manager.dispatch('keydown', key);
    assert.equal(response.result, InputResult.CONSUMED);
    assert.equal(resets, 0);
});

test('editor routes pointer, wheel, context menu, pan, camera, delete, save, undo, and redo commands', () => {
    const calls = [];
    const editor = {
        active: true, mode: 'edit', panning: false, spacePan: false,
        handlePointerDown: value => calls.push(['down', value]),
        handlePointerMove: value => calls.push(['move', value]),
        handlePointerUp: value => calls.push(['up', value]),
        handleRightClick: value => calls.push(['right', value]),
        zoomEditorAt: (...args) => calls.push(['zoom', ...args]),
        fitEditorCamera: () => calls.push(['fit']),
        centerEditorOn: value => calls.push(['center', value]),
        deleteSelectedObject: () => calls.push(['delete']),
        saveLevel: () => calls.push(['save']),
        undo: () => calls.push(['undo']),
        redo: () => calls.push(['redo'])
    };
    const game = { levelEditor: editor, canvas: { style: {} }, slingshot: { position: { x: 1, y: 2 } } };
    const context = new EditorInputContext({ game });
    const pointer = {};
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'contextmenu']) context.handle(type, pointer);
    context.handle('wheel', { clientX: 1, clientY: 2, deltaY: 3 });
    for (const code of ['Space', 'KeyF', 'Home', 'Delete']) context.handle('keydown', event(code));
    context.handle('keyup', event('Space'));
    context.handle('keyup', event('KeyA'));
    const save = event('KeyS'); save.ctrlKey = true; context.handle('keydown', save);
    const undo = event('KeyZ'); undo.ctrlKey = true; context.handle('keydown', undo);
    const redo = event('KeyZ'); redo.metaKey = true; redo.shiftKey = true; context.handle('keydown', redo);
    assert.deepEqual(calls.map(call => call[0]), [
        'down', 'move', 'up', 'up', 'right', 'zoom', 'fit', 'center', 'delete', 'save', 'undo', 'redo'
    ]);
    assert.equal(editor.spacePan, false);
    assert.equal(game.canvas.style.cursor, '');
    assert.equal(context.handle('unknown', event()).result, InputResult.CONSUMED);
});

test('gameplay context preserves mouse/touch commands and keyboard outcomes in normal and editor play modes', () => {
    const calls = [];
    const game = {
        state: 'playing', penguin: { state: 'ready' },
        handleMouseDown: () => calls.push('mouseDown'), handleMouseMove: () => calls.push('mouseMove'), handleMouseUp: () => calls.push('mouseUp'),
        handleTouchStart: () => calls.push('touchStart'), handleTouchMove: () => calls.push('touchMove'), handleTouchEnd: () => calls.push('touchEnd'),
        resetLevel: () => calls.push('reset'), showQuitDialog: () => calls.push('quit'), tryAgain: () => calls.push('retry')
    };
    const context = new GameplayInputContext({ game });
    for (const type of ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend']) context.handle(type, {});
    context.handle('keydown', event('KeyR'));
    context.handle('keydown', event('KeyQ'));
    context.handle('keydown', event('Space'));
    game.penguin.state = 'crashed';
    context.handle('keydown', event('Space'));
    game.penguin.state = 'soaring';
    context.handle('keydown', event('KeyA'));
    const modifier = event('KeyA'); modifier.metaKey = true;
    assert.equal(context.handle('keydown', modifier).result, InputResult.PASS);
    assert.equal(context.handle('keyup', event()).result, InputResult.CONSUMED);
    assert.deepEqual(calls, ['mouseDown', 'mouseMove', 'mouseUp', 'touchStart', 'touchMove', 'touchEnd', 'reset', 'quit', 'reset', 'retry']);
    game.state = 'levelEditor'; game.levelEditor = { active: true, mode: 'play' };
    assert.equal(context.matches(), true);
});

test('paused and menu contexts preserve resume, menu pointer capture, and start behavior', () => {
    const calls = [];
    const game = { state: 'paused', levelEditor: { active: false }, setState: value => calls.push(['state', value]) };
    const menuScreen = {
        handlePointerDown: () => true,
        handlePointerMove: () => true,
        handlePointerUp: () => true,
        handleClick: () => {
            calls.push(['start']);
            return true;
        },
        start: () => calls.push(['start'])
    };
    const rootOverrides = {
        game,
        menuScreen
    };
    const { manager, root } = managerFixture(rootOverrides);
    registerDefaultInputContexts(manager, root);
    manager.dispatch('keydown', event('Enter'));
    assert.deepEqual(calls, [['state', 'playing']]);

    game.state = 'menu';
    const pointer = event(); pointer.pointerId = 4; pointer.target = { setPointerCapture: id => calls.push(['capture', id]) };
    manager.dispatch('pointerdown', pointer);
    manager.dispatch('pointermove', event());
    manager.dispatch('pointerup', event());
    manager.dispatch('click', event());
    assert.deepEqual(calls.slice(1), [['capture', 4], ['start']]);

    game.state = 'paused';
    assert.equal(manager.dispatch('keydown', event('KeyA')).result, InputResult.CONSUMED);
    game.state = 'menu';
    const blockedClick = event();
    menuScreen.handleClick = () => false;
    assert.equal(manager.dispatch('click', blockedClick).result, InputResult.CONSUMED);
    assert.equal(manager.dispatch('click', event()).result, InputResult.CONSUMED);
    menuScreen.handlePointerDown = () => false;
    assert.equal(manager.dispatch('pointerdown', event()).result, InputResult.CONSUMED);
});

test('menu context owns unmapped keys, passes modified keys, and consumes undeclared dispatches', () => {
    let starts = 0;
    const context = new MenuInputContext({
        game: { state: 'menu' },
        menuScreen: { start: () => starts++ }
    });
    const modified = event('KeyA'); modified.ctrlKey = true;
    assert.equal(context.handle('keydown', modified).result, InputResult.PASS);
    assert.equal(context.handle('keydown', event('KeyA')).result, InputResult.CONSUMED);
    assert.equal(context.handle('keydown', event('Space')).result, InputResult.HANDLED);
    assert.equal(context.handle('unknown', event()).result, InputResult.CONSUMED);
    assert.equal(starts, 1);
});

test('window context resizes immediately and after the configured orientation delay', () => {
    const calls = [];
    const context = new WindowInputContext(
        { setupResponsiveCanvas: () => calls.push('resize') },
        (callback, delay) => { calls.push(delay); callback(); }
    );
    context.handle('resize');
    context.handle('orientationchange');
    assert.equal(context.matches(), true);
    assert.equal(calls[0], 'resize');
    assert.equal(typeof calls[1], 'number');
    assert.equal(calls[2], 'resize');
});
