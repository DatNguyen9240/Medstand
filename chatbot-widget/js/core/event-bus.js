// js/core/event-bus.js
/**
 * Event Constants (Tránh ngầm hiểu)
 */
export const EVENTS = {
    INIT: 'ms-chat:init',
    MESSAGE_ADD: 'ms-chat:message:add',
    MESSAGE_UPDATE: 'ms-chat:message:update',
    MESSAGE_REMOVE: 'ms-chat:message:remove',
    NETWORK_REQUEST: 'ms-chat:network:request',
    NETWORK_SUCCESS: 'ms-chat:network:success',
    NETWORK_ERROR: 'ms-chat:network:error',
    UI_RETRY: 'ms-chat:ui:retry',
    STATE_CHANGED: 'ms-chat:state-changed'
};

export const emit = (name, detail = {}) => {
    window.dispatchEvent(new CustomEvent(name, { detail }));
};

export const on = (name, handler) => {
    window.addEventListener(name, handler);
};

export const off = (name, handler) => {
    window.removeEventListener(name, handler);
};
