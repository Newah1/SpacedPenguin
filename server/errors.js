export class ApiError extends Error {
    constructor(status, code, message, details) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

export function errorBody(error) {
    const body = {
        error: {
            code: error.code || 'INTERNAL_ERROR',
            message: error.code ? error.message : 'An unexpected server error occurred.'
        }
    };
    if (error.details !== undefined) body.error.details = error.details;
    return body;
}

export function badRequest(code, message, details) {
    return new ApiError(400, code, message, details);
}
