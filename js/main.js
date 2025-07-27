/**
 * メインアプリケーションコントローラー
 * Chinese Speech to Text
 * 
 * アプリケーション全体のライフサイクル管理と各モジュールの協調動作を制御
 * 
 * 機能概要:
 * - 各モジュール（音声認識、翻訳、ピンイン変換、UI制御、状態管理）の初期化と連携
 * - エラーハンドリングとログ出力の統一管理
 * - キーボードショートカットとページ離脱時の処理
 * - 使用統計の収集と永続化
 * - デバッグモードとパフォーマンス監視機能
 * - グローバルイベントハンドリングとモジュール間通信
 * - ブラウザサポートチェックとクリーンアップ処理
 */

class ChineseLearningApp {
    constructor() {
        // アプリケーション状態管理
        this.isInitialized = false;          // 初期化完了フラグ
        this.modules = {};                    // 各モジュールのインスタンス管理
        this.startTime = Date.now();          // アプリケーション開始時刻
        
        // 内部状態
        this.errorCount = 0;                  // エラー発生回数
        this.performanceData = {};            // パフォーマンス監視データ
    }

    /**
     * アプリケーションのメイン初期化処理
     * ブラウザサポート確認、モジュール初期化、連携設定、アプリケーション固有設定を順次実行
     * 初期化失敗時は致命的エラーを表示し、安全に停止
     * 
     * @returns {Promise<boolean>} 初期化成功可否
     */
    async initialize() {
        try {
            // ブラウザサポートの事前確認
            // Web Speech API、localStorage、ES6機能などの必須要件をチェック
            if (!this.checkBrowserSupport()) {
                this.showFatalError('お使いのブラウザはサポートされていません。Chrome、Firefox、Edgeをご利用ください。');
                return false;
            }
            
            // モジュール初期化
            await this.initializeModules();
            
            // モジュール間の連携設定
            this.setupModuleConnections();
            
            // アプリケーション固有の初期化
            await this.setupApplication();
            
            // 初期化完了処理
            this.isInitialized = true;
            const initTime = Date.now() - this.startTime;
            
            // 初期化時間の記録
            this.performanceData.initTime = initTime;
            
            // 初期化完了の通知
            this.showInitializationComplete();
            
            return true;
            
        } catch (error) {
            console.error('アプリケーション初期化エラー:', error);
            this.showFatalError('アプリケーションの初期化でエラーが発生しました。ページを再読み込みしてください。');
            return false;
        }
    }

    /**
     * ブラウザサポートの包括的確認
     * Web Speech API、localStorage、fetch、ES6機能などの必須要件をチェック
     * サポートされていない機能がある場合はfalseを返し、初期化を中断
     * 
     * @returns {boolean} ブラウザサポート可否
     */
    checkBrowserSupport() {
        const support = Utils.checkBrowserSupport();
        
        if (!support.isSupported) {
            console.error('ブラウザサポートチェック失敗:', support);
            return false;
        }
        
        // ブラウザサポート情報をパフォーマンスデータに記録
        this.performanceData.browserSupport = support;
        
        return true;
    }

    /**
     * 各モジュールの順次初期化処理
     * 依存関係を考慮した順序で初期化を実行：
     * 1. StateManager（状態管理の基盤）
     * 2. PinyinConverter（ピンイン変換機能）
     * 3. SpeechRecognitionManager（音声認識、ピンイン変換器を設定）
     * 4. GeminiTranslator（翻訳機能、StateManagerから設定取得）
     * 5. UIController（UI制御、最後に初期化）
     * 
     * @returns {Promise<void>}
     */
    async initializeModules() {
        
        // 状態管理（最初に初期化：他の全モジュールが依存）
        if (window.stateManager) {
            const success = await window.stateManager.initialize();
            if (!success) {
                throw new Error('StateManager initialization failed');
            }
            this.modules.stateManager = window.stateManager;
        }
        
        // ピンイン変換器（pinyin-proライブラリ依存）
        if (window.pinyinConverter) {
            const success = await window.pinyinConverter.reinitialize();
            if (!success) {
                console.warn('ピンイン変換器の初期化に失敗（ライブラリ未読み込みの可能性）');
            }
            this.modules.pinyinConverter = window.pinyinConverter;
        }
        
        // 音声認識（Web Speech API、ピンイン変換器との連携を設定）
        if (window.speechRecognitionManager) {
            if (this.modules.pinyinConverter) {
                window.speechRecognitionManager.setPinyinConverter(this.modules.pinyinConverter);
            }
            this.modules.speechRecognitionManager = window.speechRecognitionManager;
        }
        
        // 翻訳機能（Google Gemini API）
        if (window.geminiTranslator) {
            // StateManager初期化後にAPIキーを再設定
            window.geminiTranslator.initializeTranslator();
            this.modules.geminiTranslator = window.geminiTranslator;
        }
        
        // UIコントローラー（DOM操作、最後に初期化して他モジュールとの連携を確立）
        if (window.uiController) {
            const success = await window.uiController.initialize();
            if (!success) {
                throw new Error('UIController initialization failed');
            }
            this.modules.uiController = window.uiController;
        }
    }

    /**
     * モジュール間の連携とイベントハンドリング設定
     * 各モジュールからのイベントを購読し、必要な処理を実行
     * StateManager、音声認識、翻訳の状態変化に応じた連携処理を定義
     */
    setupModuleConnections() {
        
        // 状態管理イベントの購読
        if (this.modules.stateManager) {
            this.modules.stateManager.on('error', (error) => {
                this.handleError(error);
            });
            
            this.modules.stateManager.on('settingsSaved', () => {
            });
            
            // 初期化完了時にUI更新
            this.modules.stateManager.on('initialized', () => {
                if (this.modules.uiController) {
                    setTimeout(() => {
                        this.modules.uiController.updateUIFromState();
                    }, 200);
                }
            });
        }
        
        // 音声認識完了時の処理（統計更新、ログ出力）
        $(document).on('textRecognized', async (event, data) => {
            
            // 使用統計の更新（認識された文字数をカウント）
            this.updateUsageStatistics('recognition', data.text?.length || 0);
        });
        
        // 翻訳完了時の処理（統計更新、ログ出力）
        $(document).on('state:translationStateChanged', (event, state) => {
            if (!state.isLoading && state.translatedText) {
                
                // 使用統計の更新（翻訳実行回数をカウント）
                this.updateUsageStatistics('translation', 1);
            }
        });
        
    }

    /**
     * アプリケーション固有の初期化
     */
    async setupApplication() {
        
        // キーボードショートカット設定
        this.setupKeyboardShortcuts();
        
        // ページ離脱時の処理
        this.setupPageUnloadHandlers();
        
        // 定期処理の開始
        this.startPeriodicTasks();
        
        // デバッグモード対応
        if (DEBUG_CONFIG.enabled) {
            this.setupDebugMode();
        }
        
    }

    /**
     * キーボードショートカット設定
     */
    setupKeyboardShortcuts() {
        $(document).on('keydown', (e) => {
            // F1: ヘルプ（将来的に実装）
            if (e.key === 'F1') {
                e.preventDefault();
            }
            
            // Escape: 音声認識の緊急停止
            if (e.key === 'Escape') {
                if (this.modules.speechRecognitionManager) {
                    this.modules.speechRecognitionManager.stop();
                }
            }
            
            // Ctrl + Shift + D: デバッグ情報表示
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                this.showDebugInfo();
            }
        });
        
    }

    /**
     * ページ離脱時のクリーンアップ処理
     * ユーザーがページを離れる際の必要な処理を実行
     * 音声認識停止、設定保存、進行中処理の警告表示
     */
    setupPageUnloadHandlers() {
        $(window).on('beforeunload', (e) => {
            // 音声認識の安全な停止
            if (this.modules.speechRecognitionManager) {
                this.modules.speechRecognitionManager.stop();
            }
            
            // ユーザー設定の保存
            if (this.modules.stateManager) {
                this.modules.stateManager.saveSettings();
            }
            
            // 重要な処理（音声認識、翻訳）が進行中の場合の警告表示
            const isProcessing = this.modules.stateManager?.getState('translation.isLoading') ||
                                this.modules.stateManager?.getState('recognition.isListening');
            
            if (isProcessing) {
                const message = '処理が進行中です。ページを離れますか？';
                e.returnValue = message;
                return message;
            }
        });
    }

    /**
     * 定期処理タスクの開始
     * 使用統計の更新、UI統計の更新などの定期的な処理を設定
     * パフォーマンスへの影響を最小限にするため適切な間隔で実行
     */
    startPeriodicTasks() {
        // 使用時間統計の更新（1分間隔）
        setInterval(() => {
            this.updateUsageStatistics('time', 60);
        }, 60000);
        
        // デバッグモード時のUI統計更新（10秒間隔）
        if (this.modules.uiController && DEBUG_CONFIG.enabled) {
            setInterval(() => {
                this.modules.uiController.updateStats();
            }, 10000);
        }
        
    }

    /**
     * 統一エラーハンドリングシステム
     * 各モジュールからのエラーをカテゴリ別に処理
     * エラー情報のログ出力、統計情報の更新、必要に応じてユーザーへの通知
     * 
     * @param {Object} error - エラーオブジェクト（category, code, message）
     */
    handleError(error) {
        // エラー発生回数の追跡
        this.errorCount++;
        
        // エラーカテゴリ別の処理分岐
        switch (error.category) {
            case 'SPEECH_RECOGNITION':
                this.handleSpeechRecognitionError(error);
                break;
            case 'TRANSLATION':
                this.handleTranslationError(error);
                break;
            case 'PINYIN':
                this.handlePinyinError(error);
                break;
            case 'SYSTEM':
                this.handleSystemError(error);
                break;
            default:
                console.error('未対応エラーカテゴリ:', error);
        }
    }

    /**
     * 音声認識エラーの個別処理
     * Web Speech APIからのエラーコードに応じた適切なログ出力
     * マイクアクセス許可、音声検出、一般的エラーを区別して処理
     * 
     * @param {Object} error - 音声認識エラーオブジェクト
     */
    handleSpeechRecognitionError(error) {
        // ブラウザ拡張機能による一般的なエラーをフィルタリング
        if (error && error.message && 
            (error.message.includes('message port closed') || 
             error.message.includes('message channel closed'))) {
            // 拡張機能関連のエラーは無視（音声認識機能に影響なし）
            return;
        }
        
        if (error.code === 'NOT_ALLOWED') {
            console.error('音声認識エラー: マイクへのアクセスが許可されていません', error);
        } else if (error.code === 'NO_SPEECH') {
            console.warn('音声認識: 音声が検出されませんでした', error);
        } else if (error && error.code) {
            // 実際の音声認識エラーのみログ出力
            console.error('音声認識エラー:', error);
        }
    }

    /**
     * 翻訳エラーの個別処理
     * Google Gemini API関連エラーの適切なログ出力
     * APIキー未設定、レート制限、ネットワークエラーなどを区別して処理
     * 
     * @param {Object} error - 翻訳エラーオブジェクト
     */
    handleTranslationError(error) {
        if (error.code === 'API_KEY_MISSING') {
            console.warn('翻訳エラー: Gemini APIキーが設定されていません', error);
        } else {
            console.error('翻訳エラー:', error);
        }
    }

    /**
     * ピンイン変換エラーの個別処理
     * pinyin-proライブラリ関連エラーの適切なログ出力
     * ライブラリ未読み込みエラーなどを処理
     * 
     * @param {Object} error - ピンイン変換エラーオブジェクト
     */
    handlePinyinError(error) {
        if (error.code === 'LIBRARY_NOT_LOADED') {
            console.warn('ピンイン変換エラー: ライブラリが読み込まれていません', error);
        }
    }

    /**
     * システムレベルエラーの個別処理
     * アプリケーション全体に影響する可能性のあるエラーのログ出力
     * ランタイムエラー、Promiseリジェクションなどを処理
     * 
     * @param {Object} error - システムエラーオブジェクト
     */
    handleSystemError(error) {
        console.error('システムエラー:', error);
    }

    /**
     * 使用統計情報の更新と永続化
     * ユーザーのアプリケーション使用状況を追跡し、localStorageに保存
     * 使用時間、認識文字数、翻訳回数などを統計
     * 
     * @param {string} type - 統計タイプ（'time'|'recognition'|'translation'）
     * @param {number} value - 更新する値
     */
    updateUsageStatistics(type, value) {
        try {
            const data = this.modules.stateManager?.storage.load();
            if (!data || !data.statistics) return;
            
            switch (type) {
                case 'time':
                    data.statistics.totalUsageTime += value;
                    break;
                case 'recognition':
                    data.statistics.totalRecognizedChars += value;
                    break;
                case 'translation':
                    data.statistics.totalTranslations += value;
                    break;
            }
            
            data.statistics.lastUsedDate = new Date().toISOString();
            this.modules.stateManager?.storage.save(data);
            
        } catch (error) {
            console.error('使用統計更新エラー:', error);
        }
    }

    /**
     * 致命的エラー表示
     */
    showFatalError(message) {
        const errorHtml = `
            <div class="alert alert-danger position-fixed w-100" style="top: 0; left: 0; z-index: 9999; border-radius: 0;">
                <div class="container">
                    <h4><i class="bi bi-exclamation-triangle"></i> 致命的エラー</h4>
                    <p>${Utils.escapeHtml(message)}</p>
                    <button class="btn btn-outline-danger" onclick="location.reload()">
                        <i class="bi bi-arrow-clockwise"></i> ページを再読み込み
                    </button>
                </div>
            </div>
        `;
        
        $('body').prepend(errorHtml);
    }

    /**
     * 初期化完了通知
     */
    showInitializationComplete() {
        
        // デバッグモードの場合のみ表示
        if (DEBUG_CONFIG.enabled) {
        }
    }

    /**
     * デバッグモード設定
     */
    setupDebugMode() {
        
        // グローバルデバッグ関数
        window.debugApp = () => {
            return this.getDebugInfo();
        };
        
        // パフォーマンス監視
        if (DEBUG_CONFIG.showPerformance) {
            this.startPerformanceMonitoring();
        }
    }

    /**
     * パフォーマンス監視開始
     */
    startPerformanceMonitoring() {
        setInterval(() => {
            const memory = performance.memory;
            const timing = performance.timing;
        }, 30000);
    }

    /**
     * デバッグ情報表示
     */
    showDebugInfo() {
        const debugInfo = this.getDebugInfo();
        
        // モーダル表示（簡易版）
        alert(`Debug Info:\n${JSON.stringify(debugInfo, null, 2)}`);
    }

    /**
     * デバッグ情報取得
     */
    getDebugInfo() {
        return {
            app: {
                isInitialized: this.isInitialized,
                startTime: this.startTime,
                uptime: Date.now() - this.startTime,
                modules: Object.keys(this.modules)
            },
            modules: Object.fromEntries(
                Object.entries(this.modules).map(([name, module]) => [
                    name,
                    module.getDebugInfo ? module.getDebugInfo() : 'No debug info available'
                ])
            ),
            browser: Utils.checkBrowserSupport(),
            performance: {
                memory: performance.memory ? {
                    used: performance.memory.usedJSHeapSize,
                    total: performance.memory.totalJSHeapSize
                } : null,
                timing: performance.timing
            }
        };
    }

    /**
     * アプリケーション終了処理
     */
    shutdown() {
        
        // モジュール終了処理
        Object.values(this.modules).forEach(module => {
            if (module && typeof module.destroy === 'function') {
                try {
                    module.destroy();
                } catch (error) {
                }
            }
        });
        
        // 状態リセット
        this.modules = {};
        this.isInitialized = false;
        
    }

    /**
     * アプリケーション再起動
     */
    async restart() {
        
        this.shutdown();
        
        // 少し待ってから再初期化
        setTimeout(async () => {
            await this.initialize();
        }, 1000);
    }
}

// アプリケーション初期化
$(document).ready(async function() {
    
    // グローバルアプリケーションインスタンス
    window.chineseLearningApp = new ChineseLearningApp();
    
    // 初期化実行
    const success = await window.chineseLearningApp.initialize();
    
    if (!success) {
    }
});

// エラーハンドリング
window.addEventListener('error', (event) => {
    if (window.chineseLearningApp) {
        window.chineseLearningApp.handleError({
            category: 'SYSTEM',
            code: 'RUNTIME_ERROR',
            message: event.error?.message || 'Unknown error'
        });
    }
});

window.addEventListener('unhandledrejection', (event) => {
    if (window.chineseLearningApp) {
        window.chineseLearningApp.handleError({
            category: 'SYSTEM',
            code: 'PROMISE_REJECTION',
            message: event.reason?.message || 'Promise rejection'
        });
    }
});