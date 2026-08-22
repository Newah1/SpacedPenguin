export const InputType = Object.freeze({
    KEY_DOWN: 'keydown',
    KEY_UP: 'keyup',
    MOUSE_DOWN: 'mousedown',
    MOUSE_MOVE: 'mousemove',
    MOUSE_UP: 'mouseup',
    TOUCH_START: 'touchstart',
    TOUCH_MOVE: 'touchmove',
    TOUCH_END: 'touchend',
    POINTER_DOWN: 'pointerdown',
    POINTER_MOVE: 'pointermove',
    POINTER_UP: 'pointerup',
    POINTER_CANCEL: 'pointercancel',
    CLICK: 'click',
    CONTEXT_MENU: 'contextmenu',
    WHEEL: 'wheel',
    RESIZE: 'resize',
    ORIENTATION_CHANGE: 'orientationchange'
});

export const DOCUMENT_INPUT_TYPES = Object.freeze([
    InputType.KEY_DOWN,
    InputType.KEY_UP
]);

export const WINDOW_INPUT_TYPES = Object.freeze([
    InputType.RESIZE,
    InputType.ORIENTATION_CHANGE
]);

export const CANVAS_INPUT_TYPES = Object.freeze([
    InputType.MOUSE_DOWN,
    InputType.MOUSE_MOVE,
    InputType.MOUSE_UP,
    InputType.TOUCH_START,
    InputType.TOUCH_MOVE,
    InputType.TOUCH_END,
    InputType.POINTER_DOWN,
    InputType.POINTER_MOVE,
    InputType.POINTER_UP,
    InputType.POINTER_CANCEL,
    InputType.CLICK,
    InputType.CONTEXT_MENU,
    InputType.WHEEL
]);

export const NON_PASSIVE_INPUT_TYPES = new Set([
    InputType.TOUCH_START,
    InputType.TOUCH_MOVE,
    InputType.TOUCH_END,
    InputType.WHEEL
]);
