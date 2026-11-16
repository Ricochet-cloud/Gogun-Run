import { GameState } from '../game/GameState.js';

/**
 * UI 관리자 모듈 (UIManager)
 * 시작 화면(READY), 플레이 HUD(PLAYING), 일시정지(PAUSED), 게임 오버(GAME_OVER),
 * 설정 모달(SETTINGS)을 관리하고 Demon Slayer 테마의 현대적 픽셀 UI를 렌더링합니다.
 */
export class UIManager {
  /**
   * @param {HTMLElement} rootContainer UI가 삽입될 부모 엘리먼트 (보통 #game-viewport 또는 #game-container)
   * @param {Object} options { gameState, scoreManager, audioManager, onStart, onResume, onRestart, onTitle }
   */
  constructor(rootContainer, options = {}) {
    this.rootContainer = rootContainer;
    this.gameState = options.gameState;
    this.scoreManager = options.scoreManager;
    this.audioManager = options.audioManager;

    this.onStart = options.onStart || (() => {});
    this.onResume = options.onResume || (() => {});
    this.onRestart = options.onRestart || (() => {});
    this.onTitle = options.onTitle || (() => {});
    this.onJumpAction = options.onJumpAction || (() => {});
    this.onHookAction = options.onHookAction || (() => {});

    this.lastDeathCause = 'OBSTACLE';

    // 생성된 DOM 요소 캐시
    this.elements = {};

    // 터치 버튼 중복 입력 방지 (STEP 6)
    this._touchButtonCooldown = new Map();
    this._TOUCH_COOLDOWN_MS = 100;

    this._initDOM();
    this._bindEvents();
    this._subscribeGameState();
  }

  /**
   * UI 기본 DOM 트리 생성 및 마운트
   */
  _initDOM() {
    let overlay = this.rootContainer.querySelector('#ui-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ui-overlay';
      overlay.className = 'ui-overlay';
      this.rootContainer.appendChild(overlay);
    }
    this.overlay = overlay;

    // UI HTML 구조 삽입
    this.overlay.innerHTML = `
      <!-- 모바일 세로 모드 안내 힌트 배너 (STEP 6) -->
      <div id="portrait-orientation-hint" class="portrait-hint-banner" style="display: none;">
        <span>📱 가로 화면(Landscape)으로 회전하시면 더욱 쾌적하게 즐기실 수 있습니다.</span>
      </div>

      <!-- 1. 플레이 중 상단 HUD -->
      <div id="screen-hud" class="ui-screen hud-container" style="display: none;">
        <div class="hud-left">
          <span class="hud-tag">GOGUN RUN</span>
          <button id="btn-hud-pause" class="ui-btn ui-btn-icon ui-interactive" title="일시정지 (P / ESC)">❚❚</button>
          <button id="btn-hud-sound" class="ui-btn ui-btn-icon ui-interactive" title="음소거 토글">🔊</button>
        </div>
        <div class="hud-right">
          <div class="hud-stat-box score-box">
            <span class="hud-label">SCORE</span>
            <span id="hud-score" class="hud-value hud-score-val">000000</span>
          </div>
          <div class="hud-stat-box best-box">
            <span class="hud-label">BEST</span>
            <span id="hud-best" class="hud-value hud-best-val">000000</span>
          </div>
          <div class="hud-stat-box speed-box">
            <span class="hud-label">SPEED</span>
            <span id="hud-speed" class="hud-value hud-speed-val">260 px/s</span>
          </div>
        </div>

        <!-- 가상 터치 / 모바일 조작 버튼 -->
        <div class="hud-touch-controls">
          <button id="btn-touch-hook" class="ui-touch-btn touch-btn-hook ui-interactive" title="갈고리 발사 / 해제 (Z / J / 우클릭)">
            <span class="touch-icon">⛓</span>
            <span class="touch-label">HOOK</span>
          </button>
          <button id="btn-touch-jump" class="ui-touch-btn touch-btn-jump ui-interactive" title="점프 (Space / ↑)">
            <span class="touch-icon">▲</span>
            <span class="touch-label">JUMP</span>
          </button>
        </div>
      </div>

      <!-- 2. 시작 화면 (READY) -->
      <div id="screen-ready" class="ui-screen modal-backdrop" style="display: none;">
        <div class="ui-panel ready-panel">
          <div class="panel-header">
            <div class="badge-theme">DEMON SLAYER RUNNER</div>
            <h1 class="ui-title logo-text">GOGUN RUN</h1>
            <p class="ui-subtitle">혈귀를 베는 질주 · 귀멸의 액션 러너</p>
          </div>

          <div class="ready-score-display">
            <div class="stat-pill">
              <span class="stat-pill-label">🏆 최고 기록</span>
              <span id="ready-best-score" class="stat-pill-value">000000</span>
            </div>
          </div>

          <div class="panel-buttons">
            <button id="btn-start-game" class="ui-btn ui-btn-primary ui-interactive">
              게임 시작 [START]
            </button>
            <button id="btn-ready-settings" class="ui-btn ui-btn-secondary ui-interactive">
              ⚙ 환경 설정
            </button>
          </div>

          <div class="panel-footer guide-box">
            <div class="guide-item"><span>[SPACE] / [↑] / [JUMP버튼]</span> : 일반 점프</div>
            <div class="guide-item"><span>[Z] / [J] / 우클릭 / [HOOK버튼]</span> : 갈고리 연결 / 해제</div>
            <div class="guide-item"><span>[P] / [ESC]</span> : 일시정지</div>
          </div>
        </div>
      </div>

      <!-- 3. 일시정지 화면 (PAUSED) -->
      <div id="screen-paused" class="ui-screen modal-backdrop" style="display: none;">
        <div class="ui-panel paused-panel">
          <div class="panel-header">
            <h2 class="ui-title title-paused">PAUSED</h2>
            <p class="ui-subtitle">게임이 일시정지되었습니다</p>
          </div>

          <div class="paused-stats">
            <div class="stat-row">
              <span>현재 점수</span>
              <strong id="paused-current-score" class="accent-gold">000000</strong>
            </div>
            <div class="stat-row">
              <span>최고 기록</span>
              <strong id="paused-best-score" class="accent-teal">000000</strong>
            </div>
          </div>

          <div class="panel-buttons">
            <button id="btn-resume-game" class="ui-btn ui-btn-primary ui-interactive">
              계속하기 [RESUME]
            </button>
            <button id="btn-restart-from-pause" class="ui-btn ui-btn-secondary ui-interactive">
              다시하기 [RESTART]
            </button>
            <button id="btn-pause-settings" class="ui-btn ui-btn-secondary ui-interactive">
              ⚙ 환경 설정
            </button>
            <button id="btn-pause-title" class="ui-btn ui-btn-subtle ui-interactive">
              메인 화면으로
            </button>
          </div>
        </div>
      </div>

      <!-- 4. 게임 오버 화면 (GAME_OVER) -->
      <div id="screen-game-over" class="ui-screen modal-backdrop" style="display: none;">
        <div class="ui-panel game-over-panel">
          <div class="panel-header">
            <h2 class="ui-title title-game-over">GAME OVER</h2>
            <p id="game-over-cause" class="ui-subtitle cause-text">도깨비 장애물과 충돌했습니다</p>
            <div id="game-over-new-record" class="new-record-banner" style="display: none;">
              ★ 최고 기록 달성! NEW RECORD! ★
            </div>
          </div>

          <div class="score-summary-card">
            <div class="score-card-row">
              <span class="card-label">최종 점수</span>
              <span id="game-over-final-score" class="card-val final-val">000000</span>
            </div>
            <div class="score-card-divider"></div>
            <div class="score-card-row">
              <span class="card-label">최고 기록</span>
              <span id="game-over-best-score" class="card-val best-val">000000</span>
            </div>
          </div>

          <div class="panel-buttons">
            <button id="btn-game-over-restart" class="ui-btn ui-btn-primary ui-interactive">
              다시 도전 [RETRY]
            </button>
            <button id="btn-game-over-title" class="ui-btn ui-btn-secondary ui-interactive">
              시작 화면으로 [TITLE]
            </button>
            <button id="btn-game-over-settings" class="ui-btn ui-btn-subtle ui-interactive">
              ⚙ 설정
            </button>
          </div>
        </div>
      </div>

      <!-- 5. 환경 설정 모달 (SETTINGS) -->
      <div id="modal-settings" class="ui-modal-wrapper" style="display: none;">
        <div class="ui-panel settings-panel">
          <div class="panel-header">
            <h2 class="ui-title title-settings">⚙ 환경 설정</h2>
          </div>

          <div class="settings-content">
            <!-- BGM 볼륨 -->
            <div class="setting-item">
              <div class="setting-label-row">
                <span>배경음악 (BGM)</span>
                <span id="label-bgm-val" class="setting-val">50%</span>
              </div>
              <input type="range" id="slider-bgm" class="ui-slider ui-interactive" min="0" max="100" value="50">
            </div>

            <!-- SFX 볼륨 -->
            <div class="setting-item">
              <div class="setting-label-row">
                <span>효과음 (SFX)</span>
                <span id="label-sfx-val" class="setting-val">70%</span>
              </div>
              <input type="range" id="slider-sfx" class="ui-slider ui-interactive" min="0" max="100" value="70">
            </div>

            <!-- 전체 음소거 -->
            <div class="setting-item setting-checkbox-item">
              <label class="checkbox-container ui-interactive">
                <input type="checkbox" id="check-mute" class="ui-checkbox ui-interactive">
                <span class="checkmark"></span>
                <span class="checkbox-label">전체 음소거 (Mute All)</span>
              </label>
            </div>
          </div>

          <div class="panel-buttons">
            <button id="btn-close-settings" class="ui-btn ui-btn-primary ui-interactive">
              닫기 [CLOSE]
            </button>
          </div>
        </div>
      </div>
    `;

    // DOM 요소 캐시
    this.elements = {
      portraitHint: this.overlay.querySelector('#portrait-orientation-hint'),
      screenHud: this.overlay.querySelector('#screen-hud'),
      screenReady: this.overlay.querySelector('#screen-ready'),
      screenPaused: this.overlay.querySelector('#screen-paused'),
      screenGameOver: this.overlay.querySelector('#screen-game-over'),
      modalSettings: this.overlay.querySelector('#modal-settings'),

      // HUD 텍스트
      hudScore: this.overlay.querySelector('#hud-score'),
      hudBest: this.overlay.querySelector('#hud-best'),
      hudSpeed: this.overlay.querySelector('#hud-speed'),
      btnHudPause: this.overlay.querySelector('#btn-hud-pause'),
      btnHudSound: this.overlay.querySelector('#btn-hud-sound'),
      btnTouchJump: this.overlay.querySelector('#btn-touch-jump'),
      btnTouchHook: this.overlay.querySelector('#btn-touch-hook'),

      // 시작 화면
      readyBestScore: this.overlay.querySelector('#ready-best-score'),
      btnStartGame: this.overlay.querySelector('#btn-start-game'),
      btnReadySettings: this.overlay.querySelector('#btn-ready-settings'),

      // 일시정지 화면
      pausedCurrentScore: this.overlay.querySelector('#paused-current-score'),
      pausedBestScore: this.overlay.querySelector('#paused-best-score'),
      btnResumeGame: this.overlay.querySelector('#btn-resume-game'),
      btnRestartFromPause: this.overlay.querySelector('#btn-restart-from-pause'),
      btnPauseSettings: this.overlay.querySelector('#btn-pause-settings'),
      btnPauseTitle: this.overlay.querySelector('#btn-pause-title'),

      // 게임 오버 화면
      gameOverCause: this.overlay.querySelector('#game-over-cause'),
      gameOverNewRecord: this.overlay.querySelector('#game-over-new-record'),
      gameOverFinalScore: this.overlay.querySelector('#game-over-final-score'),
      gameOverBestScore: this.overlay.querySelector('#game-over-best-score'),
      btnGameOverRestart: this.overlay.querySelector('#btn-game-over-restart'),
      btnGameOverTitle: this.overlay.querySelector('#btn-game-over-title'),
      btnGameOverSettings: this.overlay.querySelector('#btn-game-over-settings'),

      // 설정 모달
      sliderBgm: this.overlay.querySelector('#slider-bgm'),
      labelBgmVal: this.overlay.querySelector('#label-bgm-val'),
      sliderSfx: this.overlay.querySelector('#slider-sfx'),
      labelSfxVal: this.overlay.querySelector('#label-sfx-val'),
      checkMute: this.overlay.querySelector('#check-mute'),
      btnCloseSettings: this.overlay.querySelector('#btn-close-settings'),
    };

    // 설정 모달 폼 초기값 동기화
    this._syncSettingsForm();
  }

  /**
   * 현재 오디오 설정값을 설정 폼에 반영
   */
  _syncSettingsForm() {
    if (!this.audioManager) return;
    const bgmPercent = Math.round(this.audioManager.bgmVolume * 100);
    const sfxPercent = Math.round(this.audioManager.sfxVolume * 100);
    const isMuted = this.audioManager.isMuted;

    this.elements.sliderBgm.value = bgmPercent;
    this.elements.labelBgmVal.textContent = `${bgmPercent}%`;

    this.elements.sliderSfx.value = sfxPercent;
    this.elements.labelSfxVal.textContent = `${sfxPercent}%`;

    this.elements.checkMute.checked = isMuted;
    this._updateSoundButtonIcon(isMuted);
  }

  /**
   * 상단 음소거 버튼 아이콘 갱신
   * @param {boolean} isMuted
   */
  _updateSoundButtonIcon(isMuted) {
    if (this.elements.btnHudSound) {
      this.elements.btnHudSound.textContent = isMuted ? '🔇' : '🔊';
    }
  }

  /**
   * UI 이벤트 리스너 바인딩
   */
  _bindEvents() {
    const playClick = () => {
      if (this.audioManager) {
        this.audioManager.playSfx('BUTTON_CLICK');
      }
    };

    // 모든 버튼 클릭 시 버튼 효과음 재생 및 기본 이벤트 처리
    this.overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn) {
        playClick();
      }
    });

    // 1. 시작 화면
    this.elements.btnStartGame?.addEventListener('click', () => {
      this.onStart();
    });

    this.elements.btnReadySettings?.addEventListener('click', () => {
      this.openSettings();
    });

    // 2. HUD 버튼
    this.elements.btnHudPause?.addEventListener('click', () => {
      if (this.gameState.is(GameState.PLAYING)) {
        this.gameState.setState(GameState.PAUSED);
      }
    });

    this.elements.btnHudSound?.addEventListener('click', () => {
      if (this.audioManager) {
        const isMuted = this.audioManager.toggleMute();
        this._updateSoundButtonIcon(isMuted);
        if (this.elements.checkMute) {
          this.elements.checkMute.checked = isMuted;
        }
      }
    });

    // 2-1. HUD 가상 터치 조작 버튼 (모바일 0ms 즉각 반응 및 스크롤/확대 제어, STEP 6 - 중복 입력 방지)
    const bindTouchAction = (btn, actionKey, actionFn) => {
      if (!btn) return;
      let pointerHandled = false;

      btn.addEventListener(
        'pointerdown',
        (e) => {
          e.preventDefault();
          e.stopPropagation();

          // 쿨다운 확인
          const now = performance.now();
          const lastTime = this._touchButtonCooldown.get(actionKey) || 0;
          if (now - lastTime < this._TOUCH_COOLDOWN_MS) {
            return;
          }

          this._touchButtonCooldown.set(actionKey, now);
          pointerHandled = true;
          actionFn();
        },
        { passive: false }
      );

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!pointerHandled) {
          const now = performance.now();
          const lastTime = this._touchButtonCooldown.get(actionKey) || 0;
          if (now - lastTime >= this._TOUCH_COOLDOWN_MS) {
            this._touchButtonCooldown.set(actionKey, now);
            actionFn();
          }
        }
        pointerHandled = false;
      });
    };

    bindTouchAction(this.elements.btnTouchJump, 'touch_jump', () => this.onJumpAction());
    bindTouchAction(this.elements.btnTouchHook, 'touch_hook', () => this.onHookAction());

    // 3. 일시정지 화면
    this.elements.btnResumeGame?.addEventListener('click', () => {
      this.onResume();
    });

    this.elements.btnRestartFromPause?.addEventListener('click', () => {
      this.onRestart();
    });

    this.elements.btnPauseSettings?.addEventListener('click', () => {
      this.openSettings();
    });

    this.elements.btnPauseTitle?.addEventListener('click', () => {
      this.onTitle();
    });

    // 4. 게임 오버 화면
    this.elements.btnGameOverRestart?.addEventListener('click', () => {
      this.onRestart();
    });

    this.elements.btnGameOverTitle?.addEventListener('click', () => {
      this.onTitle();
    });

    this.elements.btnGameOverSettings?.addEventListener('click', () => {
      this.openSettings();
    });

    // 5. 설정 모달
    this.elements.sliderBgm?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      this.elements.labelBgmVal.textContent = `${val}%`;
      if (this.audioManager) {
        this.audioManager.setBgmVolume(val / 100);
      }
    });

    this.elements.sliderSfx?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      this.elements.labelSfxVal.textContent = `${val}%`;
      if (this.audioManager) {
        this.audioManager.setSfxVolume(val / 100);
      }
    });

    this.elements.checkMute?.addEventListener('change', (e) => {
      const isMuted = e.target.checked;
      if (this.audioManager) {
        this.audioManager.setMuted(isMuted);
        this._updateSoundButtonIcon(isMuted);
      }
    });

    this.elements.btnCloseSettings?.addEventListener('click', () => {
      this.closeSettings();
    });

    // 6. 모바일 세로/가로 화면 감지 및 가이드 표시 (STEP 6)
    this._onOrientationResize = () => {
      if (typeof window === 'undefined') return;
      const isPortrait = window.innerHeight > window.innerWidth;
      const isMobile = window.innerWidth <= 840 || (typeof navigator !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent));
      if (this.elements.portraitHint) {
        this.elements.portraitHint.style.display = (isPortrait && isMobile) ? 'flex' : 'none';
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this._onOrientationResize);
      window.addEventListener('orientationchange', () => {
        setTimeout(this._onOrientationResize, 150);
      });
      this._onOrientationResize();
    }
  }

  /**
   * 게임 상태 변경 구독
   */
  _subscribeGameState() {
    if (!this.gameState) return;

    this.gameState.subscribe((nextState) => {
      this.updateStateView(nextState);
    });

    // 초기 상태 뷰 설정
    this.updateStateView(this.gameState.current);
  }

  /**
   * 게임 상태에 따른 뷰 화면 전환
   * @param {string} state GameState
   */
  updateStateView(state) {
    // 모든 화면 숨김
    this.elements.screenReady.style.display = 'none';
    this.elements.screenHud.style.display = 'none';
    this.elements.screenPaused.style.display = 'none';
    this.elements.screenGameOver.style.display = 'none';

    switch (state) {
      case GameState.READY:
        this.elements.screenReady.style.display = 'flex';
        if (this.scoreManager) {
          this.elements.readyBestScore.textContent = this.scoreManager.formatScore(this.scoreManager.bestScore);
        }
        break;

      case GameState.PLAYING:
        this.elements.screenHud.style.display = 'flex';
        this.closeSettings();
        break;

      case GameState.PAUSED:
        this.elements.screenHud.style.display = 'flex';
        this.elements.screenPaused.style.display = 'flex';
        if (this.scoreManager) {
          this.elements.pausedCurrentScore.textContent = this.scoreManager.formatScore(this.scoreManager.currentScore);
          this.elements.pausedBestScore.textContent = this.scoreManager.formatScore(this.scoreManager.bestScore);
        }
        break;

      case GameState.GAME_OVER:
        this.elements.screenGameOver.style.display = 'flex';
        if (this.elements.gameOverCause) {
          if (this.lastDeathCause === 'FALL') {
            this.elements.gameOverCause.textContent = '낭떠러지 아래로 추락했습니다!';
            this.elements.gameOverCause.style.color = '#e63946';
          } else {
            this.elements.gameOverCause.textContent = '도깨비 장애물과 충돌했습니다!';
            this.elements.gameOverCause.style.color = '#94a3b8';
          }
        }
        if (this.scoreManager) {
          const finalVal = this.scoreManager.formatScore(this.scoreManager.currentScore);
          const bestVal = this.scoreManager.formatScore(this.scoreManager.bestScore);
          this.elements.gameOverFinalScore.textContent = finalVal;
          this.elements.gameOverBestScore.textContent = bestVal;

          // 신기록 달성 강조 배너 표시
          if (this.scoreManager.hasNewRecord) {
            this.elements.gameOverNewRecord.style.display = 'block';
          } else {
            this.elements.gameOverNewRecord.style.display = 'none';
          }
        }
        break;
    }
  }

  /**
   * 실시간 HUD 수치 업데이트
   * @param {number} score 현재 점수
   * @param {number} highScore 최고 점수
   * @param {number} currentSpeed 현재 게임 속도 (px/s)
   */
  updateHUD(score, highScore, currentSpeed) {
    if (this.elements.hudScore && this.scoreManager) {
      this.elements.hudScore.textContent = this.scoreManager.formatScore(score);
    }
    if (this.elements.hudBest && this.scoreManager) {
      this.elements.hudBest.textContent = this.scoreManager.formatScore(highScore);
    }
    if (this.elements.hudSpeed) {
      this.elements.hudSpeed.textContent = `${Math.round(currentSpeed)} px/s`;
    }
  }

  /**
   * 게임 오버 원인 설정 ('OBSTACLE' | 'FALL')
   * @param {'OBSTACLE' | 'FALL'} cause
   */
  setGameOverCause(cause) {
    this.lastDeathCause = cause;
  }

  /**
   * 환경 설정 모달 열기
   */
  openSettings() {
    this._syncSettingsForm();
    if (this.elements.modalSettings) {
      this.elements.modalSettings.style.display = 'flex';
    }
  }

  /**
   * 환경 설정 모달 닫기
   */
  closeSettings() {
    if (this.elements.modalSettings) {
      this.elements.modalSettings.style.display = 'none';
    }
  }

  /**
   * UI 이벤트 리스너 및 DOM 정리 (STEP 6 메모리 누수 방지)
   */
  destroy() {
    if (this._onOrientationResize && typeof window !== 'undefined') {
      window.removeEventListener('resize', this._onOrientationResize);
      window.removeEventListener('orientationchange', this._onOrientationResize);
    }
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    if (this._touchButtonCooldown) {
      this._touchButtonCooldown.clear();
    }
  }
}
