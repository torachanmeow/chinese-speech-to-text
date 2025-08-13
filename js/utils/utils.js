/**
 * ユーティリティ関数
 * Chinese Speech to Text
 */

const Utils = {
    // ユニークIDの生成
    generateId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    },
    
    // タイムスタンプフォーマット
    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    },
    
    // エラーメッセージ取得
    getErrorMessage(category, code) {
        return APP_CONFIG.ERROR_MESSAGES[category]?.[code] || 'Unknown error occurred';
    },
    
    // 強制リフロー（DOM描画の同期化）
    forceReflow(element) {
        if (element && element.length) {
            element[0].offsetHeight; // 強制リフロー
        }
    },
    
    // ブラウザサポート確認
    checkBrowserSupport() {
        const support = {
            speechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
            localStorage: !!window.localStorage,
            fetch: !!window.fetch,
            promises: !!window.Promise
        };
        
        return {
            ...support,
            isSupported: Object.values(support).every(Boolean)
        };
    },
    
    // デバウンス関数
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // スロットル関数
    throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    // セーフHTML生成（XSS対策）
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    // JSON安全なパース
    safeJsonParse(json, defaultValue = null) {
        try {
            return JSON.parse(json);
        } catch (error) {
            return defaultValue;
        }
    },
    
    // 深いコピー
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        
        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }
        
        if (obj instanceof Array) {
            return obj.map(item => this.deepClone(item));
        }
        
        if (typeof obj === 'object') {
            const clonedObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    clonedObj[key] = this.deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
    },
    
    // 中国語テキスト判定
    isChineseText(text) {
        return /[\u4e00-\u9fff]/.test(text);
    },
    
    // 文字列トリミング
    trimText(text) {
        return text.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
    }
};

// グローバルに公開
window.Utils = Utils;