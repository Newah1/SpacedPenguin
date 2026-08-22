import {
    CANVAS_INPUT_TYPES,
    DOCUMENT_INPUT_TYPES,
    NON_PASSIVE_INPUT_TYPES,
    WINDOW_INPUT_TYPES
} from './inputTypes.js';
import { InputResult, normalizeInputResponse } from './inputResult.js';

export class InputManager {
    constructor(rootContext, environment = {}) {
        this.rootContext = rootContext;
        this.routes = new Map();
        this.registrations = new Map();
        this.registrationCounter = 0;
        this.listeners = [];
        this.document = environment.document ?? globalThis.document;
        this.window = environment.window ?? globalThis.window;
        this.installDomListeners();
    }

    installDomListeners() {
        for (const type of CANVAS_INPUT_TYPES) this.addDomListener(this.rootContext.canvas, type);
        for (const type of DOCUMENT_INPUT_TYPES) this.addDomListener(this.document, type);
        for (const type of WINDOW_INPUT_TYPES) this.addDomListener(this.window, type);
    }

    addDomListener(target, type) {
        if (!target?.addEventListener) return;
        const handler = event => this.dispatch(type, event);
        const options = NON_PASSIVE_INPUT_TYPES.has(type) ? { passive: false } : false;
        target.addEventListener(type, handler, options);
        this.listeners.push({ target, type, handler, options });
    }

    register(context) {
        if (!context?.id) throw new Error('Input contexts require a non-empty id');
        if (!Array.isArray(context.inputTypes) || context.inputTypes.length === 0) {
            throw new Error(`Input context ${context.id} must declare inputTypes`);
        }
        if (this.registrations.has(context.id)) {
            throw new Error(`Input context already registered: ${context.id}`);
        }

        const registration = {
            context,
            order: this.registrationCounter++
        };
        this.registrations.set(context.id, registration);

        for (const type of new Set(context.inputTypes)) {
            const route = this.routes.get(type) ?? [];
            route.push(registration);
            route.sort((a, b) =>
                (b.context.priority ?? 0) - (a.context.priority ?? 0) ||
                a.order - b.order
            );
            this.routes.set(type, route);
        }

        let registered = true;
        return () => {
            if (!registered) return false;
            registered = false;
            return this.unregister(context.id);
        };
    }

    unregister(contextOrId) {
        const id = typeof contextOrId === 'string' ? contextOrId : contextOrId?.id;
        const registration = this.registrations.get(id);
        if (!registration) return false;

        this.registrations.delete(id);
        for (const [type, route] of this.routes) {
            const next = route.filter(candidate => candidate !== registration);
            if (next.length > 0) this.routes.set(type, next);
            else this.routes.delete(type);
        }
        return true;
    }

    dispatch(type, event) {
        for (const { context } of this.routes.get(type) ?? []) {
            if (!context.matches(type, event)) continue;

            const response = normalizeInputResponse(context.handle(type, event));
            if (response.preventDefault) event.preventDefault?.();
            if (response.stopImmediatePropagation) event.stopImmediatePropagation?.();
            else if (response.stopPropagation) event.stopPropagation?.();
            if (response.result !== InputResult.PASS) return response;
        }
        return null;
    }

    destroy() {
        for (const { target, type, handler, options } of this.listeners) {
            target.removeEventListener(type, handler, options);
        }
        this.listeners = [];
        this.routes.clear();
        this.registrations.clear();
    }
}

export default InputManager;
