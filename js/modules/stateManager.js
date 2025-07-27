/**
 * 状態管理モジュール
 * Chinese Speech to Text
 * 
 * アプリケーション全体の状態を一元管理する中心モジュール
 * 
 * 機能概要:
 * - アプリケーション設定の管理（言語、APIキー、モデルなど）
 * - 音声認識状態の追跡（アクティブ、リスニング、エラーなど）
 * - テキスト履歴の管理（認識結果、ピンイン付きテキスト）
 * - 翻訳状態の管理（ローディング、結果、エラー）
 * - UI要素のキャッシュと同期
 * - localStorageを使用した永続化と復元
 * - リアクティブな状態更新とイベント発行
 */

class StateManager {
    constructor() {
        // ローカルストレージ管理インスタンス
        this.storage = new LocalStorageManager();
        
        // アプリケーションの中心状態オブジェクト
        this.state = this.initializeState();
        
        // イベントリスナー管理（カスタムイベントシステム）
        this.listeners = new Map();
        
        // 初期化完了フラグ
        this.isInitialized = false;
    }

    /**
     * アプリケーションの初期状態を設定
     * localStorageから保存済み設定を読み込み、デフォルト値とマージ
     * 各モジュールの状態を統一的に管理するための構造を作成
     * 
     * @returns {Object} 初期化された状態オブジェクト
     */
    initializeState() {
        const savedSettings = this.storage.load();
        const apiKey = this.storage.getApiKey();
        
        return {
            // アプリケーションの基本設定
            config: {
                language: savedSettings.settings?.language || APP_CONFIG.DEFAULT_SETTINGS.language,
                geminiApiKey: apiKey,
                geminiModel: savedSettings.settings?.geminiModel || APP_CONFIG.DEFAULT_SETTINGS.geminiModel,
                maxTextLines: savedSettings.settings?.maxTextLines || APP_CONFIG.DEFAULT_SETTINGS.maxTextLines,
                autoScroll: true, // 常にONでスタート
                fontSize: savedSettings.preferences?.fontSize || APP_CONFIG.DEFAULT_SETTINGS.fontSize,
                autoTranslate: savedSettings.preferences?.autoTranslate || APP_CONFIG.DEFAULT_SETTINGS.autoTranslate,
                theme: savedSettings.settings?.theme || APP_CONFIG.DEFAULT_SETTINGS.theme,
                translationStyle: savedSettings.settings?.translationStyle || APP_CONFIG.DEFAULT_SETTINGS.translationStyle,
                showTranslationArea: savedSettings.settings?.showTranslationArea !== undefined ? savedSettings.settings.showTranslationArea : APP_CONFIG.DEFAULT_SETTINGS.showTranslationArea
            },
            
            // 音声認識モジュールの状態管理
            recognition: {
                isActive: false,
                isListening: false,
                sessionId: null,
                currentText: '',
                interimText: '',
                finalText: '',
                lastResultTime: 0,
                errorCount: 0,
                recognitionInstance: null
            },
            
            // 認識されたテキストの履歴管理
            // 各エントリにはタイムスタンプ、原文、ピンイン付きテキストを含む
            textHistory: [],
            
            // 翻訳モジュールの状態管理
            translation: {
                isLoading: false,
                selectedText: '',
                originalText: '',
                translatedText: '',
                lastTranslationTime: 0
            },
            
            // UI要素のjQueryオブジェクトキャッシュ
            // パフォーマンス向上のため頁繁なDOM検索を回避
            ui: {
                $recognitionBtn: null,
                $languageSelector: null,
                $mainTextArea: null,
                $translationArea: null,
                $settingsModal: null,
                $apiKeyInput: null,
                $loadingToast: null,
                $errorToast: null
            },
            
            // システム全体の状態とブラウザ対応情報
            system: {
                isInitialized: false,
                supportsSpeechRecognition: false,
                pinyinLibraryLoaded: false,
                lastError: null,
                browserSupport: null
            }
        };
    }

    /**
     * アプリケーションのメイン初期化処理
     * ブラウザサポート確認、UI要素キャッシュ、イベントリスナー設定、設定復元を実行
     * 各モジュールが利用できる状態にアプリケーションを整える
     * 
     * @returns {Promise<boolean>} 初期化成功可否
     */
    async initialize() {
        try {
            
            // ブラウザサポート確認
            this.state.system.browserSupport = Utils.checkBrowserSupport();
            this.state.system.supportsSpeechRecognition = this.state.system.browserSupport.speechRecognition;
            
            // pinyin-proライブラリ確認
            this.state.system.pinyinLibraryLoaded = typeof window.pinyin === 'function';
            
            // UI要素キャッシュ
            this.cacheUIElements();
            
            // イベントリスナー設定
            this.setupEventListeners();
            
            // 設定の復元
            await this.restoreSettings();
            
            this.state.system.isInitialized = true;
            this.isInitialized = true;
            
            
            // 初期化完了を通知
            this.emit('initialized', this.state);
            
            return true;
        } catch (error) {
            this.setError('SYSTEM', 'INITIALIZATION_FAILED', error.message);
            return false;
        }
    }

    /**
     * メインUI要素のjQueryオブジェクトをキャッシュ
     * DOM検索のパフォーマンス最適化と频繁な状態更新の高速化
     * 各モジュールから直接UIを操作する際の中央集権化
     */
    cacheUIElements() {
        this.state.ui = {
            $recognitionBtn: $('#recognition-btn'),
            $languageSelector: $('input[name="language"]'),
            $mainTextArea: $('#main-text'),
            $translationArea: $('#translation-display'),
            $settingsModal: $('#settingsModal'),
            $apiKeyInput: $('#gemini-api-key'),
            $loadingToast: $('#loading-toast'),
            $errorToast: $('#error-toast'),
            $clearTextBtn: $('#clear-text-btn'),
            $saveSettingsBtn: $('#save-settings')
        };
    }

    /**
     * アプリケーションレベルのイベントリスナー設定
     * グローバルイベント（状態変更、ページ離脱）のハンドリング
     * 状態の自動保存とモジュール間連携を実現
     */
    setupEventListeners() {
        // 状態変更の監視
        $(document).on('stateChange', (event, data) => {
            this.handleStateChange(data.type, data.data);
        });

        // ページ離脱時の保存
        $(window).on('beforeunload', () => {
            this.saveSettings();
        });
    }

    /**
     * localStorageからの設定復元処理
     * 保存済みのAPIキー、言語設定、その他のユーザー設定を復元
     * エラー時はデフォルト値で継続し、アプリケーションを中断させない
     * 
     * @returns {Promise<void>}
     */
    async restoreSettings() {
        try {
            const savedData = this.storage.load();
            
            // API キーの復元
            if (savedData.settings?.geminiApiKey) {
                this.state.config.geminiApiKey = this.storage.getApiKey();
            }
        } catch (error) {
        }
    }

    /**
     * ネストした状態プロパティの動的更新
     * ドット記法（'config.language'）で深いプロパティを安全に更新
     * 変更前後の値を追跡し、イベントを発行して他モジュールに通知
     * 
     * @param {string} path - 状態パス（例: 'config.language', 'recognition.isActive'）
     * @param {any} value - 設定する新しい値
     */
    setState(path, value) {
        try {
            const pathArray = path.split('.');
            let current = this.state;
            
            // 最後のキー以外をたどる
            for (let i = 0; i < pathArray.length - 1; i++) {
                if (!(pathArray[i] in current)) {
                    current[pathArray[i]] = {};
                }
                current = current[pathArray[i]];
            }
            
            // 値を設定
            const lastKey = pathArray[pathArray.length - 1];
            const oldValue = current[lastKey];
            current[lastKey] = value;
            
            // 変更を通知
            this.emit('stateChanged', {
                path,
                oldValue,
                newValue: value
            });
            
            
        } catch (error) {
        }
    }

    /**
     * ネストした状態プロパティの安全な取得
     * ドット記法で深いプロパティにアクセスし、存在しない場合はundefinedを返す
     * nullチェックやプロパティの存在確認を組み込み、エラー耐性を提供
     * 
     * @param {string} [path] - 状態パス（省略時は全状態を返す）
     * @returns {any} 指定されたパスの値または全状態
     */
    getState(path) {
        try {
            if (!path) return this.state;
            
            const pathArray = path.split('.');
            let current = this.state;
            
            for (const key of pathArray) {
                if (current === null || current === undefined || !(key in current)) {
                    return undefined;
                }
                current = current[key];
            }
            
            return current;
        } catch (error) {
            return undefined;
        }
    }

    /**
     * 音声認識モジュール状態のバッチ更新
     * 複数の認識状態を一度に更新し、関連UIの同期を実行
     * 状態変更イベントを発行して他モジュールに通知
     * 
     * @param {Object} updates - 更新する認識状態プロパティのオブジェクト
     */
    updateRecognitionState(updates) {
        const currentState = this.state.recognition;
        Object.assign(currentState, updates);
        
        this.emit('recognitionStateChanged', currentState);
        
        // UI同期
        this.syncRecognitionUI();
    }

    /**
     * 翻訳モジュール状態のバッチ更新
     * 翻訳ローディング、結果、エラー状態などを一度に更新
     * 翻訳状態変更イベントを発行してUIコントローラーに通知
     * 
     * @param {Object} updates - 更新する翻訳状態プロパティのオブジェクト
     */
    updateTranslationState(updates) {
        const currentState = this.state.translation;
        Object.assign(currentState, updates);
        
        this.emit('translationStateChanged', currentState);
        
    }

    /**
     * 新しいテキストエントリを履歴に追加
     * タイムスタンプと一意のIDを付与し、最新順で配置
     * 最大行数制限を適用し、古いエントリを自動削除
     * 履歴更新イベントを発行してUI更新をトリガー
     * 
     * @param {Object} textData - テキストデータ（originalText, rubyText, languageなど）
     */
    addTextHistory(textData) {
        const history = this.state.textHistory;
        const newEntry = {
            id: Utils.generateId('text'),
            timestamp: Date.now(),
            ...textData
        };
        
        history.unshift(newEntry);
        
        // 最大行数制限（0の場合は無制限）
        const maxLines = this.state.config.maxTextLines;
        if (maxLines > 0 && history.length > maxLines) {
            history.splice(maxLines);
        }
        
        this.emit('textHistoryChanged', newEntry);
    }

    /**
     * アプリケーションエラーの記録と通知
     * エラー情報を統一フォーマットで管理し、関連モジュールに通知
     * エラーカテゴリ、コード、メッセージ、詳細情報を含む
     * 
     * @param {string} category - エラーカテゴリ（SPEECH_RECOGNITION, TRANSLATION, SYSTEMなど）
     * @param {string} code - エラーコード（NOT_SUPPORTED, API_KEY_MISSINGなど）
     * @param {string} [details] - エラー詳細情報（オプション）
     */
    setError(category, code, details = null) {
        const error = {
            id: Utils.generateId('error'),
            category,
            code,
            message: Utils.getErrorMessage(category, code),
            details,
            timestamp: Date.now()
        };
        
        this.state.system.lastError = error;
        this.emit('error', error);
        
    }

    /**
     * 現在の状態をlocalStorageに保存
     * ユーザー設定、プリファレンス、統計情報を含む包括的な保存
     * APIキーの簡易暗号化（Base64）とバージョン管理を実行
     * 保存成功時にはイベントを発行して他モジュールに通知
     * 
     * @returns {boolean} 保存成功可否
     */
    saveSettings() {
        try {
            const settingsData = {
                version: APP_CONFIG.STORAGE_CONFIG.VERSION,
                settings: {
                    language: this.state.config.language,
                    geminiApiKey: this.state.config.geminiApiKey ? btoa(this.state.config.geminiApiKey) : '',
                    geminiModel: this.state.config.geminiModel,
                    maxTextLines: this.state.config.maxTextLines,
                    autoScroll: this.state.config.autoScroll,
                    theme: this.state.config.theme,
                    translationStyle: this.state.config.translationStyle,
                    showTranslationArea: this.state.config.showTranslationArea
                },
                preferences: {
                    fontSize: this.state.config.fontSize,
                    autoTranslate: this.state.config.autoTranslate
                },
                statistics: {
                    totalUsageTime: 0,
                    totalRecognizedChars: 0,
                    totalTranslations: 0,
                    lastUsedDate: new Date().toISOString()
                }
            };
            
            const success = this.storage.save(settingsData);
            
            if (success) {
                this.emit('settingsSaved', settingsData);
            } else {
                throw new Error('保存に失敗しました');
            }
            
            return success;
        } catch (error) {
            this.setError('SYSTEM', 'STORAGE_ERROR', error.message);
            return false;
        }
    }

    /**
     * Google Gemini APIキーの個別保存
     * システム状態とlocalStorageの両方を更新し、一貫性を保持
     * 簡易暗号化（Base64）でストレージに保存
     * 
     * @param {string} apiKey - Google Gemini APIキー
     * @returns {boolean} 保存成功可否
     */
    saveApiKey(apiKey) {
        try {
            this.state.config.geminiApiKey = apiKey;
            const success = this.storage.saveApiKey(apiKey);
            
            if (success) {
                this.emit('apiKeySaved', { hasKey: !!apiKey });
            } else {
            }
            
            return success;
        } catch (error) {
            this.setError('SYSTEM', 'STORAGE_ERROR', error.message);
            return false;
        }
    }

    /**
     * 音声認識状態とUIの同期処理
     * 認識ボタンの状態（アクティブ、エラー、スタンバイ）を管理
     * ボタンの色、テキスト、アニメーションを認識状態に応じて更新
     */
    syncRecognitionUI() {
        const recognition = this.state.recognition;
        const $btn = this.state.ui.$recognitionBtn;
        
        if ($btn && $btn.length) {
            $btn.removeClass('btn-secondary btn-success btn-danger');
            
            if (recognition.isListening) {
                $btn.addClass('btn-success');
                $btn.find('#btn-text').text('音声認識中...');
            } else if (recognition.errorCount > 0) {
                $btn.addClass('btn-danger');
                $btn.find('#btn-text').text('エラー - 再試行');
            } else {
                $btn.addClass('btn-secondary');
                $btn.find('#btn-text').text('開始音声認識');
            }
        }
    }


    /**
     * カスタムイベントシステムでのイベント発行
     * 内部リスナーとjQueryイベントの両方で通知を送信
     * エラーハンドリングでコールバック実行失敗を吸収
     * 
     * @param {string} eventName - イベント名
     * @param {any} data - イベントデータ
     */
    emit(eventName, data) {
        if (this.listeners.has(eventName)) {
            const callbacks = this.listeners.get(eventName);
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                }
            });
        }
        
        // jQueryイベントとしても発行
        $(document).trigger(`state:${eventName}`, data);
    }

    /**
     * カスタムイベントリスナーの登録
     * 特定イベントに対するコールバック関数を登録
     * 同一イベントに複数のリスナーを登録可能
     * 
     * @param {string} eventName - イベント名
     * @param {Function} callback - コールバック関数
     */
    on(eventName, callback) {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        this.listeners.get(eventName).push(callback);
    }

    /**
     * 特定イベントリスナーの削除
     * 登録済みコールバックを安全に除去し、メモリリークを防止
     * 
     * @param {string} eventName - イベント名
     * @param {Function} callback - 削除するコールバック関数
     */
    off(eventName, callback) {
        if (this.listeners.has(eventName)) {
            const callbacks = this.listeners.get(eventName);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * アプリケーション状態の完全リセット
     * 全モジュールの状態を初期値に戻し、クリーンな状態で再開
     * リセットイベントを発行して他モジュールに通知
     */
    reset() {
        this.state = this.initializeState();
        this.emit('stateReset', this.state);
    }

    /**
     * デバッグとトラブルシューティング用の詳細情報を取得
     * 現在の状態、初期化状態、イベントリスナー数などを含む
     * 状態のディープコピーで外部からの変更を防止
     * 
     * @returns {Object} デバッグ情報オブジェクト
     */
    getDebugInfo() {
        return {
            state: Utils.deepClone(this.state),
            isInitialized: this.isInitialized,
            listenerCount: Array.from(this.listeners.entries()).map(([name, callbacks]) => ({
                name,
                count: callbacks.length
            }))
        };
    }

    /**
     * 内部状態変更イベントのハンドラー
     * 特定の状態変更に対する追加処理を実行
     * UI同期やモジュール間連携のためのハブ機能
     * 
     * @param {string} type - 変更タイプ
     * @param {any} data - 変更データ
     */
    handleStateChange(type, data) {
        switch (type) {
            case 'recognition':
                this.syncRecognitionUI();
                break;
            case 'translation':
                // 翻訳状態変更はjQueryイベントで処理
                break;
            case 'textHistory':
                // テキスト履歴変更時の処理
                break;
            default:
        }
    }
}

/**
 * localStorage管理クラス
 * アプリケーション設定の永続化、復元、バージョン管理を担当
 * 
 * 機能概要:
 * - ユーザー設定のlocalStorageへの保存と読み込み
 * - APIキーの簡易暗号化（Base64）保存
 * - バージョン管理とマイグレーションサポート
 * - エラー耐性とフォールバック処理
 * - ストレージ容量制限のハンドリング
 */
class LocalStorageManager {
    constructor() {
        this.storageKey = `${APP_CONFIG.STORAGE_CONFIG.KEY_PREFIX}${APP_CONFIG.STORAGE_CONFIG.SETTINGS_KEY}`;
        this.defaultData = this.getDefaultData();
    }

    /**
     * デフォルト設定データの生成
     * 初回起動時や設定リセット時に使用する基本設定
     * APP_CONFIGからデフォルト値を取得し、深いコピーで独立性を保証
     * 
     * @returns {Object} デフォルト設定オブジェクト
     */
    getDefaultData() {
        return {
            version: APP_CONFIG.STORAGE_CONFIG.VERSION,
            settings: Utils.deepClone(APP_CONFIG.DEFAULT_SETTINGS),
            preferences: {
                fontSize: 'medium',
                autoTranslate: false
            },
            statistics: {
                totalUsageTime: 0,
                totalRecognizedChars: 0,
                totalTranslations: 0,
                lastUsedDate: null
            }
        };
    }

    /**
     * localStorageから設定データを読み込み
     * JSONパースエラーやデータ破損に対するフォールバック処理
     * データが存在しない場合はデフォルト値を返す
     * 
     * @returns {Object} 読み込まれた設定データまたはデフォルトデータ
     */
    load() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? Utils.safeJsonParse(data, this.defaultData) : this.defaultData;
        } catch (error) {
            return this.defaultData;
        }
    }

    /**
     * 設定データをlocalStorageに保存
     * JSON文字列化エラーやストレージ容量超過に対するエラーハンドリング
     * 
     * @param {Object} data - 保存する設定データ
     * @returns {boolean} 保存成功可否
     */
    save(data) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(data));
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 部分的な設定更新
     * 既存設定とマージして部分更新を実行
     * 全体を上書きせずに特定プロパティのみ変更
     * 
     * @param {Object} newSettings - 更新する設定プロパティ
     * @returns {boolean} 更新成功可否
     */
    updateSettings(newSettings) {
        const data = this.load();
        data.settings = { ...data.settings, ...newSettings };
        return this.save(data);
    }

    /**
     * APIキーの安全な保存
     * Base64で簡易暗号化してlocalStorageに保存
     * プレーンテキストでのAPIキー保存を防止
     * 
     * @param {string} apiKey - Google Gemini APIキー
     * @returns {boolean} 保存成功可否
     */
    saveApiKey(apiKey) {
        const data = this.load();
        data.settings.geminiApiKey = btoa(apiKey); // 簡易暗号化
        return this.save(data);
    }

    /**
     * 保存済みAPIキーの取得と復号化
     * Base64で暗号化されたAPIキーを復号化して返す
     * 復号化エラー時は空文字列を返して安全に処理
     * 
     * @returns {string} 復号化されたAPIキーまたは空文字列
     */
    getApiKey() {
        const data = this.load();
        try {
            return data.settings.geminiApiKey ? atob(data.settings.geminiApiKey) : '';
        } catch {
            return '';
        }
    }

    /**
     * 全設定データの削除
     * localStorageからアプリケーション関連設定を完全削除
     * リセット時やデバッグ時のクリーンアップに使用
     * 
     * @returns {boolean} 削除成功可否
     */
    clear() {
        try {
            localStorage.removeItem(this.storageKey);
            return true;
        } catch (error) {
            return false;
        }
    }
}

// グローバルインスタンス
window.stateManager = new StateManager();