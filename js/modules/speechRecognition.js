/**
 * 音声認識モジュール
 * Chinese Speech to Text
 * 
 * Web Speech APIを使用して中国語音声をリアルタイムでテキスト化するモジュール
 * 自動再起動、エラー処理、ピンイン変換機能を含む
 * 
 * 機能概要:
 * - Web Speech APIを使用した中国語音声認識
 * - セッション管理による安定した認識処理
 * - Watchdog機能による自動再起動
 * - エラーハンドリングと自動復旧
 * - リアルタイム結果処理とピンイン変換連携
 * - 言語切り替え対応（簡体字中国語・繁体字中国語）
 */

// 音声認識設定定数
const RECOGNITION_CONSTANTS = {
    MAX_SESSION_TIMEOUT: 30000,        // セッションタイムアウト（30秒）
    RESTART_COOLDOWN: 500,             // 再起動時の待機時間（ミリ秒）
    ERROR_THRESHOLD: 5,                // エラー回数の閾値
    RESULT_BUFFER_SIZE: 100            // 結果バッファサイズ
};

class SpeechRecognitionManager {
    constructor() {
        // Web Speech API認識インスタンス
        this.recognition = null;
        
        // 認識状態管理
        this.isRecognizing = false;       // 現在認識中かどうか
        this.sessionId = null;            // 現在のセッションID
        
        // Watchdog機能（認識停止検知・自動再起動）
        this.watchdogTimer = null;        // Watchdogタイマー
        this.lastResultTime = 0;          // 最後に結果を受信した時刻
        this.sessionStartTime = 0;        // セッション開始時刻
        
        // エラー管理
        this.errorCount = 0;              // 連続エラー回数
        
        // 外部連携
        this.pinyinConverter = null;      // ピンイン変換器インスタンス
        
        // 重複防止
        this.processedTexts = new Set();  // 処理済みテキストの追跡
        
        // 手動停止フラグ
        this.manualStop = false;          // 手動停止時の自動再開防止
        
        // 設定の読み込み
        this.config = APP_CONFIG.SPEECH_CONFIG;
        
        // 初期化実行
        this.initializeRecognition();
    }

    /**
     * 音声認識の初期化
     * Web Speech APIの利用可能性を確認し、認識インスタンスを作成
     * ブラウザ対応チェックと基本設定を実行
     * 
     * @returns {boolean} 初期化成功可否
     */
    initializeRecognition() {
        try {
            // ブラウザ対応確認
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            
            if (!SpeechRecognition) {
                stateManager.setError('SPEECH_RECOGNITION', 'NOT_SUPPORTED');
                return false;
            }

            this.recognition = new SpeechRecognition();
            this.setupRecognitionConfig();
            this.setupEventHandlers();
            
            return true;
            
        } catch (error) {
            stateManager.setError('SPEECH_RECOGNITION', 'NOT_SUPPORTED', error.message);
            return false;
        }
    }

    /**
     * 音声認識の基本設定
     * 連続認識、中間結果、最大候補数、言語などを設定
     * stateManagerから現在の言語設定を取得して適用
     */
    setupRecognitionConfig() {
        if (!this.recognition) return;

        this.recognition.continuous = this.config.continuous;
        this.recognition.interimResults = this.config.interimResults;
        this.recognition.maxAlternatives = this.config.maxAlternatives;
        
        // 言語設定
        const language = stateManager.getState('config.language') || 'zh-CN';
        const speechLang = language;
        this.recognition.lang = speechLang;
    }

    /**
     * Web Speech APIイベントハンドラー設定
     * 認識開始・終了・結果受信・エラーなどの各イベントを処理
     * セッション管理とWatchdog機能を統合
     */
    setupEventHandlers() {
        if (!this.recognition) return;

        // 音声認識開始イベント
        // セッションIDを生成し、状態管理とWatchdogを開始
        this.recognition.onstart = () => {
            this.isRecognizing = true;
            this.sessionId = Utils.generateId('session');
            this.lastResultTime = Date.now();
            this.sessionStartTime = Date.now();
            this.errorCount = 0;
            
            stateManager.updateRecognitionState({
                isActive: true,
                isListening: true,
                sessionId: this.sessionId,
                recognitionInstance: this.recognition
            });
            
            this.startWatchdog();
        };

        // 音声認識終了イベント
        // 予期しない終了時の自動再開と状態クリア
        this.recognition.onend = () => {
            const wasRecognizing = this.isRecognizing;
            
            this.resetInternalState();
            this.resetStateManagerState();
            
            // 音声認識終了時に残っている中間結果をクリア
            $(document).trigger('clearInterimText');
            
            // 予期しない終了の場合は自動再開（手動停止以外）
            if (wasRecognizing && !this.manualStop) {
                setTimeout(() => {
                    this.safeRestart();
                }, this.config.restartDelay);
            }
            
            // 手動停止フラグをリセット
            this.manualStop = false;
        };

        // 音声認識結果受信イベント
        // 中間結果と最終結果を処理し、ピンイン変換と連携
        this.recognition.onresult = (event) => {
            this.handleResult(event);
        };

        // エラーハンドリング
        // エラーコードに応じた処理と自動再起動判定
        this.recognition.onerror = (event) => {
            this.handleError(event);
        };

        // 音声検出なしイベント
        // 音声は検出されたが認識可能なテキストが見つからない場合
        this.recognition.onnomatch = () => {
            // 現在は特別な処理なし（ログ出力のみ）
        };

        // 音声入力開始イベント
        // マイクロフォンから音声の検出開始
        this.recognition.onsoundstart = () => {
            // 現在は特別な処理なし（将来的にUI状態更新など）
        };

        // 音声入力終了イベント
        // マイクロフォンからの音声検出終了
        this.recognition.onsoundend = () => {
            // 現在は特別な処理なし（将来的にUI状態更新など）
        };

        // 発話開始イベント
        // 認識可能な音声の開始検出
        this.recognition.onspeechstart = () => {
            // 現在は特別な処理なし（将来的にリアルタイム状態表示など）
        };

        // 発話終了イベント
        // 認識可能な音声の終了検出
        this.recognition.onspeechend = () => {
            // 現在は特別な処理なし（将来的にリアルタイム状態表示など）
        };
    }

    /**
     * 音声認識結果処理
     * Web Speech APIから受信した認識結果を処理
     * 中間結果（リアルタイム）と最終結果を分離して処理
     * セッション管理により古いセッションからの結果を無視
     * 
     * @param {SpeechRecognitionEvent} event - 音声認識結果イベント
     */
    handleResult(event) {
        try {
            const currentSessionId = this.sessionId;
            this.lastResultTime = Date.now();
            
            let interimTranscript = '';
            let finalTranscript = '';
            
            // 結果を処理
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0].transcript;
                
                if (result.isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            
            // セッション確認（Watchdog対策）
            if (currentSessionId !== this.sessionId) {
                return;
            }
            
            // 状態更新
            if (interimTranscript) {
                stateManager.updateRecognitionState({
                    interimText: interimTranscript,
                    currentText: finalTranscript + interimTranscript
                });
                
                // UIに中間結果を通知
                $(document).trigger('interimTextRecognized', {
                    text: interimTranscript
                });
            }
            
            if (finalTranscript) {
                this.processFinalResult(finalTranscript);
            }
            
        } catch (error) {
        }
    }

    /**
     * 最終認識結果の処理とピンイン変換
     * 確定したテキストをクリーニングし、ピンイン変換を実行
     * テキスト履歴への追加とUI更新イベントを発火
     * 
     * @param {string} text - 認識された最終テキスト
     * @returns {Promise<void>}
     */
    async processFinalResult(text) {
        try {
            let trimmedText = Utils.trimChinese(text);
            if (!trimmedText) return;
            
            // 重複処理チェック：同じテキストを短時間で複数回処理しない
            if (this.processedTexts.has(trimmedText)) {
                return;
            }
            
            // 処理済みテキストに追加（設定時間後に自動削除）
            this.processedTexts.add(trimmedText);
            setTimeout(() => {
                this.processedTexts.delete(trimmedText);
            }, this.config.duplicateCheckTimeout);
            
            // 音声認識結果に含まれる可能性のあるピンインを除去
            // 例：「我wǒ说shuō中zhōng文wén」→「我说中文」
            trimmedText = this.cleanPinyinFromText(trimmedText);
            
            // ピンイン変換
            let rubyText = trimmedText;
            if (this.pinyinConverter) {
                try {
                    rubyText = await this.pinyinConverter.convertToRuby(trimmedText);
                } catch (error) {
                }
            }
            
            // テキスト履歴に追加
            stateManager.addTextHistory({
                originalText: trimmedText,
                rubyText: rubyText,
                language: stateManager.getState('config.language')
            });
            
            // 状態更新
            stateManager.updateRecognitionState({
                finalText: trimmedText,
                currentText: trimmedText
            });
            
            // UIに表示を通知
            $(document).trigger('textRecognized', {
                text: trimmedText,
                rubyText: rubyText
            });
            
        } catch (error) {
        }
    }

    /**
     * 音声認識エラーハンドリング
     * エラーコードに応じた適切な処理と自動復旧機能
     * 連続エラー回数を管理し、閾値超過時は認識を停止
     * 特定エラーに対しては自動再起動を実行
     * 
     * @param {SpeechRecognitionErrorEvent} event - エラーイベント
     */
    handleError(event) {
        
        this.errorCount++;
        const errorCode = this.mapErrorCode(event.error);
        
        // エラー発生時は認識状態をリセット
        this.performFullReset(true);
        
        // エラー回数を更新
        stateManager.updateRecognitionState({
            errorCount: this.errorCount
        });
        
        stateManager.setError('SPEECH_RECOGNITION', errorCode, event.error);
        
        // 一定回数以上エラーが発生した場合は停止
        if (this.errorCount >= this.config.maxErrorCount) {
            this.stop();
            return;
        }
        
        // 自動再起動を試行（特定のエラーの場合）
        if (this.shouldAutoRestart(event.error)) {
            setTimeout(() => {
                this.safeRestart();
            }, this.config.restartDelay);
        }
    }

    /**
     * Web Speech APIエラーコードをアプリケーション内部コードにマッピング
     * ブラウザ固有のエラーコードを統一的な形式に変換
     * 
     * @param {string} error - Web Speech APIエラーコード
     * @returns {string} 内部エラーコード
     */
    mapErrorCode(error) {
        const errorMap = {
            'not-allowed': 'NOT_ALLOWED',
            'no-speech': 'NO_SPEECH',
            'aborted': 'ABORTED',
            'audio-capture': 'AUDIO_CAPTURE',
            'network': 'NETWORK',
            'timeout': 'TIMEOUT'
        };
        
        return errorMap[error] || 'UNKNOWN';
    }

    /**
     * エラー種別による自動再起動可否判定
     * 一時的なエラー（音声なし、中断、音声キャプチャ）は再起動対象
     * 権限エラーやネットワークエラーは再起動しない
     * 
     * @param {string} error - エラーコード
     * @returns {boolean} 再起動可否
     */
    shouldAutoRestart(error) {
        const restartableErrors = ['no-speech', 'aborted', 'audio-capture'];
        return restartableErrors.includes(error);
    }

    /**
     * Watchdog機能の開始
     * 定期的に最後の結果受信時刻と絶対時間をチェックし、タイムアウト時に自動再起動
     * 音声認識が無応答状態になった場合の復旧機能
     * タイマー間隔とタイムアウト時間は設定ファイルで制御
     */
    startWatchdog() {
        this.stopWatchdog(); // 既存のタイマークリア
        
        this.watchdogTimer = setInterval(() => {
            if (!this.isRecognizing) return;
            
            const now = Date.now();
            const timeSinceLastResult = now - this.lastResultTime;
            const timeSinceSessionStart = now - this.sessionStartTime;
            
            // 2つの条件でタイムアウト判定し、自動再開
            const isResultTimeout = timeSinceLastResult > this.config.deadTime;
            const isSessionTimeout = timeSinceSessionStart > this.config.maxSessionTime;
            
            if (isResultTimeout || isSessionTimeout) {
                this.safeRestart();
            }
        }, this.config.watchdogInterval);
    }

    /**
     * Watchdogタイマーの停止とクリア
     * 音声認識終了時や手動停止時に呼び出される
     */
    stopWatchdog() {
        if (this.watchdogTimer) {
            clearInterval(this.watchdogTimer);
            this.watchdogTimer = null;
        }
    }

    /**
     * 認識インスタンスの強制停止処理
     * @private
     */
    forceStopRecognition() {
        try {
            if (this.recognition) {
                this.recognition.stop();
            }
        } catch (e) {
            // 停止エラーは無視（既に停止している可能性）
        }
    }

    /**
     * 内部状態の完全リセット処理
     * @private
     */
    resetInternalState() {
        this.isRecognizing = false;
        this.stopWatchdog();
    }

    /**
     * 状態管理システムの状態リセット処理
     * @private
     * @param {boolean} clearTexts - テキスト関連の状態もクリアするかどうか
     */
    resetStateManagerState(clearTexts = false) {
        const stateUpdate = {
            isActive: false,
            isListening: false
        };
        
        if (clearTexts) {
            stateUpdate.currentText = '';
            stateUpdate.interimText = '';
        }
        
        stateManager.updateRecognitionState(stateUpdate);
    }

    /**
     * 音声認識の完全リセット処理
     * 内部状態、音声認識インスタンス、状態管理、中間結果を一括でリセット
     * @private
     * @param {boolean} clearTexts - テキスト関連の状態もクリアするかどうか
     */
    performFullReset(clearTexts = false) {
        this.resetInternalState();
        this.forceStopRecognition();
        this.resetStateManagerState(clearTexts);
        $(document).trigger('clearInterimText');
    }

    /**
     * 音声認識の開始
     * 重複起動チェック、言語設定の更新、認識インスタンスの開始
     * エラー時は適切なエラー状態を設定
     * 
     * @returns {boolean} 開始成功可否
     */
    start() {
        try {
            if (!this.recognition) {
                // 認識インスタンスが存在しない場合は再初期化を試行
                if (!this.initializeRecognition()) {
                    stateManager.setError('SPEECH_RECOGNITION', 'NOT_SUPPORTED');
                    return false;
                }
            }
            
            // 既に認識中の場合は重複起動を防ぐ
            if (this.isRecognizing) {
                return true;
            }
            
            // 認識インスタンスが既に動作中の場合は強制停止
            this.forceStopRecognition();
            
            // 状態を確実にリセット
            this.resetInternalState();
            
            // 少し待ってから開始（前の認識が完全に終了するまで）
            setTimeout(() => {
                try {
                    // 言語設定を更新
                    const language = stateManager.getState('config.language') || 'zh-CN';
                    const speechLang = language;
                    this.recognition.lang = speechLang;
                    
                    this.recognition.start();
                } catch (error) {
                    // エラー時は状態をリセット
                    this.resetInternalState();
                    stateManager.setError('SPEECH_RECOGNITION', 'ABORTED', error.message);
                }
            }, 100);
            
            return true;
            
        } catch (error) {
            // エラー時は状態をリセット
            this.resetInternalState();
            stateManager.setError('SPEECH_RECOGNITION', 'ABORTED', error.message);
            return false;
        }
    }

    /**
     * 音声認識の停止
     * 認識インスタンスの停止とWatchdogタイマーのクリア
     * 既に停止している場合は安全に処理をスキップ
     * 
     * @returns {boolean} 停止成功可否
     */
    stop() {
        try {
            if (!this.recognition) {
                return true;
            }
            
            // 手動停止フラグを設定（自動再開を防ぐ）
            this.manualStop = true;
            
            // 状態をリセット
            this.performFullReset(true);
            
            return true;
            
        } catch (error) {
            // エラーが発生しても状態はクリア
            this.performFullReset(true);
            return false;
        }
    }

    /**
     * 安全な音声認識再起動機能
     * 現在の状態を保存してから一旦停止し、設定遅延後に再開
     * 言語設定の引き継ぎと状態復旧を保証
     * Watchdogタイムアウトや一時的エラーからの復旧に使用
     */
    safeRestart() {
        try {
            
            const currentLanguage = stateManager.getState('config.language');
            
            // 強制的に状態をクリア
            this.performFullReset(true);
            
            // エラー状態をクリア（エラーカウントをリセット）
            this.errorCount = 0;
            stateManager.updateRecognitionState({
                errorCount: 0
            });
            
            // 少し待ってから再初期化と再開
            setTimeout(() => {
                // 認識インスタンスを再初期化
                this.initializeRecognition();
                
                // 言語設定を更新
                if (this.recognition) {
                    const speechLang = currentLanguage;
                    this.recognition.lang = speechLang;
                }
                
                // 再開
                this.start();
            }, this.config.restartDelay);
            
        } catch (error) {
        }
    }

    /**
     * 音声認識言語の変更
     * 認識中の場合は一旦停止してから言語を変更し、再開
     * 簡体字（zh-CN）と繁体字（zh-TW）の切り替えに対応
     * 
     * 【注意】Web Speech API zh-TWモデルの精度限界について：
     * - 日本語Chrome・Edge環境では zh-TW を指定しても実質 zh-CN モデルが使われることがある（Google側の実装依存）
     * - zh-TW特有の語彙（例：你們講的話、打拚、家裡、咩啦）などは誤認識が多く発生しやすい
     * - より高精度なzh-TW認識が必要な場合は専用の音声認識サービスの利用を検討すること
     * 
     * @param {string} language - 新しい言語コード（zh-CN, zh-TW）
     * @returns {boolean} 言語変更成功可否
     */
    changeLanguage(language) {
        try {
            
            const wasRecognizing = this.isRecognizing;
            
            // 認識中の場合は一旦停止
            if (wasRecognizing) {
                this.stop();
            }
            
            // 言語設定更新
            if (this.recognition) {
                const speechLang = language;
                this.recognition.lang = speechLang;
            }
            
            // 必要に応じて再開
            if (wasRecognizing) {
                setTimeout(() => {
                    this.start();
                }, this.config.restartDelay);
            }
            
            return true;
            
        } catch (error) {
            return false;
        }
    }

    /**
     * ピンイン変換器インスタンスの設定
     * 音声認識結果にピンイン（ruby）タグを付与するために使用
     * main.jsからの初期化時に呼び出される
     * 
     * @param {PinyinConverter} converter - ピンイン変換器インスタンス
     */
    setPinyinConverter(converter) {
        this.pinyinConverter = converter;
    }

    /**
     * 音声認識マネージャーの現在状態を取得
     * デバッグ、状態監視、UI更新などで使用
     * 
     * @returns {Object} 現在の状態情報
     * @returns {boolean} returns.isRecognizing - 認識中フラグ
     * @returns {string|null} returns.sessionId - 現在のセッションID
     * @returns {number} returns.errorCount - 連続エラー回数
     * @returns {string} returns.language - 現在の認識言語
     * @returns {number} returns.lastResultTime - 最後の結果受信時刻
     * @returns {boolean} returns.hasWatchdog - Watchdog動作中フラグ
     */
    getStatus() {
        return {
            isRecognizing: this.isRecognizing,
            sessionId: this.sessionId,
            errorCount: this.errorCount,
            language: this.recognition?.lang,
            lastResultTime: this.lastResultTime,
            hasWatchdog: !!this.watchdogTimer
        };
    }

    /**
     * 音声認識設定の動的更新
     * 設定変更時に再初期化せずに一部設定を変更
     * 
     * @param {Object} newConfig - 新しい設定オブジェクト
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * リソースの完全解放とクリーンアップ
     * アプリケーション終了時やインスタンス破棄時に呼び出し
     * メモリリーク防止のため全イベントハンドラーを削除
     */
    destroy() {
        try {
            this.stop();
            
            if (this.recognition) {
                this.recognition.onstart = null;
                this.recognition.onend = null;
                this.recognition.onresult = null;
                this.recognition.onerror = null;
                this.recognition.onnomatch = null;
                this.recognition.onsoundstart = null;
                this.recognition.onsoundend = null;
                this.recognition.onspeechstart = null;
                this.recognition.onspeechend = null;
                this.recognition = null;
            }
            
        } catch (error) {
        }
    }

    /**
     * 音声認識結果からピンイン文字を除去
     * 音声認識エンジンが誤ってピンインを含めて認識した場合の対処
     * 声調記号付きラテン文字（ā, é, ǐ など）を除去して純粋な中国語テキストを抽出
     * 
     * @param {string} text - ピンインが混入している可能性のあるテキスト
     * @returns {string} ピンインを除去したクリーンなテキスト
     * 
     * @example
     * cleanPinyinFromText('我wǒ所suǒ谓wèi') // => '我所谓'
     */
    cleanPinyinFromText(text) {
        // ピンイン（声調記号付きのラテン文字）を除去
        // 例：「我wǒ所suǒ谓wèi」→「我所谓」
        return text.replace(/[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+/gi, '');
    }
}

// グローバルインスタンス
try {
    window.speechRecognitionManager = new SpeechRecognitionManager();
} catch (error) {
}