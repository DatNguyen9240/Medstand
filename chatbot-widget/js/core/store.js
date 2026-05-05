// js/core/store.js
import { emit, EVENTS } from './event-bus.js';
import { logger } from '../utils/logger.js';

const CACHE_KEY = 'ai_chat_history_v2';
const MAX_MESSAGES_RAM = 50;

/**
 * Message Model:
 * { id: string, role: 'user'|'ai', content: string, status: 'pending'|'done'|'error', time: number, htmlContent: string, fileName: string }
 */
export const Store = {
    state: {
        messages: [],
        isLoading: false,
        config: {}
    },

    setState(updater) {
        if (typeof updater !== 'function') {
            logger.error('STORE', 'setState requires an updater function (Immutable pattern)');
            return;
        }
        const next = updater(this.state);
        this.state = {...next}; // light immutability
        emit(EVENTS.STATE_CHANGED, this.state);
    },

    loadFromMemory() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                this.setState(prev => ({ ...prev, messages: data }));
            }
        } catch (e) {
            logger.error('STORE', 'Failed to load cache:', e);
        }
    },

    saveToMemory() {
        try {
            // Chỉ lưu tối đa 50 tin nắn gần nhất vào LocalStorage
            const toSave = this.state.messages.slice(-MAX_MESSAGES_RAM);
            localStorage.setItem(CACHE_KEY, JSON.stringify(toSave));
        } catch(e) {
            logger.error('STORE', 'Failed to save cache:', e);
        }
    },

    addMessage(msg) {
        // Enforce ID
        if (!msg.id) msg.id = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        if (!msg.status) msg.status = 'done';
        if (!msg.time) msg.time = Date.now();

        this.setState(prev => {
            const newMessages = [...prev.messages, msg];
            
            // Xử lý bộ nhớ RAM - Tách tin cũ ra
            if (newMessages.length > MAX_MESSAGES_RAM) {
                const removedMsg = newMessages.shift(); // lấy đầu tiên
                // Emit event để UI gỡ DOM
                emit(EVENTS.MESSAGE_REMOVE, removedMsg);
                // Có thể Code logic đẩy vào SessionStorage ở đây đối với removedMsg ...
            }
            return { ...prev, messages: newMessages };
        });

        this.saveToMemory();
        emit(EVENTS.MESSAGE_ADD, msg);
        return msg;
    },

    updateMessageStatus(id, newStatus, newContent = null, customProps = {}) {
        this.setState(prev => {
            const nextMessages = prev.messages.map(m => {
                if (m.id === id) {
                    return { ...m, status: newStatus, ...(newContent !== null ? { content: newContent } : {}), ...customProps };
                }
                return m;
            });
            return { ...prev, messages: nextMessages };
        });
        
        const updatedMsg = this.state.messages.find(m => m.id === id);
        if (updatedMsg) emit(EVENTS.MESSAGE_UPDATE, updatedMsg);
        this.saveToMemory();
    },
    
    getHistoryContextStr() {
        // Lấy tầm 10 tin nhắn trước
        const past = this.state.messages.slice(-11, -1);
        return past.map(m => (m.role === 'user' ? 'User: ' : 'AI: ') + String(m.content).replace(/\n/g, ' ')).join('\n');
    }
};
