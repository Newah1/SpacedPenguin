export const InputResult = Object.freeze({
    PASS: 'pass',
    CONSUMED: 'consumed',
    HANDLED: 'handled'
});

function response(result, options = {}) {
    return Object.freeze({
        result,
        preventDefault: options.preventDefault === true,
        stopPropagation: options.stopPropagation === true,
        stopImmediatePropagation: options.stopImmediatePropagation === true
    });
}

export const InputResponse = Object.freeze({
    pass: (options = {}) => response(InputResult.PASS, options),
    consumed: (options = {}) => response(InputResult.CONSUMED, options),
    handled: (options = {}) => response(InputResult.HANDLED, options)
});

export function normalizeInputResponse(value) {
    if (value && Object.values(InputResult).includes(value.result)) return value;
    if (Object.values(InputResult).includes(value)) return response(value);
    return InputResponse.consumed();
}
