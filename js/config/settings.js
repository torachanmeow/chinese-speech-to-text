/**
 * アプリケーション設定
 * Chinese Speech to Text
 */


// ========================================================================================
// システム設定
// ========================================================================================

// 音声認識システム設定
const SPEECH_CONFIG = {
    continuous: true,           // 連続認識
    interimResults: true,       // 中間結果表示
    maxAlternatives: 1,         // 代替候補数
    deadTime: 3000,            // Watchdog判定時間（ms）
    maxSessionTime: 30000,     // 最大セッション時間（ms）
    watchdogInterval: 500,      // Watchdog監視間隔（ms）
    maxErrorCount: 5,          // 最大エラー回数
    restartDelay: 1000,        // 再起動遅延（ms）
    duplicateCheckTimeout: 1000 // 重複処理チェック有効時間（ms）
};

// UIシステム設定
const UI_CONFIG = {
    maxTextLines: 50,          // 最大テキスト行数
    interimTextCleanupDelay: {
        // 中間テキスト削除の段階的遅延設定（'delayed'モード用）
        first: 10,             // DOM更新後の1回目削除遅延（ms）
        final: 50              // 確実性保証の最終削除遅延（ms）
    },
    buttonTexts: {
        recognition: '音声認識',
        recognizing: '音声認識中...',
        error: 'エラー - 再試行',
        interim: '認識中...'
    }
};

// API設定
const API_CONFIG = {
    GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models/',
    REQUEST_TIMEOUT: 30000,    // リクエストタイムアウト（ms）
    MAX_RETRIES: 3,           // 最大リトライ回数
    RETRY_DELAY: 1000         // リトライ遅延（ms）
};

// ローカルストレージ設定
const STORAGE_CONFIG = {
    KEY_PREFIX: 'chinese_speech_to_text_',
    SETTINGS_KEY: 'settings',
    VERSION: '1.0.0'
};

// ========================================================================================
// エラーメッセージ定義
// ========================================================================================
const ERROR_MESSAGES = {
    // 音声認識関連エラー
    SPEECH_RECOGNITION: {
        NOT_ALLOWED: 'マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。',
        NO_SPEECH: '音声が検出されませんでした。マイクの設定を確認してください。',
        ABORTED: '音声認識が中断されました。',
        AUDIO_CAPTURE: '音声キャプチャでエラーが発生しました。',
        NETWORK: 'ネットワークエラーが発生しました。',
        NOT_SUPPORTED: 'このブラウザは音声認識をサポートしていません。'
    },
    
    // 翻訳関連エラー
    TRANSLATION: {
        API_KEY_MISSING: 'Gemini APIキーが設定されていません。設定メニューから入力してください。',
        API_ERROR: '翻訳APIでエラーが発生しました。しばらく待ってから再試行してください。',
        RATE_LIMIT: 'APIリクエスト制限に達しました。しばらく待ってから再試行してください。',
        INVALID_RESPONSE: '不正なAPI応答です。APIキーを確認してください。',
        NETWORK_ERROR: 'ネットワークエラーが発生しました。接続を確認してください。',
        TEXT_TOO_LONG: '翻訳するテキストが長すぎます。'
    },
    
    // ピンイン変換関連エラー
    PINYIN: {
        LIBRARY_NOT_LOADED: 'ピンイン変換ライブラリが読み込まれていません。ページを再読み込みしてください。',
        CONVERSION_FAILED: 'ピンイン変換に失敗しました。'
    },
    
    // システム関連エラー
    SYSTEM: {
        BROWSER_NOT_SUPPORTED: 'このブラウザはサポートされていません。Chrome、Firefox、Edgeをお使いください。',
        STORAGE_ERROR: 'データ保存でエラーが発生しました。ブラウザの設定を確認してください。',
        INITIALIZATION_FAILED: 'アプリケーションの初期化に失敗しました。'
    }
};

// ========================================================================================
// ユーザー設定
// ========================================================================================

// デフォルト設定
const DEFAULT_SETTINGS = {
    language: 'zh-CN',          // 認識言語
    geminiApiKey: '',           // Gemini APIキー
    geminiModel: 'gemini-2.5-flash-lite', // 使用モデル
    maxTextLines: 50,           // 最大テキスト行数
    autoScroll: true,           // 自動スクロール
    fontSize: 'medium',         // フォントサイズ
    autoTranslate: false,       // 自動翻訳
    theme: 'light',            // テーマ
    translationStyle: '',       // 翻訳スタイル設定
    showTranslationArea: true   // 翻訳エリア表示状態
};

// ========================================================================================
// 開発・デバッグ設定
// ========================================================================================
const DEBUG_CONFIG = {
    enabled: false,             // デバッグモード
    showPerformance: false      // パフォーマンス表示
};


// ========================================================================================
// 統合設定オブジェクト
// ========================================================================================
const APP_CONFIG = {
    SPEECH_CONFIG,
    UI_CONFIG,
    API_CONFIG,
    STORAGE_CONFIG,
    ERROR_MESSAGES,
    DEFAULT_SETTINGS
};

// ========================================================================================
// グローバル公開
// ========================================================================================
window.APP_CONFIG = APP_CONFIG;
window.DEBUG_CONFIG = DEBUG_CONFIG;