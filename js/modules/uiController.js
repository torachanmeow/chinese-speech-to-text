/**
 * UIコントローラーモジュール
 * Chinese Speech to Text
 * 
 * アプリケーションのUI要素とユーザーインタラクションを一元管理するモジュール
 * 
 * 機能概要:
 * - 音声認識ボタン、設定モーダル、テキスト表示エリアなどのメインUI管理
 * - リアルタイムテキスト表示とピンイン付きルビタグレンダリング
 * - テキスト選択によるインライン翻訳と原文⇔翻訳切り替え機能
 * - 自動スクロール、テーマ切り替え、フォントサイズ調整などのUI設定
 * - デバウンス、スロットル処理でパフォーマンス最適化
 * - 動的高さ計算、レスポンシブデザイン、ダークモード対応
 * - キーボードショートカットとアクセシビリティ機能
 */

class UIController {
    constructor() {
        // UI要素のjQueryオブジェクトキャッシュ
        this.elements = {};
        
        // 初期化完了フラグ
        this.isInitialized = false;
        
        // UI設定の参照
        this.config = APP_CONFIG.UI_CONFIG;
        
        // パフォーマンス最適化用のマップ（各イベントに個別のタイマー管理）
        this.debounceMap = new Map();   // デバウンス処理用
        
        // 選択テキスト抽出時に除外する要素のセレクター
        this.EXCLUDE_SELECTORS = [
            'rt',                                    // ピンイン（rubyタグ内）
            '.text-muted',                           // 時刻表示・ラベル
            'small',                                 // 時刻表示要素
            '.timestamp',                            // その他の時刻表示
            '.toggle-area',                          // 翻訳切り替えエリア
            '.toggle-icon',                          // 翻訳切り替えアイコン
            '.translation-content',                  // 翻訳エリア全体
            '.translation-text-content',             // 翻訳テキスト
            '.selected-text',                       // 選択済みテキスト表示
            '.translated-text',                     // 翻訳済みテキスト
            '.translation-loading',                 // 翻訳ローディング
            '.translation-error',                   // 翻訳エラー
            '.translation-placeholder',             // 翻訳プレースホルダー
            '[data-translation-item]',              // 翻訳アイテム全体
            '[data-translation-item="original"]',    // 原文エリア
            '[data-translation-item="translated"]', // 翻訳エリア
            'footer',                               // フッター全体
            '.btn',                                 // ボタン要素
            '.badge',                               // バッジ要素
            '.alert',                               // アラート要素
            'button'                                // ボタン要素（汎用）
        ];
        this.throttleMap = new Map();   // スロットル処理用
        
        // 自動スクロールの状態管理
        this.isAutoScrolling = false;   // プログラム的なスクロール実行中フラグ
    }

    /**
     * UIコントローラーのメイン初期化
     * UI要素キャッシュ、イベントリスナー設定、トースト初期化、状態同期を実行
     * DOMが完全に読み込まれた後に呼び出し、安定したUI操作を保証
     * 
     * @returns {Promise<boolean>} 初期化成功可否
     */
    async initialize() {
        try {
            this.cacheElements();
            this.setupEventListeners();
            this.setupToasts();
            
            // DOM更新を確実にするため少し待機
            await new Promise(resolve => setTimeout(resolve, 100));
            
            this.updateUIFromState();
            this.calculateMainTextAreaHeight();
            this.updateTranslationAreaDisplay();
            
            this.isInitialized = true;
            
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * メインUI要素のjQueryオブジェクトをキャッシュ
     * 频繁なDOM検索を回避し、UI更新のパフォーマンスを大幅改善
     * ボタン、フォーム、テキストエリア、モーダルなど主要要素を一括キャッシュ
     */
    cacheElements() {
        this.elements = {
            // ボタン類
            $recognitionBtn: $('#recognition-btn'),
            $clearTextBtn: $('#clear-text-btn'),
            $autoScrollToggle: $('#auto-scroll-toggle'),
            $autoTranslateToggle: $('#auto-translate-toggle'),
            $saveSettingsBtn: $('#save-settings'),
            
            // 表示エリア
            $mainTextArea: $('#main-text'),
            $translationArea: $('#translation-display'),
            
            // 翻訳関連
            $manualTranslationInput: $('#manual-translation-input'),
            $translateBtn: $('#translate-btn'),
            
            // フォーム要素
            $languageSelector: $('input[name="language"]'),
            $apiKeyInput: $('#gemini-api-key'),
            $geminiModelSelect: $('#gemini-model'),
            $maxTextLinesInput: $('#max-text-lines'),
            $translationStyleInput: $('#translation-description'),
            $translationAreaToggle: $('#translation-area-toggle'),
            $translationFooter: $('footer'),
            
            // モーダル
            $settingsModal: $('#settingsModal'),
            
            // トースト
            $loadingToast: $('#loading-toast'),
            
            // その他
            $btnText: $('#btn-text'),
            $themeToggle: $('#theme-toggle'),
            $themeIcon: $('#theme-icon'),
            
            // zh-TW選択時の補足バー
            $taiwanPinyinNotice: $('#taiwan-pinyin-notice')
        };
        
    }

    /**
     * アプリケーション全体のメインイベントリスナー設定
     * ユーザーインタラクション、システムイベント、カスタムイベントを統合管理
     * デバウンスやスロットル処理でパフォーマンスを最適化
     */
    setupEventListeners() {
        // 音声認識メインボタンのクリックイベント
        // 認識の開始・停止をトグルし、状態に応じてUIを更新
        this.elements.$recognitionBtn.on('click', () => {
            this.toggleRecognition();
        });

        // 言語選択ラジオボタンの変更イベント
        // 簡体字・繁体字の切り替えで音声認識と翻訳設定を更新
        this.elements.$languageSelector.on('change', (e) => {
            this.handleLanguageChange(e.target.value);
        });

        // メインテキストエリアの全クリアボタン
        // 認識結果履歴と翻訳結果を全て削除し、初期状態にリセット
        this.elements.$clearTextBtn.on('click', () => {
            this.clearMainText();
        });

        // 自動スクロール機能のオン・オフトグルボタン
        // 新しいテキスト追加時に自動で最新位置にスクロールするかを制御
        this.elements.$autoScrollToggle.on('click', () => {
            this.toggleAutoScroll();
        });

        // 自動翻訳機能のオン・オフトグルボタン
        // 認識完了時に自動で翻訳を実行し、翻訳状態で表示するかを制御
        this.elements.$autoTranslateToggle.on('click', () => {
            this.toggleAutoTranslate();
        });

        // メインテキストエリアの手動スクロール検出
        // ユーザーが手動でスクロールしたことを検知し、自動スクロールと区別
        this.elements.$mainTextArea.on('scroll', () => {
            this.handleManualScroll();
        });

        // 設定モーダルの保存ボタン
        // APIキー、モデル設定、最大行数などをlocalStorageに保存
        this.elements.$saveSettingsBtn.on('click', () => {
            this.saveSettings();
        });

        // 翻訳エリア切り替えボタン
        this.elements.$translationAreaToggle.on('click', () => {
            this.toggleTranslationArea();
        });

        // テキスト選択でのインスタント翻訳機能
        // 中国語テキストを選択すると翻訳エリアに結果を表示（デバウンス処理）
        this.elements.$mainTextArea.on('mouseup', Utils.debounce(() => {
            this.handleTextSelection();
        }, 300));

        // 手動翻訳入力エリアとボタン
        // ユーザーが任意のテキストを入力して手動で翻訳を実行
        this.elements.$translateBtn.on('click', () => {
            this.handleManualTranslation();
        });
        
        // Enterキーでも翻訳を実行（ユーザビリティ向上）
        this.elements.$manualTranslationInput.on('keypress', (e) => {
            if (e.which === 13) { // Enter key
                this.handleManualTranslation();
            }
        });

        // 設定モーダルの表示時の初期化
        // モーダルを開く際に現在の設定値をフォームに読み込み
        this.elements.$settingsModal.on('show.bs.modal', () => {
            this.loadSettingsToModal();
        });

        // ライト・ダークモード切り替えボタン
        // CSSテーマを切り替え、設定をlocalStorageに永続化
        this.elements.$themeToggle.on('click', () => {
            this.toggleTheme();
        });

        // ウィンドウリサイズ時のレスポンシブ対応
        // メインテキストエリア高さを動的に再計算（デバウンス処理）
        $(window).on('resize', Utils.debounce(() => {
            this.calculateMainTextAreaHeight();
        }, 200));


        // テキストパネルの原文⇔翻訳切り替えボタン
        // 各テキスト行の右端ボタンでピンイン付き原文と翻訳を切り替え
        $(document).on('click', '.toggle-area', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const $panelElement = $(e.currentTarget).siblings('.chinese-text');
            this.togglePanelContent($panelElement);
        });

        // 音声認識結果の受信イベント
        // speechRecognitionManagerからの最終結果を受け取り、UIに表示
        $(document).on('textRecognized', (event, data) => {
            this.displayRecognizedText(data);
        });

        // 音声認識中間結果のリアルタイム表示
        // 認識中の一時的な結果をグレーアウトで表示（デバウンス処理）
        $(document).on('interimTextRecognized', Utils.debounce(async (event, data) => {
            await this.displayInterimText(data.text);
        }, 100));

        // 中間結果クリアイベント
        // 音声認識終了時に残っている中間結果を削除（遅延削除で確実に）
        $(document).on('clearInterimText', () => {
            this.removeInterimText(false);
        });

        // アプリケーションエラーイベント
        // stateManagerからのエラー通知（翻訳エリアで表示されるためトースト不要）
        $(document).on('state:error', (event, error) => {
            // エラーは翻訳エリアに表示されるためトーストは不要
        });

        // 音声認識状態変更イベント
        // 認識ボタンの色、テキスト、アニメーションを状態に応じて更新
        $(document).on('state:recognitionStateChanged', (event, state) => {
            this.updateRecognitionButton(state);
        });

        // 翻訳状態変更イベント
        // 翻訳エリアの表示内容とスタイルを更新し、レイアウトを再計算
        $(document).on('state:translationStateChanged', (event, state) => {
            this.updateTranslationArea(state);
            // 翻訳エリア更新後に高さを再計算
            setTimeout(() => this.calculateMainTextAreaHeight(), 100);
        });

    }

    /**
     * Bootstrapトーストコンポーネントの初期化
     * ローディング状態や成功メッセージを表示するためのトーストUIを準備
     * トーストの自動非表示、スタイル設定などを含む
     */
    setupToasts() {
        // Bootstrap Toast初期化
        this.loadingToast = new bootstrap.Toast(this.elements.$loadingToast[0]);
    }

    /**
     * stateManagerの状態からUI要素を復元・更新
     * アプリケーション起動時やリロード時に保存済み設定をUIに反映
     * 言語選択、テーマ、ボタン状態などを一括復元
     */
    updateUIFromState() {
        const state = stateManager.state;
        
        // 言語選択の復元
        const selectedLanguage = state.config.language;
        this.elements.$languageSelector.each(function() {
            const isSelected = this.value === selectedLanguage;
            $(this).prop('checked', isSelected);
            
            // Bootstrap button group の見た目を更新
            const $label = $(`label[for="${this.id}"]`);
            if (isSelected) {
                $label.addClass('active').removeClass('btn-outline-primary').addClass('btn-primary');
            } else {
                $label.removeClass('active btn-primary').addClass('btn-outline-primary');
            }
        });
        
        // 認識ボタン状態
        this.updateRecognitionButton(state.recognition);
        
        // 自動スクロールボタン状態
        this.updateAutoScrollButton(state.config.autoScroll);
        
        // 自動翻訳ボタン状態
        this.updateAutoTranslateButton(state.config.autoTranslate);
        
        // 繁体字選択時の補足バー
        this.updateTaiwanNotice(selectedLanguage);
        
        // 翻訳エリア
        this.updateTranslationArea(state.translation);
        
        // テーマの復元
        this.applyTheme(state.config.theme || 'light');
        
        // 初期メッセージの初期化（テキストが空の場合のみ）
        const hasTextContent = this.elements.$mainTextArea.find('.text-line').length > 0;
        if (!hasTextContent) {
            this.showInitialMessage();
        }
    }

    /**
     * 音声認識の開始・停止トグル処理
     * 現在の認識状態を確認し、適切な関数（開始または停止）を呼び出し
     * エラー時は適切なユーザーフィードバックを提供
     */
    toggleRecognition() {
        try {
            const isListening = stateManager.getState('recognition.isListening');
            
            if (isListening) {
                this.stopRecognition();
            } else {
                this.startRecognition();
            }
        } catch (error) {
// エラートースト削除
        }
    }

    /**
     * 音声認識の開始処理
     * speechRecognitionManagerを使用して認識を開始し、UI状態を更新
     * 成功時は初期メッセージをクリアし、失敗時はエラーメッセージを表示
     */
    startRecognition() {
        if (!window.speechRecognitionManager) {
// エラートースト削除
            return;
        }

        const success = window.speechRecognitionManager.start();
        if (!success) {
// エラートースト削除
        } else {
            // 音声認識開始成功時に初期メッセージをクリア
            this.clearInitialMessage();
        }
    }

    /**
     * 音声認識の停止処理
     * speechRecognitionManagerを使用して認識を停止し、中間結果をクリア
     * UI状態をスタンバイに戻し、一時的な表示要素を除去
     */
    stopRecognition() {
        if (window.speechRecognitionManager) {
            window.speechRecognitionManager.stop();
        }
        // 中間結果をクリア
        this.elements.$mainTextArea.find('.interim-text').remove();
    }

    /**
     * 音声認識言語の変更処理
     * 簡体字・繁体字の切り替えで状態、UI、認識モジュールを更新
     * 設定のlocalStorage保存、音声認識エンジンの言語変更を実行
     * zh-TW選択時の補足バー表示も更新
     * 
     * @param {string} language - 新しい言語コード（zh-CN または zh-TW）
     */
    handleLanguageChange(language) {
        try {
            // 状態更新
            stateManager.setState('config.language', language);
            
            // UI更新（ラジオボタンの見た目を更新）
            this.updateUIFromState();
            
            // zh-TW選択時の補足バー更新
            this.updateTaiwanNotice(language);
            
            // 設定保存
            stateManager.saveSettings();
            
            // 音声認識の言語も変更
            if (window.speechRecognitionManager) {
                window.speechRecognitionManager.changeLanguage(language);
            }
            
        } catch (error) {
// エラートースト削除
        }
    }

    /**
     * 音声認識結果のメイン表示処理
     * 最終確定した認識テキストをピンイン付きrubyタグで表示
     * タイムスタンプ、原文⇔翻訳切り替えボタン、自動翻訳機能を含む
     * 自動スクロール、最大行数制限、中間結果クリアを実行
     * 
     * @param {Object} data - 認識結果データ
     * @param {string} data.text - 原文テキスト
     * @param {string} data.rubyText - ピンイン付きテキスト
     */
    displayRecognizedText(data) {
        try {
            const { text, rubyText } = data;
            const timestamp = Utils.formatTimestamp(Date.now());
            
            // 初期メッセージをクリア
            this.clearInitialMessage();
            
            // DOM操作をバッチ化して描画の同期性を高める
            const $mainTextArea = this.elements.$mainTextArea;
            
            // 中間結果を即座に削除（最終結果が確定したため）
            $mainTextArea.find('.interim-text').remove();
            
            // HTMLを構築（データ属性に元テキストを保存）
            const $textLine = $(`
                <div class="text-line completed mb-2" data-timestamp="${Date.now()}">
                    <small class="text-muted">${timestamp}</small>
                    <div class="panel-container">
                        <div class="chinese-text" data-panel-state="original">${rubyText || Utils.escapeHtml(text)}</div>
                        <div class="toggle-area" title="原文⇔翻訳切り替え">
                            <div class="toggle-icon">翻訳</div>
                        </div>
                    </div>
                </div>
            `);
            
            // データ属性をjQueryで設定（HTMLエスケープ問題を回避）
            $textLine.find('.chinese-text')
                .attr('data-original-text', text)
                .attr('data-ruby-text', rubyText || text);
            
            // 初期状態のボタンを設定
            this.updateToggleButton($textLine.find('.chinese-text'), 'original');
            
            // 削除と追加を同一フレーム内で実行
            $mainTextArea.append($textLine);
            
            // 強制リフローで描画を確定
            Utils.forceReflow($mainTextArea);
            
            // 自動翻訳が有効な場合、自動的に翻訳状態に切り替え
            if (stateManager.getState('config.autoTranslate')) {
                const $chineseText = $textLine.find('.chinese-text');
                setTimeout(() => {
                    this.showTranslationInPanel($chineseText, text);
                }, 500); // 少し遅延を入れてから翻訳開始
            }
            
            // 自動スクロール
            if (stateManager.getState('config.autoScroll')) {
                this.scrollToBottom();
            }
            
            // 最大行数制限
            this.limitTextLines();
            
        } catch (error) {
        }
    }

    /**
     * 音声認識中間結果のリアルタイム表示
     * 認識中の一時的な結果をグレーアウトで表示し、ユーザーにフィードバック提供
     * 中国語の場合はピンイン変換も実行し、既存の中間結果を置き換え
     * 初期メッセージクリア、自動スクロールも実行
     * 
     * @param {string} interimText - 認識中の中間テキスト
     * @returns {Promise<void>}
     */
    async displayInterimText(interimText) {
        try {
            // 初期メッセージをクリア
            this.clearInitialMessage();
            
            // 既存の中間結果表示を即座に削除
            this.removeInterimText(true);
            
            if (interimText && interimText.trim()) {
                let displayText = Utils.escapeHtml(interimText);
                
                // ピンイン変換（中国語の場合のみ）
                const currentLanguage = stateManager.getState('config.language') || 'zh-CN';
                if ((currentLanguage === 'zh-CN' || currentLanguage === 'zh-TW') && window.pinyinConverter) {
                    try {
                        const rubyText = await window.pinyinConverter.convertToRuby(interimText);
                        if (rubyText && rubyText !== interimText) {
                            displayText = rubyText;
                        }
                    } catch (error) {
                        // ピンイン変換エラー時は元テキストを使用
                    }
                }
                
                // 中間結果を表示（グレーボーダー設定）
                const interimHtml = `
                    <div class="text-line interim-text mb-2" style="opacity: 0.6; border-left-color: #6c757d;">
                        <small class="text-muted">${APP_CONFIG.UI_CONFIG.buttonTexts.interim}</small>
                        <div class="chinese-text">${displayText}</div>
                    </div>
                `;
                
                this.elements.$mainTextArea.append(interimHtml);
                
                // 自動スクロール
                if (stateManager.getState('config.autoScroll')) {
                    this.scrollToBottom();
                }
            }
            
        } catch (error) {
        }
    }

    /**
     * ユーザーのテキスト選択でのインスタント翻訳機能
     * メインテキストエリアで中国語テキストを選択すると翻訳エリアに結果表示
     * ピンイン、タイムスタンプ、UI要素を除去して純粋な中国語テキストを抽出
     * 中国語文字が含まれない場合や翻訳パネル内選択はスキップ
     */
    handleTextSelection() {
        try {
            const selection = window.getSelection();
            let selectedText = this.extractTextWithoutPinyin(selection);
            
            if (!selectedText) {
                return;
            }
            
            // 初期メッセージ状態のチェック
            const $initialMessage = this.elements.$mainTextArea.find('.initial-message');
            if ($initialMessage.length > 0) {
                return;
            }
            
            // UI要素の選択をチェック
            if (selectedText.includes('認識中...') ||
                selectedText.includes('クリア') ||
                selectedText.includes('自動スクロール') ||
                selectedText.includes('自動翻訳')) {
                return;
            }
            
            // 翻訳状態のパネル内で選択された場合はスキップ
            const range = selection.getRangeAt(0);
            
            // 選択範囲内に翻訳済みテキストが含まれているかチェック
            const startContainer = range.startContainer;
            const endContainer = range.endContainer;
            
            // 開始点と終了点両方をチェック
            const $startPanel = $(startContainer).closest('.chinese-text[data-panel-state="translation"]');
            const $endPanel = $(endContainer).closest('.chinese-text[data-panel-state="translation"]');
            
            if ($startPanel.length > 0 || $endPanel.length > 0) {
                return;
            }
            
            // 選択範囲内に翻訳済みテキストが含まれているかさらに詳細チェック
            const $allTranslatedPanels = this.elements.$mainTextArea.find('.chinese-text[data-panel-state="translation"]');
            let hasTranslatedText = false;
            
            $allTranslatedPanels.each(function() {
                const panelRange = document.createRange();
                try {
                    panelRange.selectNodeContents(this);
                    if (range.intersectsNode(this)) {
                        hasTranslatedText = true;
                        return false; // break
                    }
                } catch (e) {
                    // エラーが発生した場合は無視
                }
            });
            
            if (hasTranslatedText) {
                return;
            }
            
            // 選択テキストからピンインと時刻を除去
            selectedText = this.cleanSelectedText(selectedText);
            
            if (!selectedText) {
                return;
            }
            
            // 中国語文字が含まれているかチェック
            const hasChinese = /[\u4e00-\u9fff]/.test(selectedText);
            if (!hasChinese) {
                return;
            }
            
            // 翻訳実行
            this.translateSelectedText(selectedText);
            
            // 翻訳実行後に選択を解除
            setTimeout(() => {
                if (window.getSelection) {
                    window.getSelection().removeAllRanges();
                }
            }, 500);
            
        } catch (error) {
        }
    }


    /**
     * テキストパネルの表示内容切り替え機能
     * 各テキスト行の右端ボタンでピンイン付き原文と翻訳を切り替え
     * 原文表示時は緑色、翻訳表示時は青色、エラー時はピンク色で表示
     * 翻訳が未実行の場合は自動で翻訳を実行してから表示
     * 
     * @param {jQuery} $panelElement - 切り替え対象のテキストパネル要素
     * @returns {Promise<void>}
     */
    async togglePanelContent($panelElement) {
        try {
            const currentState = $panelElement.attr('data-panel-state');
            
            // currentStateがnullの場合は何もしない
            if (!currentState) {
                return;
            }
            
            if (currentState === 'original') {
                // 原文 → 翻訳に切り替え
                const originalText = $panelElement.attr('data-original-text');
                await this.showTranslationInPanel($panelElement, originalText);
            } else {
                // 翻訳またはエラー → 原文+ピンインに切り替え
                const rubyText = $panelElement.attr('data-ruby-text');
                this.showOriginalInPanel($panelElement, rubyText);
            }
            
        } catch (error) {
        }
    }

    /**
     * テキストパネルに翻訳結果を表示
     * ローディング表示→翻訳実行→結果表示またはエラー表示の流れで処理
     * 翻訳エリアを更新せず、パネル専用の翻訳処理で独立して実行
     * 成功時は青色ボーダー、失敗時はピンク色ボーダーで視覚的フィードバック
     * 
     * @param {jQuery} $panelElement - 翻訳表示対象のパネル要素
     * @param {string} originalText - 翻訳元の中国語テキスト
     * @returns {Promise<void>}
     */
    async showTranslationInPanel($panelElement, originalText) {
        try {
            // ローディング表示とグレー色設定
            $panelElement.html('<span class="text-muted">翻訳中...</span>');
            $panelElement.attr('data-panel-state', 'loading');
            $panelElement.closest('.text-line').css('border-left-color', '#6c757d');
            
            // 翻訳実行（パネル専用 - 翻訳エリアを更新しない）
            if (!window.geminiTranslator) {
                throw new Error('翻訳機能が利用できません');
            }
            
            const cleanText = this.cleanSelectedText(originalText);
            
            // クリーンアップ後にテキストが空の場合
            if (!cleanText || !cleanText.trim()) {
                throw new Error('翻訳するテキストが見つかりません');
            }
            
            const result = await this.translateForPanelOnly(cleanText);
            
            if (result.success) {
                // 翻訳成功 - 青色設定
                $panelElement.html(`<span class="translation-text">${Utils.escapeHtml(result.translatedText)}</span>`);
                $panelElement.attr('data-panel-state', 'translation');
                $panelElement.attr('data-translation', result.translatedText);
                $panelElement.closest('.text-line').css('border-left-color', '#007bff');
                
                // ボタンの表示を更新
                this.updateToggleButton($panelElement, 'translation');
            } else {
                // 翻訳失敗 - ピンク色設定
                const errorIcon = '❌';
                const errorMessage = this.getSimpleErrorMessage(result.error);
                $panelElement.html(`<span class="error-text">${errorIcon} ${errorMessage}</span>`);
                $panelElement.attr('data-panel-state', 'error');
                $panelElement.attr('data-error-detail', result.error);
                $panelElement.closest('.text-line').css('border-left-color', '#e91e63');
                
                // ボタンの表示を更新
                this.updateToggleButton($panelElement, 'error');
            }
            
        } catch (error) {
            const errorIcon = '❌';
            const errorMessage = this.getSimpleErrorMessage(error.message);
            $panelElement.html(`<span class="error-text">${errorIcon} ${errorMessage}</span>`);
            $panelElement.attr('data-panel-state', 'error');
            $panelElement.attr('data-error-detail', error.message);
            $panelElement.closest('.text-line').css('border-left-color', '#e91e63');
            
            // ボタンの表示を更新
            this.updateToggleButton($panelElement, 'error');
        }
    }

    /**
     * パネル専用の翻訳処理（メイン翻訳エリアを更新しない）
     * メイン翻訳エリアと独立した翻訳処理で、状態管理やUI更新を防止
     * geminiTranslatorのメソッドを直接呼び出して翻訳のみ実行
     * エラー時は独自のエラーハンドリングで簡潔なメッセージを返す
     * 
     * @param {string} text - 翻訳対象テキスト
     * @returns {Promise<Object>} 翻訳結果オブジェクト
     */
    async translateForPanelOnly(text) {
        try {
            // APIキーチェック
            if (!window.geminiTranslator.apiKey) {
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
                throw new Error('テキストが長すぎます');
            }

            // プロンプト生成
            const prompt = window.geminiTranslator.generatePrompt(trimmedText);

            // API呼び出し（翻訳エリア状態更新なし）
            const response = await window.geminiTranslator.callGeminiAPI(prompt);

            // 結果処理
            const translatedText = window.geminiTranslator.processResponse(response);

            return {
                success: true,
                originalText: trimmedText,
                translatedText: translatedText,
                model: window.geminiTranslator.model,
                timestamp: Date.now()
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                originalText: text,
                timestamp: Date.now()
            };
        }
    }

    /**
     * 翻訳エラーメッセージのユーザーフレンドリーな簡略化
     * 技術的なエラーメッセージを一般ユーザーにも理解しやすい形に変換
     * APIキーエラー、レート制限、ネットワークエラーなどを適切に分類
     * 
     * @param {string} errorMessage - 元のエラーメッセージ
     * @returns {string} 簡略化されたユーザーフレンドリーなメッセージ
     */
    getSimpleErrorMessage(errorMessage) {
        if (!errorMessage) return '翻訳に失敗しました';
        
        const lowerMessage = errorMessage.toLowerCase();
        
        if (lowerMessage.includes('api key') || lowerMessage.includes('apiキー')) {
            return 'APIキーが未設定です';
        } else if (lowerMessage.includes('quota') || lowerMessage.includes('rate limit')) {
            return '利用制限に達しました';
        } else if (lowerMessage.includes('network') || lowerMessage.includes('ネットワーク')) {
            return 'ネットワークエラー';
        } else if (lowerMessage.includes('timeout') || lowerMessage.includes('タイムアウト')) {
            return 'タイムアウトしました';
        } else if (lowerMessage.includes('text too long') || lowerMessage.includes('長すぎ')) {
            return 'テキストが長すぎます';
        } else if (lowerMessage.includes('見つかりません') || lowerMessage.includes('not found')) {
            return 'テキストが見つかりません';
        } else {
            return '翻訳に失敗しました';
        }
    }

    /**
     * テキストパネルを原文+ピンイン表示に戻す
     * 翻訳表示から原文表示に切り替え、ボーダー色を緑色に変更
     * 保存済みのピンイン付きテキストを表示し、ボタン表示も更新
     * 
     * @param {jQuery} $panelElement - 原文表示するパネル要素
     * @param {string} rubyText - ピンイン付きテキスト
     */
    showOriginalInPanel($panelElement, rubyText) {
        $panelElement.html(rubyText);
        $panelElement.attr('data-panel-state', 'original');
        $panelElement.closest('.text-line').css('border-left-color', '#28a745');
        
        // ボタンの表示を更新
        this.updateToggleButton($panelElement, 'original');
    }

    /**
     * テキストパネルの切り替えボタン表示更新
     * パネルの現在状態（原文・翻訳・エラー）に応じてボタンの色とテキストを変更
     * 原文状態では「翻訳」、翻訳・エラー状態では「原文」を表示
     * CSSクラスでボタンの触覺的フィードバックも提供
     * 
     * @param {jQuery} $panelElement - ボタン更新対象のパネル要素
     * @param {string} state - パネル状態（'original' | 'translation' | 'error'）
     */
    updateToggleButton($panelElement, state) {
        const $toggleArea = $panelElement.siblings('.toggle-area');
        const $toggleIcon = $toggleArea.find('.toggle-icon');
        
        // 状態に応じてボタンのテキストと色を変更
        switch (state) {
            case 'original':
                $toggleIcon.text('翻訳');
                $toggleArea.removeClass('original-state translation-state error-state').addClass('original-state');
                break;
            case 'translation':
                $toggleIcon.text('原文');
                $toggleArea.removeClass('original-state translation-state error-state').addClass('translation-state');
                break;
            case 'error':
                $toggleIcon.text('原文');
                $toggleArea.removeClass('original-state translation-state error-state').addClass('error-state');
                break;
        }
    }

    /**
     * ユーザー選択テキストのクリーニングと正規化
     * タイムスタンプ、ピンイン文字、英数字などを除去して純粋な中国語テキストを抽出
     * 翻訳に不要な情報を削除し、翻訳精度を向上させるフィルタリング処理
     * 
     * @param {string} text - クリーニング対象のテキスト
     * @returns {string} クリーニングされたテキスト
     */
    cleanSelectedText(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }
        
        return text
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * 選択範囲から不要要素を除外してテキストを抽出
     * ピンイン、翻訳エリア、時刻表示、UI要素を除外し、中国語文字のみを取得
     * 
     * @param {Selection} selection - window.getSelection()で取得した選択範囲
     * @returns {string} クリーンなテキスト
     */
    extractTextWithoutPinyin(selection) {
        if (!selection?.rangeCount) {
            return '';
        }

        try {
            let extractedText = '';
            
            for (let i = 0; i < selection.rangeCount; i++) {
                const range = selection.getRangeAt(i);
                
                if (!this.isValidTextRange(range)) {
                    continue;
                }
                
                const clonedRange = range.cloneContents();
                this.removeExcludedElements(clonedRange);
                extractedText += clonedRange.textContent || '';
            }
            
            return extractedText.trim();
            
        } catch (error) {
            return selection.toString().trim();
        }
    }

    /**
     * 選択範囲がメインテキストエリア内の有効な範囲かチェック
     * @param {Range} range - チェック対象の範囲
     * @returns {boolean} 有効な範囲かどうか
     */
    isValidTextRange(range) {
        // メインテキストエリア内かチェック
        const mainTextArea = document.getElementById('main-text');
        const startContainer = range.startContainer;
        const endContainer = range.endContainer;
        
        const isInMainArea = mainTextArea && (
            mainTextArea.contains(startContainer) || startContainer === mainTextArea
        ) && (
            mainTextArea.contains(endContainer) || endContainer === mainTextArea
        );
        
        if (!isInMainArea) {
            return false;
        }
        
        // 翻訳関連要素が含まれているかチェック
        const parentElement = range.commonAncestorContainer.nodeType === Node.TEXT_NODE 
            ? range.commonAncestorContainer.parentElement 
            : range.commonAncestorContainer;
        
        return !(parentElement && (
            parentElement.closest('.translation-content') ||
            parentElement.closest('footer') ||
            parentElement.closest('[data-translation-item]') ||
            parentElement.closest('.toggle-area')
        ));
    }

    /**
     * 複製された範囲から除外要素を削除
     * @param {DocumentFragment} clonedRange - 複製された範囲
     */
    removeExcludedElements(clonedRange) {
        this.EXCLUDE_SELECTORS.forEach(selector => {
            clonedRange.querySelectorAll(selector).forEach(element => element.remove());
        });
    }

    /**
     * ユーザー選択テキストのメイン翻訳エリアへの翻訳実行
     * クリーニング済みテキストをgeminiTranslatorに送信し、結果をメイン翻訳エリアに表示
     * stateManagerで翻訳状態を管理し、エラーハンドリングも実行
     * 
     * @param {string} text - 翻訳対象の中国語テキスト
     * @returns {Promise<void>}
     */
    async translateSelectedText(text) {
        try {
            if (!window.geminiTranslator) {
                return;
            }
            
            // 翻訳実行
            const result = await window.geminiTranslator.translate(text);
            
            if (!result.success) {
                // エラーは翻訳エリアに表示されるためトーストは不要
            }
            
        } catch (error) {
            // エラーは翻訳エリアに表示されるためトーストは不要
        }
    }

    /**
     * メイン翻訳エリアのクリックイベント処理
     * 翻訳エリアで原文をクリックした場合の再翻訳機能
     * 文字選択がない場合のみ動作し、選択翻訳との競合を回避
     * 
     * @param {Event} e - クリックイベントオブジェクト
     */
    handleTranslationAreaClick(e) {
        // 文字選択がある場合は通常の選択翻訳を優先
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
            return; // 選択翻訳処理に任せる
        }

        // クリックされた原文テキストを取得
        const originalText = $(e.target).text().trim();
        
        if (originalText && /[\u4e00-\u9fff]/.test(originalText)) {
            // 中国語が含まれている場合のみ再翻訳
            this.translateSelectedText(originalText);
        }
    }

    /**
     * 手動翻訳入力エリアの翻訳処理
     * ユーザーが任意のテキストを入力して手動で翻訳を実行
     * 翻訳成功時は入力欄をクリアし、結果をメイン翻訳エリアに表示
     * 
     * @returns {Promise<void>}
     */
    async handleManualTranslation() {
        try {
            const text = this.elements.$manualTranslationInput.val().trim();
            
            if (!text) {
                return;
            }
            
            if (!window.geminiTranslator) {
                return;
            }
            
            // 翻訳実行
            const result = await window.geminiTranslator.translate(text);
            
            if (!result.success) {
                // エラーは翻訳エリアに表示されるためトーストは不要
            } else {
                // 入力欄をクリア
                this.elements.$manualTranslationInput.val('');
            }
            
        } catch (error) {
            // エラーは翻訳エリアに表示されるためトーストは不要
        }
    }

    /**
     * 音声認識メインボタンの視覚状態更新
     * 認識状態に応じてボタンの色（グレー・緑・赤）、テキスト、アニメーションを変更
     * アクティブ時は緑色、エラー時は赤色、スタンバイ時はグレーで表示
     * 
     * @param {Object} recognitionState - 音声認識状態オブジェクト
     */
    updateRecognitionButton(recognitionState) {
        const $btn = this.elements.$recognitionBtn;
        const $text = this.elements.$btnText;
        
        if (!$btn.length || !$text.length) return;
        
        // クラスリセット
        $btn.removeClass('btn-secondary btn-success btn-danger');
        
        if (recognitionState.isListening) {
            $btn.addClass('btn-success');
            $text.text(APP_CONFIG.UI_CONFIG.buttonTexts.recognizing);
        } else if (recognitionState.errorCount > 0) {
            $btn.addClass('btn-danger');
            $text.text(APP_CONFIG.UI_CONFIG.buttonTexts.error);
        } else {
            $btn.addClass('btn-secondary');
            $text.text(APP_CONFIG.UI_CONFIG.buttonTexts.recognition);
        }
    }

    /**
     * メイン翻訳エリアの表示内容とスタイル更新
     * 翻訳状態（ローディング・成功・エラー）に応じて表示内容を動的更新
     * ダークモード対応、ローディングアニメーション、スクロール位置保持を含む
     * 
     * @param {Object} translationState - 翻訳状態オブジェクト
     */
    updateTranslationArea(translationState) {
        const $area = this.elements.$translationArea;
        const $placeholder = $area.find('.translation-placeholder');
        const $content = $area.find('.translation-content');
        
        // 現在のスクロール位置を保存
        const currentScrollTop = this.elements.$mainTextArea.scrollTop();
        
        if (translationState.isLoading) {
            this.showLoadingToast('翻訳処理中...');
            $placeholder.removeClass('d-none').text('翻訳処理中...');
            
            // 処理中は原文を表示し、翻訳部分をグレーに
            if (translationState.originalText) {
                $content.removeClass('d-none');
                $content.find('.selected-text').text(translationState.originalText);
                $content.find('.translated-text').text('翻訳処理中...');
                
                // 処理中の色設定（ダークモード対応）
                const isDarkMode = $('html').attr('data-theme') === 'dark';
                const backgroundColor = isDarkMode ? '#495057' : '#ffffff';
                const borderBottomColor = isDarkMode ? '#6c757d' : '#e9ecef';
                const baseStyle = `background-color: ${backgroundColor}; border-radius: 4px; padding: 12px 16px; transition: all 0.2s ease;`;
                const originalLineStyle = baseStyle + `margin-bottom: 16px !important; padding-bottom: 8px !important; border-bottom: 1px solid ${borderBottomColor} !important; display: block !important; border-left: 4px solid #28a745 !important;`;
                const loadingLineStyle = baseStyle + 'margin-top: 8px !important; margin-bottom: 0 !important; display: block !important; border-left: 4px solid #6c757d !important;';
                
                $content.find('[data-translation-item="original"]').attr('style', originalLineStyle);
                $content.find('[data-translation-item="translated"]').attr('style', loadingLineStyle);
            } else {
                $content.addClass('d-none');
            }
        } else {
            this.hideLoadingToast();
            
            if (translationState.translatedText && translationState.translatedText.trim()) {
                $placeholder.addClass('d-none');
                $content.removeClass('d-none');
                $content.find('.selected-text').text(translationState.originalText || '');
                
                // レイアウトスタイルを適用
                this.applyTranslationAreaStyles($content);
                
                // 翻訳結果を表示
                const $translatedSpan = $content.find('.translated-text');
                $translatedSpan.text(translationState.translatedText);
                
                // 翻訳状態に応じて色を設定
                const $translatedLine = $content.find('[data-translation-item="translated"]');
                if (translationState.hasError) {
                    // エラー時はピンク色（ダークモード対応）
                    const isDarkMode = $('html').attr('data-theme') === 'dark';
                    const backgroundColor = isDarkMode ? '#495057' : '#ffffff';
                    const baseStyle = `background-color: ${backgroundColor}; border-radius: 4px; padding: 12px 16px; transition: all 0.2s ease;`;
                    const errorLineStyle = baseStyle + 'margin-top: 8px !important; margin-bottom: 0 !important; display: block !important; border-left: 4px solid #e91e63 !important;';
                    $translatedLine.attr('style', errorLineStyle);
                    $translatedSpan.removeClass('text-success text-danger');
                } else {
                    // 正常時は青色（既に applyTranslationAreaStyles で設定済み）
                    $translatedSpan.removeClass('text-success text-danger');
                }
            } else {
                $placeholder.removeClass('d-none').text('音声認識したテキストを選択するとクイック翻訳が表示されます');
                $content.addClass('d-none');
            }
        }
        
        // レイアウト変更後にスクロール位置を復元
        setTimeout(() => {
            if (!stateManager.getState('config.autoScroll')) {
                this.elements.$mainTextArea.scrollTop(currentScrollTop);
            }
        }, 0);
    }

    /**
     * メインテキストエリアの初期メッセージをクリア
     * 音声認識開始時やテキスト追加時に「音声認識を開始してください」メッセージを除去
     * クラス付きとHTML直接記述の両方に対応し、安全に初期化状態をクリア
     */
    clearInitialMessage() {
        // クラス付きの初期メッセージを削除
        const $initialMessage = this.elements.$mainTextArea.find('.initial-message');
        if ($initialMessage.length > 0) {
            $initialMessage.remove();
            return;
        }
        
        // HTMLに直接書かれた初期メッセージもチェック
        const $textMutedCenter = this.elements.$mainTextArea.find('.text-muted.text-center');
        if ($textMutedCenter.length > 0 && $textMutedCenter.text().includes('音声認識を開始してください')) {
            $textMutedCenter.remove();
        }
    }

    /**
     * 中間結果テキストの確実な削除
     * @param {boolean} immediate - 即座に削除のみ行うかどうか
     */
    removeInterimText(immediate = false) {
        // 即座に削除
        this.elements.$mainTextArea.find('.interim-text').remove();
        
        if (immediate) {
            // 描画更新を強制的に同期させる
            Utils.forceReflow(this.elements.$mainTextArea);
        } else {
            // 少し遅延して再度削除（タイミング問題対策）
            setTimeout(() => {
                this.elements.$mainTextArea.find('.interim-text').remove();
            }, APP_CONFIG.UI_CONFIG.interimTextCleanupDelay.first);
            
            // さらに遅延して最終確認
            setTimeout(() => {
                const remainingInterim = this.elements.$mainTextArea.find('.interim-text');
                if (remainingInterim.length > 0) {
                    remainingInterim.remove();
                }
            }, APP_CONFIG.UI_CONFIG.interimTextCleanupDelay.final);
        }
    }

    /**
     * メインテキストエリアの初期メッセージを表示
     * アプリケーション起動時やテキストクリア時にユーザーガイダンスを表示
     * CSSクラスでスタイルされたメッセージで使用方法を案内
     */
    showInitialMessage() {
        this.elements.$mainTextArea.html('<div class="initial-message text-muted text-center py-5">音声認識を開始してください</div>');
    }

    /**
     * メインテキストエリアの全テキストクリア処理
     * 認識結果履歴、翻訳結果、中間結果を全て削除して初期状態にリセット
     * stateManagerの翻訳状態もクリアし、初期メッセージを再表示
     */
    clearMainText() {
        this.elements.$mainTextArea.empty();
        this.showInitialMessage();
        
        // 翻訳エリアもクリア
        stateManager.updateTranslationState({
            selectedText: '',
            originalText: '',
            translatedText: ''
        });
    }

    /**
     * メインテキストエリアの自動スクロール実行
     * 新しいテキスト追加時に自動で最新位置（一番下）にスクロール
     * プログラム的スクロールフラグで手動スクロールと区別し、競合状態を防止
     */
    scrollToBottom() {
        const element = this.elements.$mainTextArea[0];
        if (element) {
            this.isAutoScrolling = true;
            setTimeout(() => {
                element.scrollTop = element.scrollHeight;
                // スクロール完了後にフラグをリセット
                setTimeout(() => {
                    this.isAutoScrolling = false;
                }, 50);
            }, this.config.autoScrollDelay);
        }
    }

    /**
     * メインテキストエリアの最大行数制限処理
     * 設定された最大行数を超えた古いテキスト行を自動削除
     * メモリ使用量とパフォーマンスを管理し、スムーズなUI操作を保持
     */
    limitTextLines() {
        const $lines = this.elements.$mainTextArea.find('.text-line');
        const maxLines = stateManager.getState('config.maxTextLines') || 50;
        
        // 0の場合は無制限（制限なし）
        if (maxLines > 0 && $lines.length > maxLines) {
            $lines.slice(0, $lines.length - maxLines).remove();
        }
    }

    /**
     * 設定モーダルへの現在設定値の読み込み
     * stateManagerから現在の設定値を取得し、モーダル内のフォーム要素に反映
     * APIキー、モデル選択、最大行数などの設定をユーザーが編集可能な形で表示
     */
    loadSettingsToModal() {
        const state = stateManager.state.config;
        
        this.elements.$apiKeyInput.val(state.geminiApiKey);
        this.elements.$geminiModelSelect.val(state.geminiModel);
        this.elements.$maxTextLinesInput.val(state.maxTextLines);
        this.elements.$translationStyleInput.val(state.translationStyle);
    }

    /**
     * 設定モーダルからの設定保存処理
     * ユーザーがモーダルで入力した値を取得し、stateManagerとlocalStorageに保存
     * geminiTranslatorの設定も同時更新し、モーダルを閉じる
     * エラー時はコンソールにログ出力し、ユーザーには静かに失敗を通知
     */
    saveSettings() {
        try {
            const settings = {
                apiKey: this.elements.$apiKeyInput.val().trim(),
                model: this.elements.$geminiModelSelect.val(),
                maxTextLines: parseInt(this.elements.$maxTextLinesInput.val()),
                translationStyle: this.elements.$translationStyleInput.val().trim()
            };
            
            // APIキー保存
            stateManager.saveApiKey(settings.apiKey);
            stateManager.setState('config.geminiApiKey', settings.apiKey);
            if (window.geminiTranslator) {
                window.geminiTranslator.setApiKey(settings.apiKey);
            }
            
            // その他設定更新
            stateManager.setState('config.geminiModel', settings.model);
            stateManager.setState('config.maxTextLines', settings.maxTextLines);
            stateManager.setState('config.translationStyle', settings.translationStyle);
            
            // 翻訳機能の設定更新
            if (window.geminiTranslator) {
                window.geminiTranslator.setModel(settings.model);
            }
            
            // 設定保存
            stateManager.saveSettings();
            
            // モーダルを閉じる
            bootstrap.Modal.getInstance(this.elements.$settingsModal[0])?.hide();
            
        } catch (error) {
// 設定保存エラーは重要なのでコンソールログ程度に
        }
    }

    /**
     * ローディングトーストの表示処理
     * 翻訳処理中や長時間の処理時にユーザーに進行状況をフィードバック
     * Bootstrapトーストコンポーネントでスタイルされた通知を表示
     * 
     * @param {string} [message='処理中...'] - 表示するローディングメッセージ
     */
    showLoadingToast(message = '処理中...') {
        this.elements.$loadingToast.find('.toast-body').text(message);
        this.loadingToast.show();
    }

    /**
     * ローディングトーストの非表示処理
     * 処理完了時やエラー時にローディングトーストを隓してUIをクリーンに
     * Bootstrapトーストのhideメソッドでアニメーション付き非表示
     */
    hideLoadingToast() {
        this.loadingToast.hide();
    }


    /**
     * 成功メッセージの一時的表示
     * 設定保存成功などのポジティブフィードバックをユーザーに提供
     * Bootstrap Alertコンポーネントで緑色の成功メッセージを表示し、3秒後に自動消存
     * 
     * @param {string} message - 表示する成功メッセージ
     */
    showSuccessMessage(message) {
        // 簡易的な成功メッセージ（Bootstrap Alert使用）
        const alertHtml = `
            <div class="alert alert-success alert-dismissible fade show position-fixed" 
                 style="top: 20px; right: 20px; z-index: 9999; min-width: 300px;" role="alert">
                ${Utils.escapeHtml(message)}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        
        $('body').append(alertHtml);
        
        // 3秒後に自動削除
        setTimeout(() => {
            $('.alert-success').fadeOut(() => {
                $('.alert-success').remove();
            });
        }, 3000);
    }

    /**
     * メインテキストエリアのフォントサイズ調整
     * ユーザーの視力やデバイスに合わせてフォントサイズを動的変更
     * small(14px)、medium(18px)、large(22px)の3段階で設定可能
     * 
     * @param {string} size - フォントサイズ（'small' | 'medium' | 'large'）
     */
    adjustFontSize(size) {
        const sizes = {
            small: '14px',
            medium: '18px',
            large: '22px'
        };
        
        const fontSize = sizes[size] || sizes.medium;
        this.elements.$mainTextArea.css('font-size', fontSize);
        
        stateManager.setState('config.fontSize', size);
    }

    /**
     * 自動スクロール機能のオン・オフ切り替え
     * ユーザーが手動スクロールで閲覧中にも新テキストに自動移動するかを制御
     * オン時はボタンが青色に、オフ時はグレーに変化して状態を視覚化
     */
    toggleAutoScroll() {
        const currentState = stateManager.getState('config.autoScroll');
        const newState = !currentState;
        
        stateManager.setState('config.autoScroll', newState);
        // 自動スクロール設定は保存しない
        
        this.updateAutoScrollButton(newState);
        
        // ONにした場合は最新位置にスクロール
        if (newState) {
            this.isAutoScrolling = true;
            this.scrollToBottom();
            // 少し待ってからフラグをリセット
            setTimeout(() => {
                this.isAutoScrolling = false;
            }, 200);
        }
    }

    /**
     * ユーザーの手動スクロール検知と処理
     * プログラム的スクロールと手動スクロールを区別し、競合状態を防止
     * 現在の仕様では手動スクロールで自動スクロールを無効化しない
     */
    handleManualScroll() {
        // プログラム的なスクロール中は無視
        if (this.isAutoScrolling) {
            return;
        }
        
        // 手動スクロールでは自動スクロールを無効にしない
        // ユーザーが明示的にボタンでOFFにする仕様に変更
    }

    /**
     * 自動スクロールボタンの視覚状態更新
     * ボタンの色とアイコンで自動スクロールのオン・オフ状態を視覚化
     * オン時は青色の実線アイコン、オフ時はグレーの点線アイコンで表示
     * 
     * @param {boolean} isEnabled - 自動スクロール有効フラグ
     */
    updateAutoScrollButton(isEnabled) {
        const $btn = this.elements.$autoScrollToggle;
        const $icon = $btn.find('i');
        
        if (isEnabled) {
            $btn.removeClass('btn-outline-success').addClass('btn-success');
            $icon.removeClass('bi-arrow-down-circle').addClass('bi-arrow-down-circle-fill');
        } else {
            $btn.removeClass('btn-success').addClass('btn-outline-success');
            $icon.removeClass('bi-arrow-down-circle-fill').addClass('bi-arrow-down-circle');
        }
    }

    /**
     * 自動翻訳機能のオン・オフ切り替え
     * 音声認識完了時に自動で翻訳を実行し、翻訳状態で表示するかを制御
     * 設定をlocalStorageに保存し、アプリケーション再起動時に復元
     */
    toggleAutoTranslate() {
        const currentState = stateManager.getState('config.autoTranslate');
        const newState = !currentState;
        
        stateManager.setState('config.autoTranslate', newState);
        stateManager.saveSettings();
        
        this.updateAutoTranslateButton(newState);
    }

    /**
     * 自動翻訳ボタンの視覚状態更新
     * ボタンの色で自動翻訳のオン・オフ状態を視覚化
     * オン時は緑色、オフ時はグレーの輪郭スタイルで表示
     * 
     * @param {boolean} isEnabled - 自動翻訳有効フラグ
     */
    updateAutoTranslateButton(isEnabled) {
        const $btn = this.elements.$autoTranslateToggle;
        const $icon = $btn.find('i');
        
        if (isEnabled) {
            $btn.removeClass('btn-outline-success').addClass('btn-success');
            $icon.removeClass('bi-translate').addClass('bi-translate');
        } else {
            $btn.removeClass('btn-success').addClass('btn-outline-success');
            $icon.removeClass('bi-translate').addClass('bi-translate');
        }
    }

    /**
     * 繁体字（zh-TW）選択時の補足情報バーの表示制御
     * zh-TW選択時にピンイン機能の制限や特徴をユーザーに通知
     * 表示・非表示に応じてメインテキストエリアの高さを再計算
     * 
     * @param {string} language - 選択された言語コード（zh-CN または zh-TW）
     */
    updateTaiwanNotice(language) {
        const $notice = this.elements.$taiwanPinyinNotice;
        const $container = $('.app-container');
        
        if (language === 'zh-TW') {
            $notice.removeClass('d-none');
            $container.addClass('taiwan-notice-active');
        } else {
            $notice.addClass('d-none');
            $container.removeClass('taiwan-notice-active');
        }
        
        // 高さを再計算
        setTimeout(() => this.calculateMainTextAreaHeight(), 100);
    }

    /**
     * ライトモードとダークモードの切り替え
     * 現在のテーマを取得して逆のテーマに切り替え、localStorageに保存
     * テーマ変更後に翻訳エリアのスタイルを再適用して一貫性を保持
     */
    toggleTheme() {
        const currentTheme = stateManager.getState('config.theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        this.applyTheme(newTheme);
        stateManager.setState('config.theme', newTheme);
        stateManager.saveSettings();
    }

    /**
     * 指定されたテーマのCSS適用とUI更新
     * HTMLのdata-theme属性とテーマボタンのアイコンを変更
     * ダークモード時は太陽アイコン、ライトモード時は月アイコンで視覚化
     * 
     * @param {string} theme - 適用するテーマ（'light' または 'dark'）
     */
    applyTheme(theme) {
        const $html = $('html');
        const $icon = this.elements.$themeIcon;
        
        if (theme === 'dark') {
            $html.attr('data-theme', 'dark');
            $icon.removeClass('bi-moon-fill').addClass('bi-sun-fill');
        } else {
            $html.attr('data-theme', 'light');
            $icon.removeClass('bi-sun-fill').addClass('bi-moon-fill');
        }
        
        // テーマ変更後に翻訳エリアのスタイルを再適用
        const $content = this.elements.$translationArea.find('.translation-content');
        if ($content.length > 0 && !$content.hasClass('d-none')) {
            this.applyTranslationAreaStyles($content);
        }
    }

    /**
     * メインテキストエリアのレスポンシブ高さ計算
     * ウィンドウ高さからヘッダー、フッター、補足バーなどを差し引いた最適高さを算出
     * リサイズイベント、補足バー表示変更時に自動呼び出しで最適なレイアウトを保持
     */
    calculateMainTextAreaHeight() {
        try {
            const windowHeight = $(window).height();
            const $header = $('header');
            const $footer = $('footer');
            const $mainPadding = 32; // main要素のpadding (1rem * 2)
            const $cardHeader = this.elements.$mainTextArea.closest('.card').find('.card-header');
            const $taiwanNotice = this.elements.$taiwanPinyinNotice;
            const $cardPadding = 24; // card-bodyのpadding
            
            // 各要素の高さを取得
            let headerHeight = $header.outerHeight() || 0;
            let footerHeight = $footer.outerHeight() || 0;
            let cardHeaderHeight = $cardHeader.outerHeight() || 0;
            let taiwanNoticeHeight = $taiwanNotice.is(':visible') ? $taiwanNotice.outerHeight() : 0;
            
            // 利用可能な高さを計算
            const availableHeight = windowHeight - headerHeight - footerHeight - $mainPadding - cardHeaderHeight - taiwanNoticeHeight - $cardPadding;
            
            // 最小高さを保証
            const finalHeight = Math.max(availableHeight, 200);
            
            // 高さを設定
            this.elements.$mainTextArea.css('height', finalHeight + 'px');
            
        } catch (error) {
        }
    }

    /**
     * アプリケーション全体のキーボードショートカット設定
     * ユーザビリティとアクセシビリティ向上のためのキーボードショートカットを提供
     * Ctrl+Enter：音声認識トグル、Ctrl+L：テキストクリア、Ctrl+S：設定保存
     */
    setupKeyboardShortcuts() {
        $(document).on('keydown', (e) => {
            // Ctrl + Enter: 音声認識トグル
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.toggleRecognition();
            }
            
            // Ctrl + L: テキストクリア
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                this.clearMainText();
            }
            
            // Ctrl + S: 設定保存（モーダル内でのみ）
            if (e.ctrlKey && e.key === 's' && this.elements.$settingsModal.hasClass('show')) {
                e.preventDefault();
                this.saveSettings();
            }
        });
    }


    /**
     * UIコントローラーの完全状態リセット
     * アプリケーション再初期化やエラー復旧時に使用
     * テキストクリア、トースト非表示、ボタン状態初期化を一括実行
     */
    reset() {
        this.clearMainText();
        this.hideLoadingToast();
        this.updateRecognitionButton({ isListening: false, errorCount: 0 });
        this.updateTranslationArea({ isLoading: false, translatedText: '' });
    }


    /**
     * メイン翻訳エリアのダークモード対応スタイル適用
     * 現在のテーマに応じた背景色、ボーダー色、テキスト色を動的設定
     * 原文ライン（緑）と翻訳ライン（青）の色分けをテーマ関係なく維持
     * 
     * @param {jQuery} $content - スタイル適用対象の翻訳コンテント要素
     */
    applyTranslationAreaStyles($content) {
        const $originalLine = $content.find('[data-translation-item="original"]');
        const $translatedLine = $content.find('[data-translation-item="translated"]');
        
        // ダークモード判定
        const isDarkMode = $('html').attr('data-theme') === 'dark';
        
        // ダークモード対応のスタイル設定
        const backgroundColor = isDarkMode ? '#495057' : '#ffffff';
        const borderBottomColor = isDarkMode ? '#6c757d' : '#e9ecef';
        
        const baseStyle = `background-color: ${backgroundColor}; border-radius: 4px; padding: 12px 16px; transition: all 0.2s ease;`;
        const originalLineStyle = baseStyle + `margin-bottom: 16px !important; padding-bottom: 8px !important; border-bottom: 1px solid ${borderBottomColor} !important; display: block !important; border-left: 4px solid #28a745 !important;`;
        const translatedLineStyle = baseStyle + 'margin-top: 8px !important; margin-bottom: 0 !important; display: block !important; border-left: 4px solid #007bff !important;';
        
        if ($originalLine.length > 0) {
            $originalLine.attr('style', originalLineStyle);
        }
        
        if ($translatedLine.length > 0) {
            $translatedLine.attr('style', translatedLineStyle);
        }
    }

    /**
     * 翻訳エリアの表示/非表示切り替え
     * 翻訳機能を使わない時は画面を広く使えるように制御
     */
    toggleTranslationArea() {
        const currentState = stateManager.getState('config.showTranslationArea');
        const newState = !currentState;
        
        stateManager.setState('config.showTranslationArea', newState);
        this.updateTranslationAreaDisplay();
        
        // 設定保存
        stateManager.saveSettings();
        
        // 高さ再計算
        this.calculateMainTextAreaHeight();
    }

    /**
     * 翻訳エリアの表示状態更新
     * 状態に応じて翻訳エリア（footer）の表示/非表示とボタンアイコンを切り替え
     */
    updateTranslationAreaDisplay() {
        const showTranslationArea = stateManager.getState('config.showTranslationArea');
        
        if (showTranslationArea) {
            this.elements.$translationFooter.show();
            this.elements.$translationAreaToggle
                .removeClass('btn-outline-secondary')
                .addClass('btn-secondary')
                .html('<i class="bi bi-eye-fill me-1"></i>クイック翻訳');
        } else {
            this.elements.$translationFooter.hide();
            this.elements.$translationAreaToggle
                .removeClass('btn-secondary')
                .addClass('btn-outline-secondary')
                .html('<i class="bi bi-eye-slash me-1"></i>クイック翻訳');
        }
    }

    /**
     * UIコントローラーのリソース解放とクリーンアップ
     * アプリケーション終了時やページ避遷時に呼び出し
     * 全イベントリスナーを除去し、メモリリークやゾンビイベントを防止
     */
    destroy() {
        // イベントリスナー削除
        Object.values(this.elements).forEach($element => {
            if ($element && $element.off) {
                $element.off();
            }
        });
        
        // キャッシュクリア
        this.elements = {};
        this.isInitialized = false;
    }
}

// グローバルインスタンス
window.uiController = new UIController();