// js/main.js
/**
 * Medstand Chatbot V5 — Bootstrap Module
 *
 * File này KHÔNG tạo bất kỳ UI nào.
 * Nhiệm vụ duy nhất: khởi tạo Store, export tiện ích ra window.MedstandBot
 * để chatbot.js (load bởi Router khi vào #/chatbot) có thể dùng.
 *
 * Thứ tự khởi chạy:
 *   1. index.html load main.js (type="module")
 *   2. main.js khởi tạo Store, expose window.MedstandBot
 *   3. User navigate → #/chatbot → router load chatbot-api-engine.js + chatbot.js
 *   4. chatbot.js gọi window.MedstandBot.store / .network nếu cần tích hợp sâu hơn
 */
import { logger, setLevel } from './utils/logger.js';
import { Store } from './core/store.js';
import { NetworkService } from './core/network.js';
import { emit, on, off, EVENTS } from './core/event-bus.js';

// Dev mode — tắt khi production
if (window.MS_CHAT_DEBUG === undefined) {
    window.MS_CHAT_DEBUG = false;
}

logger.info('BOOT', 'Medstand V5 utilities ready 🚀');

// Load lịch sử tin nhắn từ cache
Store.loadFromMemory();

// Expose ra global để chatbot.js (script thường, không dùng module) truy cập
window.MedstandBot = {
    store:   Store,
    network: NetworkService,
    events:  { emit, on, off, EVENTS },
    logger
};
