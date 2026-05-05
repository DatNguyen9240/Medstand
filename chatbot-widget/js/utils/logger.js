// js/utils/logger.js
let _level = 'info'; // 'debug' | 'info' | 'error' | 'none'

const LEVELS = {
    debug: 1,
    info: 2,
    error: 3,
    none: 99
};

export const setLevel = (level) => {
    _level = level;
};

const shouldLog = (methodLevel) => {
    // Luôn ưu tiên hiển thị nếu bật MS_CHAT_DEBUG global
    if (window.MS_CHAT_DEBUG) return true;
    return LEVELS[methodLevel] >= LEVELS[_level];
};

export const logger = {
    setLevel,
    debug: (namespace, ...args) => {
        if (shouldLog('debug')) {
            console.log(`%c[MS-CHAT][${namespace}]`, 'color: #888;', ...args);
        }
    },
    info: (namespace, ...args) => {
        if (shouldLog('info')) {
            console.info(`%c[MS-CHAT][${namespace}]`, 'color: #0288D1; font-weight: bold;', ...args);
        }
    },
    error: (namespace, ...args) => {
        if (shouldLog('error')) {
            console.error(`%c[MS-CHAT][${namespace}]`, 'color: white; background: red; font-weight: bold;', ...args);
        }
    }
};
