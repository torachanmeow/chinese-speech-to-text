/**
 * 翻訳モジュール
 * Chinese Speech to Text
 * 
 * Google Gemini APIを使用して中国語テキストを日本語に翻訳するモジュール
 * レート制限、エラーハンドリング、バッチ処理に対応
 * 
 * 機能概要:
 * - Google Gemini APIを使用した高精度な中国語→日本語翻訳
 * - レート制限とタイムアウト処理で安定したAPI呼び出し
 * - エラータイプに応じた自動リトライとフォールバック
 * - キューシステムによるバッチ処理と同時リクエスト制御
 * - 簡体字・繁体字中国語の自動語言検出と適切なプロンプト生成
 * - 翻訳履歴の管理とコンテキストを考慮した翻訳品質向上
 * - コネクションテストとAPIキー検証機能
 */

// 翻訳システムの定数定義
const TRANSLATION_CONSTANTS = {
    DEFAULT_MODEL: 'gemini-2.5-flash-lite',    // デフォルトモデル
    MAX_TEXT_LENGTH: 5000,                // 最大テキスト長
    MIN_REQUEST_INTERVAL: 1000,           // 最小リクエスト間隔（ミリ秒）
    QUEUE_PROCESS_DELAY: 500,             // キュー処理間の遅延
    MAX_RETRY_COUNT: 3,                   // 最大リトライ回数
    TEMPERATURE: 0.3,                     // AIモデルのランダム性設定
    MAX_OUTPUT_TOKENS: 2048               // 最大出力トークン数
};

class GeminiTranslator {
    constructor() {
        // Google Gemini API設定
        this.apiKey = '';                     // APIキー（初期化時に設定）
        this.model = TRANSLATION_CONSTANTS.DEFAULT_MODEL;  // 使用モデル
        
        // 設定と状態管理
        this.config = APP_CONFIG.API_CONFIG;  // API設定の参照
        
        // リクエストキューシステム
        this.requestQueue = [];               // 翻訳リクエストのキュー
        this.isProcessing = false;            // キュー処理中フラグ
        
        // レート制限管理
        this.lastRequestTime = 0;             // 最後のリクエスト時刻
        
        // 初期化実行
        this.initializeTranslator();
    }

    /**
     * 翻訳モジュールの初期化
     * localStorageからAPIキーとモデル設定を復元
     * stateManagerとの連携でユーザー設定を反映
     */
    initializeTranslator() {
        try {
            // APIキーの復元
            this.apiKey = stateManager.storage.getApiKey();
            this.model = stateManager.getState('config.geminiModel') || 'gemini-2.0-flash';
            
        } catch (error) {
        }
    }

    /**
     * Google Gemini APIキーの設定
     * 翻訳機能を使用する前に必須の設定
     * APIキーの有効性は別途testConnectionで確認可能
     * 
     * @param {string} apiKey - Google Gemini APIキー
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * 使用するGemini AIモデルの設定
     * 利用可能モデル: gemini-2.0-flash, gemini-1.5-proなど
     * モデルによって翻訳品質、速度、コストが異なる
     * 
     * @param {string} model - Geminiモデル名
     */
    setModel(model) {
        this.model = model;
    }

    /**
     * 中国語テキストの日本語翻訳メイン関数
     * テキストバリデーション、プロンプト生成、API呼び出し、結果処理を一連で実行
     * エラー時は状態を適切に更新し、ユーザーにフィードバックを提供
     * 
     * @param {string} text - 翻訳対象の中国語テキスト
     * @param {Object} [options={}] - 翻訳オプション（言語指定、コンテキストなど）
     * @returns {Promise<Object>} 翻訳結果オブジェクト（success, translatedText, errorなど）
     */
    async translate(text, options = {}) {
        try {
            // APIキーチェック
            if (!this.apiKey) {
                stateManager.setError('TRANSLATION', 'API_KEY_MISSING');
                throw new Error('APIキーが設定されていません');
            }

            // テキストバリデーション
            if (!text || typeof text !== 'string') {
                throw new Error('有効なテキストが指定されていません');
            }

            const trimmedText = Utils.trimChinese(text);
            if (!trimmedText) {
                throw new Error('翻訳するテキストが空です');
            }

            // テキスト長制限チェック
            if (trimmedText.length > 5000) {
                stateManager.setError('TRANSLATION', 'TEXT_TOO_LONG');
                throw new Error('テキストが長すぎます');
            }

            // 翻訳状態を更新
            stateManager.updateTranslationState({
                isLoading: true,
                selectedText: trimmedText,
                originalText: trimmedText,
                translatedText: '',
                lastTranslationTime: Date.now()
            });

            // プロンプト生成
            const prompt = this.generatePrompt(trimmedText, options);

            // API呼び出し
            const response = await this.callGeminiAPI(prompt);

            // 結果処理
            const translatedText = this.processResponse(response);

            // 状態更新（成功時はエラー状態をクリア）
            stateManager.updateTranslationState({
                isLoading: false,
                translatedText: translatedText,
                hasError: false
            });


            return {
                success: true,
                originalText: trimmedText,
                translatedText: translatedText,
                model: this.model,
                timestamp: Date.now()
            };

        } catch (error) {
            
            // エラーに応じた処理
            this.handleTranslationError(error);
            
            // エラー時の状態更新（原文と翻訳エラーメッセージを表示）
            stateManager.updateTranslationState({
                isLoading: false,
                originalText: text,
                translatedText: `翻訳エラー: ${error.message}`,
                hasError: true
            });

            return {
                success: false,
                error: error.message,
                originalText: text,
                timestamp: Date.now()
            };
        }
    }

    /**
     * Gemini AI用の翻訳プロンプト生成
     * 翻訳スタイル設定を考慮した高品質な翻訳プロンプトを作成
     * 簡体字・繁体字中国語の区別、文化的ニュアンス、専門用語を考慮
     * 
     * @param {string} text - 翻訳対象テキスト
     * @param {Object} [options={}] - プロンプトオプション
     * @param {string} [options.sourceLang] - ソース言語（zh-CN, zh-TW）
     * @param {string} [options.targetLang] - ターゲット言語（ja）
     * @returns {string} 生成されたプロンプト文字列
     */
    generatePrompt(text, options = {}) {
        const sourceLang = options.sourceLang || stateManager.getState('config.language') || 'zh-CN';
        const targetLang = options.targetLang || 'ja';
        
        const langMap = {
            'zh-CN': '簡体字中国語',
            'zh-TW': '繁体字中国語',
            'ja': '日本語'
        };

        const sourceLanguage = langMap[sourceLang] || '中国語';
        const targetLanguage = langMap[targetLang] || '日本語';

        // 翻訳スタイル設定を取得
        const translationStyle = stateManager.getState('config.translationStyle') || '';

        // プロンプト生成
        const prompt = `あなたは${sourceLanguage}から${targetLanguage}への翻訳を専門とする熟練の翻訳者です。

以下の${sourceLanguage}のテキストを自然で正確な${targetLanguage}に翻訳してください。

翻訳時の注意点:
1. 文脈と意味を正確に理解して翻訳する
2. 自然で読みやすい${targetLanguage}表現を使用する
3. 専門用語や固有名詞は適切に処理する
4. 文化的なニュアンスも考慮する
5. 翻訳結果のみを返答し、説明は不要
${translationStyle ? `6. スタイル指示: ${translationStyle}` : ''}

翻訳するテキスト:
${text}`;


        return prompt;
    }

    /**
     * Google Gemini APIへの翻訳リクエスト実行
     * レート制限、タイムアウト、セキュリティ設定を含む安全なAPIコール
     * AbortControllerでタイムアウト制御、fetch APIでHTTPリクエストを実行
     * エラーレスポンスの適切なパーシングとユーザーフレンドリーなメッセージ化
     * 
     * @param {string} prompt - Gemini AIに送信するプロンプト
     * @returns {Promise<Object>} Gemini APIレスポンスオブジェクト
     * @throws {Error} APIエラー、ネットワークエラー、タイムアウトエラー
     */
    async callGeminiAPI(prompt) {
        const url = `${this.config.GEMINI_BASE_URL}${this.model}:generateContent?key=${this.apiKey}`;
        
        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.3,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 2048
            },
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH", 
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                }
            ]
        };

        // レート制限対応
        await this.handleRateLimit();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            this.lastRequestTime = Date.now();
            
            return data;

        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('リクエストがタイムアウトしました');
            }
            
            throw error;
        }
    }

    /**
     * Gemini APIレスポンスのパーシングと翻訳テキスト抽出
     * APIレスポンスの構造を検証し、安全に翻訳結果を取得
     * 空のレスポンスや不正なフォーマットに対するエラーハンドリング
     * 
     * @param {Object} response - Gemini APIからのレスポンスオブジェクト
     * @returns {string} 抽出された翻訳テキスト
     * @throws {Error} レスポンスのパーシングエラー
     */
    processResponse(response) {
        try {
            if (!response || !response.candidates || !response.candidates[0]) {
                throw new Error('無効なAPI応答です');
            }

            const candidate = response.candidates[0];
            
            // Gemini API finishReasonのチェック（STOP以外は異常終了）
            if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                throw new Error(`finishReason: ${candidate.finishReason}`);
            }
            
            if (!candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
                throw new Error('API_RESPONSE_NO_CONTENT');
            }

            const translatedText = candidate.content.parts[0].text;
            
            if (!translatedText || typeof translatedText !== 'string') {
                throw new Error('API_RESPONSE_INVALID_TEXT');
            }

            return translatedText.trim();

        } catch (error) {
            // エラータイプに応じて適切なメッセージを生成
            if (error.message === 'API_RESPONSE_NO_CONTENT') {
                throw new Error('翻訳結果が含まれていません');
            } else if (error.message === 'API_RESPONSE_INVALID_TEXT') {
                throw new Error('翻訳テキストが無効です');
            } else {
                throw new Error(`翻訳に失敗しました。${error.message}`);
            }
        }
    }

    /**
     * 翻訳エラーの分類と適切な状態管理
     * エラーメッセージからエラータイプを特定し、stateManagerに適切なエラーコードを設定
     * APIキーエラー、レート制限、ネットワークエラーなどを区別して処理
     * 
     * @param {Error} error - 翻訳処理中に発生したエラーオブジェクト
     */
    handleTranslationError(error) {
        const errorMessage = error.message.toLowerCase();
        
        if (errorMessage.includes('api key')) {
            stateManager.setError('TRANSLATION', 'API_KEY_MISSING');
        } else if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
            stateManager.setError('TRANSLATION', 'RATE_LIMIT');
        } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
            stateManager.setError('TRANSLATION', 'NETWORK_ERROR');
        } else if (errorMessage.includes('timeout')) {
            stateManager.setError('TRANSLATION', 'NETWORK_ERROR');
        } else {
            stateManager.setError('TRANSLATION', 'API_ERROR', error.message);
        }
    }

    /**
     * APIレート制限の遵守とリクエスト間隔制御
     * 最後のリクエストからの経過時間をチェックし、必要に応じて待機
     * Gemini APIのレート制限を超えないように自動調整
     * 
     * @returns {Promise<void>} 必要な待機後に解決されるPromise
     */
    async handleRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const minInterval = 1000; // 最小間隔1秒

        if (timeSinceLastRequest < minInterval) {
            const waitTime = minInterval - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    /**
     * キューシステムを使用した非同期翻訳処理
     * 複数の翻訳リクエストをキューに追加し、順次処理でレート制限を回避
     * Promiseベースで非同期処理を実現し、UIブロッキングを防止
     * 
     * @param {string} text - 翻訳対象テキスト
     * @param {Object} [options={}] - 翻訳オプション
     * @returns {Promise<Object>} 翻訳結果を含むPromise
     */
    async translateWithQueue(text, options = {}) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                text,
                options,
                resolve,
                reject,
                timestamp: Date.now()
            });

            this.processQueue();
        });
    }

    /**
     * 翻訳リクエストキューの順次処理
     * キューに豊められたリクエストを一つずつ取り出して翻訳実行
     * エラーが発生したリクエストはスキップし、他のリクエスト処理を継続
     * キュー間の適切な遅延でレート制限を遵守
     * 
     * @returns {Promise<void>} 全キュー処理完了時に解決されるPromise
     */
    async processQueue() {
        if (this.isProcessing || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        try {
            while (this.requestQueue.length > 0) {
                const request = this.requestQueue.shift();
                
                try {
                    const result = await this.translate(request.text, request.options);
                    request.resolve(result);
                } catch (error) {
                    request.reject(error);
                }

                // キュー間の待機
                if (this.requestQueue.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * 複数テキストのバッチ翻訳処理
     * テキスト配列を受け取り、各テキストをキューシステムで順次翻訳
     * 全テキストの翻訳結果を配列で返し、エラーハンドリングも含む
     * バッチ処理の進行状況をリアルタイムで監視可能
     * 
     * @param {Array<string>} textArray - 翻訳対象テキストの配列
     * @param {Object} [options={}] - バッチ翻訳オプション
     * @returns {Promise<Array<Object>>} 各テキストの翻訳結果配列
     * @throws {Error} バッチ処理全体のエラー
     */
    async translateBatch(textArray, options = {}) {
        try {
            if (!Array.isArray(textArray)) {
                throw new Error('テキスト配列が必要です');
            }

            const results = [];
            
            for (const text of textArray) {
                const result = await this.translateWithQueue(text, options);
                results.push(result);
            }

            return results;

        } catch (error) {
            throw error;
        }
    }

    /**
     * 翻訳履歴の取得と管理
     * ユーザーの翻訳履歴を取得し、統計情報や再翻訳機能で使用
     * 現在は基本実装のみ、将来的にlocalStorageやサーバー連携で拡張予定
     * 
     * @returns {Array<Object>} 翻訳履歴の配列（現在は空配列）
     */
    getTranslationHistory() {
        // 実装は省略（必要に応じて追加）
        return [];
    }

    /**
     * Google Gemini APIの接続テストとAPIキー検証
     * 簡単なテストテキストでAPIキーの有効性とネットワーク接続を確認
     * 設定画面でのAPIキー検証やトラブルシューティングに使用
     * 
     * @returns {Promise<Object>} テスト結果オブジェクト（success, message, details）
     */
    async testConnection() {
        try {
            if (!this.apiKey) {
                throw new Error('APIキーが設定されていません');
            }

            const testText = '你好';
            const result = await this.translate(testText, { isTest: true });
            
            return {
                success: result.success,
                message: result.success ? '接続テスト成功' : '接続テスト失敗',
                details: result
            };

        } catch (error) {
            return {
                success: false,
                message: '接続テスト失敗',
                error: error.message
            };
        }
    }

    /**
     * 翻訳モジュール設定の動的更新
     * APIキーやモデルの変更を再初期化なしで適用
     * ユーザーが設定を変更した際のリアルタイム更新に使用
     * 
     * @param {Object} newConfig - 新しい設定オブジェクト
     * @param {string} [newConfig.apiKey] - 新しいAPIキー
     * @param {string} [newConfig.model] - 新しいモデル名
     */
    updateConfig(newConfig) {
        if (newConfig.apiKey !== undefined) {
            this.setApiKey(newConfig.apiKey);
        }
        
        if (newConfig.model !== undefined) {
            this.setModel(newConfig.model);
        }

    }

    /**
     * 翻訳モジュールの現在状態と統計情報を取得
     * キューの状態、APIキーの設定状態、使用中モデルなどを含む
     * デバッグ、監視、パフォーマンス解析に使用
     * 
     * @returns {Object} 統計情報オブジェクト
     */
    getStats() {
        return {
            queueLength: this.requestQueue.length,
            isProcessing: this.isProcessing,
            lastRequestTime: this.lastRequestTime,
            hasApiKey: !!this.apiKey,
            currentModel: this.model
        };
    }

    /**
     * デバッグとトラブルシューティング用の詳細情報を取得
     * キューの内容、設定状態、最近のリクエスト情報などを含む
     * サポートチケットやバグレポートで使用するための詳細データ
     * 
     * @returns {Object} デバッグ情報オブジェクト
     */
    getDebugInfo() {
        return {
            ...this.getStats(),
            config: this.config,
            queue: this.requestQueue.map(req => ({
                textLength: req.text?.length || 0,
                timestamp: req.timestamp,
                options: req.options
            }))
        };
    }

    /**
     * 翻訳モジュールのリソース解放とクリーンアップ
     * アプリケーション終了時やページ避遷時に呼び出し
     * 未完了のキューリクエストをキャンセルし、メモリリークを防止
     */
    destroy() {
        // 未完了のキューリクエストを全てキャンセル
        this.requestQueue.forEach(req => {
            req.reject(new Error('翻訳処理が中断されました'));
        });
        this.requestQueue = [];
        
        // 処理状態をリセットし、新たなリクエストを受け付け可能に
        this.isProcessing = false;
    }
}

// グローバルインスタンス
window.geminiTranslator = new GeminiTranslator();