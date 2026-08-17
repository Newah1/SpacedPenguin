import { ApiError } from './errors.js';

function compilePath(path) {
    const names = [];
    const pattern = path
        .split('/')
        .map((segment) => {
            if (!segment.startsWith(':')) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            names.push(segment.slice(1));
            return '([^/]+)';
        })
        .join('/');
    return { names, expression: new RegExp(`^${pattern}$`) };
}

function matchRoute(route, pathname) {
    const match = route.expression.exec(pathname);
    if (!match) return null;
    const params = {};
    for (let index = 0; index < route.names.length; index += 1) {
        try {
            params[route.names[index]] = decodeURIComponent(match[index + 1]);
        } catch {
            throw new ApiError(400, 'INVALID_PATH', 'The request path is not valid.');
        }
    }
    return params;
}

export class Router {
    constructor() {
        this.routes = [];
    }

    route({ method, path, handler }) {
        if (!method || !path || typeof handler !== 'function') {
            throw new TypeError('Routes require a method, path, and handler.');
        }
        this.routes.push({ method: method.toUpperCase(), path, handler, ...compilePath(path) });
        return this;
    }

    get(path, handler) {
        return this.route({ method: 'GET', path, handler });
    }

    post(path, handler) {
        return this.route({ method: 'POST', path, handler });
    }

    async dispatch(request, response, context = {}) {
        const url = new URL(request.url, 'http://level-server.local');
        for (const route of this.routes) {
            if (route.method !== request.method) continue;
            const params = matchRoute(route, url.pathname);
            if (!params) continue;
            await route.handler({ ...context, request, response, url, params });
            return true;
        }
        return false;
    }
}
