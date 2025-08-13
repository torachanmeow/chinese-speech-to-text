/**
 * ピンイン変換モジュール
 * Chinese Speech to Text
 * 
 * 中国語テキストをピンイン付きのrubyタグ形式に変換する
 * pinyin-proライブラリを使用してピンイン変換を実行
 * 
 * 【注意】ピンイン表記の限界について：
 * - 表示されるピンインは大陸式（漢語拼音）です
 * - zh-TW環境では注音符号（ㄅㄆㄇㄈ）が一般的ですが、本モジュールでは対応していません
 * - Web Speech API自体もzh-TW特有の発音や語彙に対する精度に限界があります
 * - zh-TW環境により適したUI/UXが必要な場合は注音符号対応の検討が推奨されます
 */

// ピンイン変換設定
const PINYIN_CONFIG = {
    toneType: 'symbol',    // トーン記号を使用（māma形式）
    type: 'pinyin',        // ピンイン形式で出力
    multiple: false,       // 多音字の場合は最初の読みを使用
    removeNum: false,      // 数字トーンを削除しない
    removeNone: true       // 空の結果を削除
};

class PinyinConverter {
    constructor() {
        this.cache = new Map();
        this.isLibraryLoaded = false;
        
        this.checkLibraryAvailability();
    }

    /**
     * ピンインライブラリの利用可能性を確認
     * pinyin-proライブラリの複数の名前空間に対応
     */
    checkLibraryAvailability() {
        this.isLibraryLoaded = 
            typeof window.pinyin === 'function' || 
            typeof window.pinyinPro === 'function' ||
            (typeof window.pinyinPro === 'object' && typeof window.pinyinPro.pinyin === 'function');
        
        if (!this.isLibraryLoaded) {
            stateManager?.setError('PINYIN', 'LIBRARY_NOT_LOADED');
        }
    }

    /**
     * 中国語テキストをピンイン付きのrubyタグHTMLに変換
     * @param {string} chineseText - 変換する中国語テキスト
     * @returns {Promise<string>} ピンイン付きHTML（<ruby>漢字<rt>pinyin</rt></ruby>形式）
     */
    async convertToRuby(chineseText) {
        try {
            if (!chineseText || !this.isLibraryLoaded) {
                return chineseText;
            }

            // 変換結果をキャッシュから取得
            const cacheKey = `ruby_${chineseText}`;
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }

            const result = await this.convertTextToRuby(chineseText);
            
            // LRUキャッシュ実装（最大100件まで保持）
            if (this.cache.size >= 100) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
            this.cache.set(cacheKey, result);
            
            return result;
            
        } catch (error) {
            // エラー時は元のテキストをそのまま返す
            return chineseText;
        }
    }

    /**
     * テキストを文字単位でピンイン付きrubyタグHTMLに変換
     * @param {string} text - 変換対象テキスト
     * @returns {Promise<string>} rubyタグ付きHTML
     */
    async convertTextToRuby(text) {
        const chars = Array.from(text);  // 絵文字や特殊文字も考慮した文字分割
        const rubyParts = [];
        
        for (const char of chars) {
            if (Utils.isChineseText(char)) {
                // 中国語文字の場合はピンインを取得してrubyタグで囲む
                const pinyin = await this.getSingleCharPinyin(char);
                if (pinyin && pinyin !== char) {
                    rubyParts.push(`<ruby class="chinese-ruby">${char}<rt>${pinyin}</rt></ruby>`);
                } else {
                    rubyParts.push(char);
                }
            } else {
                // 中国語以外の文字はそのまま追加
                rubyParts.push(char);
            }
        }
        
        return rubyParts.join('');
    }

    /**
     * 単一文字のピンイン取得
     * @param {string} char - ピンインを取得する中国語文字
     * @returns {Promise<string>} ピンイン文字列または元の文字
     */
    async getSingleCharPinyin(char) {
        try {
            if (!this.isLibraryLoaded || !Utils.isChineseText(char)) {
                return char;
            }
            
            // キャッシュから取得を試行
            const cacheKey = `single_${char}`;
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }
            
            let pinyinResult = '';
            
            // 利用可能なピンインライブラリを順次試行
            if (typeof window.pinyinPro === 'object' && typeof window.pinyinPro.pinyin === 'function') {
                // pinyinPro.pinyin オブジェクト形式
                pinyinResult = window.pinyinPro.pinyin(char, {
                    ...PINYIN_CONFIG
                });
            }
            else if (typeof window.pinyinPro === 'function') {
                // pinyinPro 関数形式
                pinyinResult = window.pinyinPro(char, {
                    ...PINYIN_CONFIG
                });
            }
            else if (typeof window.pinyin === 'function') {
                // pinyin 関数形式
                pinyinResult = window.pinyin(char, {
                    ...PINYIN_CONFIG
                });
            }
            
            // 結果を文字列形式に正規化
            let result = char;
            if (typeof pinyinResult === 'string' && pinyinResult.trim()) {
                result = pinyinResult.trim();
            } else if (Array.isArray(pinyinResult) && pinyinResult.length > 0) {
                result = pinyinResult[0] || char;
            }
            
            // 結果をキャッシュに保存
            this.cache.set(cacheKey, result);
            
            return result;
            
        } catch (error) {
            // エラー時は元の文字を返す
            return char;
        }
    }

    /**
     * 中国語テキスト全体をピンイン文字列に変換
     * @param {string} chineseText - 変換する中国語テキスト
     * @returns {Promise<string>} ピンイン文字列
     */
    async convertToPinyin(chineseText) {
        try {
            if (!chineseText || !this.isLibraryLoaded) {
                return '';
            }
            
            // キャッシュから取得を試行
            const cacheKey = `pinyin_${chineseText}`;
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }
            
            let pinyinResult = '';
            
            // 利用可能なピンインライブラリを順次試行
            if (typeof window.pinyinPro === 'object' && typeof window.pinyinPro.pinyin === 'function') {
                pinyinResult = window.pinyinPro.pinyin(chineseText, {
                    ...PINYIN_CONFIG
                });
            } else if (typeof window.pinyinPro === 'function') {
                pinyinResult = window.pinyinPro(chineseText, {
                    ...PINYIN_CONFIG
                });
            } else if (typeof window.pinyin === 'function') {
                pinyinResult = window.pinyin(chineseText, {
                    ...PINYIN_CONFIG
                });
            } else {
                return '';
            }
            
            const result = pinyinResult || chineseText;
            
            // 結果をキャッシュに保存
            this.cache.set(cacheKey, result);
            
            return result;
            
        } catch (error) {
            // エラー時は元のテキストを返す
            return chineseText;
        }
    }

    /**
     * 多音字文字の全ピンイン候補を取得
     * @param {string} char - 多音字候補を取得する中国語文字
     * @returns {Array<string>} ピンイン候補の配列
     */
    getMultiplePinyin(char) {
        try {
            if (!this.isLibraryLoaded || !Utils.isChineseText(char)) {
                return [];
            }
            
            // 多音字対応でピンインを取得
            const multiplePinyin = window.pinyin(char, {
                toneType: PINYIN_CONFIG.toneType,
                type: PINYIN_CONFIG.type,
                multiple: true // 多音字の全候補を取得
            });
            
            // 結果を配列形式に正規化
            if (typeof multiplePinyin === 'string') {
                return [multiplePinyin];
            }
            
            return Array.isArray(multiplePinyin) ? multiplePinyin : [];
            
        } catch (error) {
            return [];
        }
    }

    /**
     * ライブラリ再初期化（main.jsから呼び出される）
     * @returns {Promise<boolean>} 初期化成功可否
     */
    async reinitialize() {
        // ライブラリの読み込みを少し待つ（非同期読み込み対応）
        let attempts = 0;
        const maxAttempts = 10;
        
        while (!this.isLibraryLoaded && attempts < maxAttempts) {
            this.checkLibraryAvailability();
            if (!this.isLibraryLoaded) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
        }
        
        this.clearCache();
        
        return this.isLibraryLoaded;
    }

    /**
     * ピンイン変換キャッシュをクリア
     * メモリ使用量削減やキャッシュ更新が必要な場合に使用
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * ピンイン変換モジュールの統計情報を取得
     * @returns {Object} 統計情報オブジェクト
     */
    getStats() {
        return {
            cacheSize: this.cache.size,           // キャッシュされたエントリ数
            isLibraryLoaded: this.isLibraryLoaded, // ライブラリ読み込み状態
            libraryType: this.getLibraryType()     // 使用中のライブラリタイプ
        };
    }

    /**
     * 現在使用中のピンインライブラリのタイプを取得
     * @returns {string} ライブラリタイプ ('pinyinPro.pinyin' | 'pinyinPro' | 'pinyin' | 'none')
     */
    getLibraryType() {
        if (typeof window.pinyinPro === 'object' && typeof window.pinyinPro.pinyin === 'function') {
            return 'pinyinPro.pinyin';
        } else if (typeof window.pinyinPro === 'function') {
            return 'pinyinPro';
        } else if (typeof window.pinyin === 'function') {
            return 'pinyin';
        }
        return 'none';
    }
}

// グローバルインスタンス
window.pinyinConverter = new PinyinConverter();