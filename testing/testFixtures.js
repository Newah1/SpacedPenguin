export function createGameFixture(overrides = {}) {
    return {
        state: null,
        deltaTime: 0,
        starfieldTime: 0,
        uiManager: { update() {} },
        gameObjects: [],
        updateGameObjects() {},
        updateSimulation() {
            return { events: [] };
        },
        updateUI() {},
        ...overrides
    };
}

export function createLevelEndScreenFixture(overrides = {}) {
    return {
        visible: true,
        isAnimating: false,
        elements: [],
        handleContinue() {},
        ...overrides
    };
}

export function createEventTargetFixture(overrides = {}) {
    return {
        addEventListener() {},
        removeEventListener() {},
        ...overrides
    };
}

export function createKeyboardEventFixture(code, overrides = {}) {
    return {
        code,
        defaultPrevented: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
        ...overrides
    };
}

export function createRecordingContext() {
    const calls = [];
    const record = name => (...args) => calls.push([name, ...args]);
    const context = {
        fillStyle: '',
        globalAlpha: 1,
        save: record('save'),
        restore: record('restore'),
        fillRect: record('fillRect'),
        strokeRect: record('strokeRect'),
        fillText: record('fillText'),
        translate: record('translate'),
        rotate: record('rotate'),
        scale: record('scale'),
        beginPath: record('beginPath'),
        moveTo: record('moveTo'),
        lineTo: record('lineTo'),
        stroke: record('stroke'),
        setLineDash: record('setLineDash'),
        rect: record('rect'),
        clip: record('clip')
    };

    return { calls, context };
}

export function createTimeoutFixture() {
    const scheduled = [];

    return {
        scheduled,
        setTimeout(callback, delay) {
            scheduled.push({ callback, delay });
            return scheduled.length;
        }
    };
}

export function createAnimationFrameFixture() {
    const requested = [];
    const cancelled = [];

    return {
        requested,
        cancelled,
        requestAnimationFrame(callback) {
            requested.push(callback);
            return requested.length;
        },
        cancelAnimationFrame(id) {
            cancelled.push(id);
        }
    };
}

export function withGlobalOverrides(overrides, run) {
    const originals = new Map(
        Object.keys(overrides).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
    );
    const restore = () => {
        for (const [name, descriptor] of originals) {
            if (descriptor) {
                Object.defineProperty(globalThis, name, descriptor);
            } else {
                delete globalThis[name];
            }
        }
    };

    for (const [name, value] of Object.entries(overrides)) {
        Object.defineProperty(globalThis, name, {
            configurable: true,
            writable: true,
            value
        });
    }

    try {
        const result = run();
        if (result && typeof result.then === 'function') {
            return result.finally(restore);
        }
        restore();
        return result;
    } catch (error) {
        restore();
        throw error;
    }
}
