import { GameState } from '../game/GameState.js';
import { ShopUI } from './ShopUI.js';
import { NICKNAME_MAX } from './ProfileManager.js';

/**
 * UI 관리자 모듈 (UIManager)
 * 시작 화면(READY), 플레이 HUD(PLAYING), 일시정지(PAUSED), 게임 오버(GAME_OVER),
 * 설정 모달(SETTINGS)을 관리하고 Demon Slayer 테마의 현대적 픽셀 UI를 렌더링합니다.
 */
function p0frame(el) {
  return el.charPreview ? el.charPreview.parentElement : null;
}

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
    this.characters = options.characters || null;
    this.shop = options.shop || null;
    this.profile = options.profile || null;
    this.onSelectCharacter = options.onSelectCharacter || (() => {});

    this.lastDeathCause = 'OBSTACLE';
    // 직전 플레이의 니어미스 통계 (게임 오버 화면 표시용)
    this.runStats = { nearMisses: 0, maxCombo: 0, coins: 0, bonus: 0, distanceScore: 0, seconds: 0, powerUps: 0, shieldSaves: 0, smashes: 0 };
    this._lastCoinText = '';

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
          <div class="hud-stat-box coin-box">
            <span class="hud-label">COIN</span>
            <span id="hud-coins" class="hud-value hud-coin-val">0</span>
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

      <!-- 2. 홈 화면 (READY) -->
      <div id="screen-ready" class="ui-screen home-screen" style="display: none;">
        <div class="home-top">
          <div class="home-brand">
            <div class="badge-theme">DEMON SLAYER RUNNER</div>
            <h1 class="ui-title logo-text">GOGUN RUN</h1>
          </div>
          <div class="home-wallet" title="보유 코인">🪙 <span id="ready-coins" class="coin-val">0</span></div>
        </div>

        <div class="home-main">
          <!-- 좌: 프로필 카드 -->
          <section class="home-card home-profile">
            <div class="profile-head">
              <div id="profile-avatar" class="profile-avatar"></div>
              <div class="profile-id">
                <div class="profile-name-row">
                  <span id="profile-name" class="profile-name">러너</span>
                  <input id="profile-name-input" class="profile-name-input ui-interactive" type="text" maxlength="24" style="display: none;" aria-label="닉네임">
                  <button id="btn-edit-name" class="profile-edit ui-interactive" title="닉네임 바꾸기">✎</button>
                </div>
                <div id="profile-msg" class="profile-msg"></div>
              </div>
            </div>
            <div class="profile-stats">
              <div class="profile-stat"><span>🏆 최고 기록</span><b id="ready-best-score">000000</b></div>
              <div class="profile-stat"><span>🏃 플레이 횟수</span><b id="profile-runs">0</b></div>
              <div class="profile-stat"><span>⚡ 누적 니어미스</span><b id="profile-near">0</b></div>
            </div>
            <button class="ui-btn ui-btn-subtle home-soon" disabled>✨ 프로필 꾸미기 (준비 중)</button>
          </section>

          <!-- 중: 캐릭터 -->
          <section class="home-stage">
            <div id="char-select" class="char-select" style="display: none;">
              <button id="btn-char-prev" class="ui-btn ui-btn-icon ui-interactive char-arrow" title="이전 캐릭터 (←)">◀</button>
              <div class="char-card">
                <div class="char-preview-frame"><div id="char-preview" class="char-preview"></div></div>
                <div id="char-name" class="char-name"></div>
                <div id="char-desc" class="char-desc"></div>
                <div id="char-dots" class="char-dots"></div>
              </div>
              <button id="btn-char-next" class="ui-btn ui-btn-icon ui-interactive char-arrow" title="다음 캐릭터 (→)">▶</button>
            </div>
          </section>

          <!-- 우: 메뉴 -->
          <nav class="home-menu">
            <button id="btn-start-game" class="ui-btn ui-btn-primary ui-interactive home-start">
              ▶ 게임 시작
            </button>
            <button id="btn-ready-shop" class="ui-btn ui-btn-secondary ui-interactive">
              🛒 상점
            </button>
            <button id="btn-ready-rank" class="ui-btn ui-btn-subtle" disabled>
              🏆 랭킹 (준비 중)
            </button>
            <button id="btn-ready-settings" class="ui-btn ui-btn-secondary ui-interactive">
              ⚙ 환경 설정
            </button>
          </nav>
        </div>

        <div class="home-guide">
          <span>[SPACE]/[↑] 점프</span><span>[Z]/[J]/우클릭 갈고리</span><span>[P]/[ESC] 일시정지</span><span>[←][→] 캐릭터 변경</span>
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

          <div class="result-top">
            <div id="game-over-grade" class="result-grade" data-grade="C" aria-label="등급">
              <span class="grade-caption">GRADE</span>
              <span id="game-over-grade-letter" class="grade-letter">-</span>
            </div>
            <div class="result-score-box">
              <span class="card-label">최종 점수</span>
              <span id="game-over-final-score" class="card-val final-val">000000</span>
              <span id="game-over-goal" class="result-goal"></span>
            </div>
          </div>

          <div id="game-over-card" class="score-summary-card">
            <div class="score-card-row result-row">
              <span class="card-label">거리 점수</span>
              <span id="game-over-distance" class="card-val dist-val">0</span>
            </div>
            <div class="score-card-row result-row">
              <span class="card-label">니어미스 보너스</span>
              <span id="game-over-bonus" class="card-val near-miss-val">+0</span>
            </div>
            <div class="score-card-row result-row">
              <span class="card-label">니어미스 / 최대 콤보</span>
              <span id="game-over-near-miss" class="card-val near-miss-val">0회 · x0</span>
            </div>
            <div class="score-card-row result-row">
              <span class="card-label">파워업 / 방어 / 박살</span>
              <span id="game-over-powerups" class="card-val power-val">0 · 0 · 0</span>
            </div>
            <div class="score-card-row result-row">
              <span class="card-label">생존 시간</span>
              <span id="game-over-time" class="card-val dist-val">0초</span>
            </div>
            <div class="score-card-divider"></div>
            <div class="score-card-row result-row">
              <span class="card-label">최고 기록</span>
              <span id="game-over-best-score" class="card-val best-val">000000</span>
            </div>
            <div class="score-card-row result-row">
              <span class="card-label">이번 판 획득 코인</span>
              <span id="game-over-coins" class="card-val coin-val">0</span>
            </div>
          </div>

          <div class="panel-buttons">
            <button id="btn-game-over-restart" class="ui-btn ui-btn-primary ui-interactive">
              다시 도전 [RETRY]
            </button>
            <button id="btn-game-over-title" class="ui-btn ui-btn-secondary ui-interactive">
              시작 화면으로 [TITLE]
            </button>
            <button id="btn-game-over-shop" class="ui-btn ui-btn-secondary ui-interactive">
              🛒 상점
            </button>
            <button id="btn-game-over-settings" class="ui-btn ui-btn-subtle ui-interactive">
              ⚙ 설정
            </button>
          </div>
        </div>
      </div>

      <!-- 4-1. 상점 모달 (SHOP) -->
      <div id="modal-shop" class="ui-modal-wrapper" style="display: none;">
        <div class="ui-panel shop-panel">
          <div class="shop-head">
            <h2 class="ui-title title-shop">🛒 상점</h2>
            <div class="shop-wallet">🪙 <span id="shop-coins">0</span></div>
          </div>
          <div class="shop-tabs">
            <button class="shop-tab ui-interactive" data-tab="character">캐릭터</button>
            <button class="shop-tab ui-interactive" data-tab="cosmetic">꾸미기</button>
            <button class="shop-tab ui-interactive" data-tab="pet">펫</button>
          </div>
          <div id="shop-msg" class="shop-msg"></div>
          <div id="shop-grid" class="shop-grid"></div>
          <div class="panel-buttons">
            <button id="btn-close-shop" class="ui-btn ui-btn-primary ui-interactive">닫기 [CLOSE]</button>
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
      hudCoins: this.overlay.querySelector('#hud-coins'),
      readyCoins: this.overlay.querySelector('#ready-coins'),
      profileAvatar: this.overlay.querySelector('#profile-avatar'),
      profileName: this.overlay.querySelector('#profile-name'),
      profileNameInput: this.overlay.querySelector('#profile-name-input'),
      btnEditName: this.overlay.querySelector('#btn-edit-name'),
      profileMsg: this.overlay.querySelector('#profile-msg'),
      profileRuns: this.overlay.querySelector('#profile-runs'),
      profileNear: this.overlay.querySelector('#profile-near'),
      gameOverCoins: this.overlay.querySelector('#game-over-coins'),
      btnReadyShop: this.overlay.querySelector('#btn-ready-shop'),
      btnGameOverShop: this.overlay.querySelector('#btn-game-over-shop'),
      modalShop: this.overlay.querySelector('#modal-shop'),
      btnHudPause: this.overlay.querySelector('#btn-hud-pause'),
      btnHudSound: this.overlay.querySelector('#btn-hud-sound'),
      btnTouchJump: this.overlay.querySelector('#btn-touch-jump'),
      btnTouchHook: this.overlay.querySelector('#btn-touch-hook'),

      // 시작 화면
      readyBestScore: this.overlay.querySelector('#ready-best-score'),
      btnStartGame: this.overlay.querySelector('#btn-start-game'),
      charSelect: this.overlay.querySelector('#char-select'),
      charPreview: this.overlay.querySelector('#char-preview'),
      charName: this.overlay.querySelector('#char-name'),
      charDesc: this.overlay.querySelector('#char-desc'),
      charDots: this.overlay.querySelector('#char-dots'),
      btnCharPrev: this.overlay.querySelector('#btn-char-prev'),
      btnCharNext: this.overlay.querySelector('#btn-char-next'),
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
      gameOverNearMiss: this.overlay.querySelector('#game-over-near-miss'),
      gameOverCard: this.overlay.querySelector('#game-over-card'),
      gameOverGrade: this.overlay.querySelector('#game-over-grade'),
      gameOverGradeLetter: this.overlay.querySelector('#game-over-grade-letter'),
      gameOverGoal: this.overlay.querySelector('#game-over-goal'),
      gameOverDistance: this.overlay.querySelector('#game-over-distance'),
      gameOverBonus: this.overlay.querySelector('#game-over-bonus'),
      gameOverPowerups: this.overlay.querySelector('#game-over-powerups'),
      gameOverTime: this.overlay.querySelector('#game-over-time'),
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

    // 1-0a. 프로필 닉네임 편집 (✎ 클릭 → 입력 → Enter 저장 / Esc 취소)
    this.elements.btnEditName?.addEventListener('click', () => this._startNameEdit());
    const nameInput = this.elements.profileNameInput;
    if (nameInput) {
      nameInput.maxLength = NICKNAME_MAX * 2; // 입력 중엔 여유를 두고, 저장할 때 정리/자름
      nameInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); this._commitNameEdit(); }
        else if (e.key === 'Escape') { e.preventDefault(); this._endNameEdit(); }
      });
      nameInput.addEventListener('blur', () => this._commitNameEdit());
    }

    // 1-0. 상점 (타이틀 / 게임 오버 화면에서 열기)
    if (this.shop && this.elements.modalShop) {
      this.shopUI = new ShopUI(this.elements.modalShop, {
        shop: this.shop,
        characters: this.characters,
        onSelectCharacter: (id) => this.onSelectCharacter(id),
        onClose: () => {
          this._renderCharacterSelect();
          this._refreshHome();
        },
      });
    }
    this.elements.btnReadyShop?.addEventListener('click', () => this.openShop());
    this.elements.btnGameOverShop?.addEventListener('click', () => this.openShop());

    // 1-1. 캐릭터 선택 (버튼 / 좌우 방향키)
    this.elements.btnCharPrev?.addEventListener('click', () => this._cycleCharacter(-1));
    this.elements.btnCharNext?.addEventListener('click', () => this._cycleCharacter(1));
    this._onCharKeyDown = (e) => {
      if (!this.gameState.is(GameState.READY)) return;
      if (this.isModalOpen()) return;
      if (e.code === 'ArrowLeft') this._cycleCharacter(-1);
      else if (e.code === 'ArrowRight') this._cycleCharacter(1);
    };
    window.addEventListener('keydown', this._onCharKeyDown);
    this._renderCharacterSelect();

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
    if (state !== GameState.GAME_OVER) this._cancelResult();

    switch (state) {
      case GameState.READY:
        this.elements.screenReady.style.display = 'flex';
        if (this.scoreManager) {
          this.elements.readyBestScore.textContent = this.scoreManager.formatScore(this.scoreManager.bestScore);
        }
        this._refreshHome();
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
        this._playResultSequence();
        break;
    }
  }

  // ===========================================================================
  // 결과 화면 연출 (점수 카운트업 → 항목 차례로 등장 → 등급 도장 → 신기록 팡파르)
  // ===========================================================================

  /** 점수에 맞는 등급과 다음 등급 정보 */
  _gradeFor(score) {
    const list = (this.scoreManager?.scoreConfig?.GRADES) || [{ min: 0, label: 'C', color: '#94a3b8' }];
    let idx = 0;
    for (let i = 0; i < list.length; i++) if (score >= list[i].min) idx = i;
    return { grade: list[idx], rank: idx, next: list[idx + 1] || null };
  }

  _cancelResult() {
    this._resultToken = (this._resultToken || 0) + 1;
    if (this._resultTimers) { for (const t of this._resultTimers) clearTimeout(t); }
    this._resultTimers = [];
    if (this._resultRaf) { cancelAnimationFrame(this._resultRaf); this._resultRaf = 0; }
  }

  _playResultSequence() {
    this._cancelResult();
    const el = this.elements;
    const st = this.runStats;
    const sm = this.scoreManager;
    if (!sm || !el.gameOverFinalScore) return;
    const token = this._resultToken;
    const sfx = (k, o) => { if (this.audioManager) this.audioManager.playSfx(k, o); };
    const fmtN = (n) => Math.round(n).toLocaleString('ko-KR');

    const finalScore = sm.currentScore;
    const best = sm.bestScore;
    const isRecord = sm.hasNewRecord;
    const { grade, rank, next } = this._gradeFor(finalScore);
    const distance = st.distanceScore ?? Math.max(0, finalScore - (st.bonus || 0));

    // 최종 값들은 미리 정확히 채워 둔다 (카운트업이 건너뛰어져도 값이 맞도록)
    const finals = () => {
      el.gameOverFinalScore.textContent = sm.formatScore(finalScore);
      el.gameOverBestScore.textContent = sm.formatScore(best);
      el.gameOverDistance.textContent = fmtN(distance);
      el.gameOverBonus.textContent = `+${fmtN(st.bonus || 0)}`;
      el.gameOverNearMiss.textContent = `${st.nearMisses}회 · x${st.maxCombo}`;
      el.gameOverPowerups.textContent = `${st.powerUps || 0} · ${st.shieldSaves || 0} · ${st.smashes || 0}`;
      el.gameOverTime.textContent = `${Math.round(st.seconds || 0)}초`;
      el.gameOverCoins.textContent = `+${st.coins}`;
      el.gameOverGradeLetter.textContent = grade.label;
      el.gameOverGrade.dataset.grade = grade.label;
      el.gameOverGrade.style.setProperty('--grade-color', grade.color);
      el.gameOverGrade.classList.add('stamped');
      el.gameOverNewRecord.style.display = isRecord ? 'block' : 'none';
      let goal;
      if (isRecord) goal = '최고 기록을 갱신했어요!';
      else {
        const gap = best - finalScore + 1;
        goal = `신기록까지 ${fmtN(gap)}점`;
      }
      if (next) goal += ` · ${next.label}등급까지 ${fmtN(next.min - finalScore)}점`;
      else goal += ' · 최고 등급!';
      el.gameOverGoal.textContent = goal;
    };

    // 연출 시작 상태: 비워 둠
    finals();
    const rows = [...el.gameOverCard.querySelectorAll('.result-row')];
    rows.forEach((r) => r.classList.remove('shown'));
    el.gameOverGrade.classList.remove('stamped');
    el.gameOverNewRecord.style.display = 'none';
    el.gameOverGoal.classList.remove('shown');
    el.gameOverFinalScore.textContent = sm.formatScore(0);

    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finish = () => {
      finals();
      rows.forEach((r) => r.classList.add('shown'));
      el.gameOverGoal.classList.add('shown');
    };
    if (reduce) { finish(); return; }

    // 클릭/터치로 연출 건너뛰기 (버튼은 제외)
    const panel = el.screenGameOver.querySelector('.game-over-panel');
    const skip = (e) => {
      if (e.target.closest && e.target.closest('button')) return;
      panel.removeEventListener('pointerdown', skip);
      this._cancelResult();
      finish();
    };
    panel.addEventListener('pointerdown', skip);
    this._resultTimers.push(0);   // 자리 표시 (cancel 시 clearTimeout(0) 무해)

    const later = (ms, fn) => {
      const id = setTimeout(() => { if (token === this._resultToken) fn(); }, ms);
      this._resultTimers.push(id);
    };

    // 1) 점수 카운트업
    const COUNT_MS = Math.min(1400, 600 + finalScore * 0.35);
    const t0 = performance.now();
    let lastTick = -1;
    const step = (now) => {
      if (token !== this._resultToken) return;
      const k = Math.min(1, (now - t0) / COUNT_MS);
      const eased = 1 - Math.pow(1 - k, 3);
      el.gameOverFinalScore.textContent = sm.formatScore(finalScore * eased);
      const tick = Math.floor(k * 18);
      if (tick !== lastTick && k < 1) { lastTick = tick; sfx('RESULT_TICK', { step: tick }); }
      if (k < 1) this._resultRaf = requestAnimationFrame(step);
      else {
        this._resultRaf = 0;
        el.gameOverFinalScore.textContent = sm.formatScore(finalScore);
        el.gameOverFinalScore.classList.add('pop');
        later(300, () => el.gameOverFinalScore.classList.remove('pop'));
      }
    };
    this._resultRaf = requestAnimationFrame(step);

    // 2) 항목이 차례로 나타남
    let t = COUNT_MS + 120;
    rows.forEach((r) => {
      later(t, () => { r.classList.add('shown'); sfx('RESULT_HIT'); });
      t += 130;
    });
    // 3) 등급 도장
    later(t + 100, () => {
      el.gameOverGrade.classList.add('stamped');
      sfx('GRADE', { rank });
      el.gameOverGoal.classList.add('shown');
    });
    // 4) 신기록 팡파르
    if (isRecord) {
      later(t + 450, () => { el.gameOverNewRecord.style.display = 'block'; sfx('RECORD'); });
    }
    later(t + 600, () => panel.removeEventListener('pointerdown', skip));
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
   * 게임 오버 화면에 표시할 니어미스 통계 설정 (상태를 GAME_OVER 로 바꾸기 전에 호출)
   * @param {{ nearMisses: number, maxCombo: number }} stats
   */
  setRunStats(stats) {
    this.runStats = {
      nearMisses: Math.max(0, Math.floor(stats?.nearMisses || 0)),
      maxCombo: Math.max(0, Math.floor(stats?.maxCombo || 0)),
      coins: Math.max(0, Math.floor(stats?.coins || 0)),
      bonus: Math.max(0, Math.floor(stats?.bonus || 0)),
      distanceScore: Math.max(0, Math.floor(stats?.distanceScore || 0)),
      seconds: Math.max(0, Number(stats?.seconds) || 0),
      powerUps: Math.max(0, Math.floor(stats?.powerUps || 0)),
      shieldSaves: Math.max(0, Math.floor(stats?.shieldSaves || 0)),
      smashes: Math.max(0, Math.floor(stats?.smashes || 0)),
    };
  }

  /** 설정/상점 모달이 열려 있는지 (열려 있으면 게임 입력을 막기 위해 사용) */
  isModalOpen() {
    const open = (el) => !!el && el.style.display !== 'none';
    return open(this.elements.modalSettings) || open(this.elements.modalShop);
  }

  openShop() {
    this.shopUI?.open();
  }

  /** 홈 화면의 코인 / 프로필 카드 / 아바타 갱신 */
  _refreshHome() {
    this._refreshReadyCoins();
    const el = this.elements;
    if (this.profile) {
      if (el.profileName) el.profileName.textContent = this.profile.nickname;
      if (el.profileRuns) el.profileRuns.textContent = this.profile.state.runs.toLocaleString('ko-KR');
      if (el.profileNear) el.profileNear.textContent = this.profile.state.nearMisses.toLocaleString('ko-KR');
    }
    this._refreshAvatar();
  }

  /** 선택한 캐릭터의 얼굴 부분을 아바타 틀에 표시 (스프라이트 첫 프레임을 확대해서 자름) */
  _refreshAvatar() {
    const av = this.elements.profileAvatar;
    if (!av || !this.characters) return;
    const ch = this.characters.getSelected();
    av.style.backgroundImage = `url("${ch.SRC}")`;   // 크기/위치는 CSS(.profile-avatar)가 담당
  }

  _startNameEdit() {
    const el = this.elements;
    if (!this.profile || !el.profileNameInput) return;
    el.profileMsg.textContent = '';
    el.profileNameInput.value = this.profile.nickname;
    el.profileName.style.display = 'none';
    el.btnEditName.style.display = 'none';
    el.profileNameInput.style.display = '';
    el.profileNameInput.focus();
    el.profileNameInput.select();
    this._editingName = true;
  }

  _commitNameEdit() {
    if (!this._editingName) return;
    const el = this.elements;
    const r = this.profile.setNickname(el.profileNameInput.value);
    if (!r.ok) {
      el.profileMsg.textContent = r.reason;
      el.profileNameInput.focus();
      return;
    }
    el.profileMsg.textContent = '';
    this._endNameEdit();
  }

  _endNameEdit() {
    const el = this.elements;
    this._editingName = false;
    el.profileMsg.textContent = '';
    el.profileNameInput.style.display = 'none';
    el.profileName.style.display = '';
    el.btnEditName.style.display = '';
    this._refreshHome();
  }

  _refreshReadyCoins() {
    if (this.shop && this.elements.readyCoins) {
      this.elements.readyCoins.textContent = this.shop.coins.toLocaleString('ko-KR');
    }
  }

  /** HUD 코인 표시 (값이 바뀔 때만 DOM 갱신) */
  updateCoins(runCoins, wallet) {
    const text = String(runCoins);
    if (text !== this._lastCoinText && this.elements.hudCoins) {
      this._lastCoinText = text;
      this.elements.hudCoins.textContent = text;
    }
  }

  /** 캐릭터 목록이 바뀐 뒤(JSON 로드 등) 선택 UI 갱신 */
  refreshCharacterSelect() {
    this._renderCharacterSelect();
  }

  /**
   * 캐릭터 순환 선택 (시작 화면 전용)
   * @param {number} step +1 다음 / -1 이전
   */
  _cycleCharacter(step) {
    if (!this.characters || this.characters.ownedList().length < 2) return;
    const ch = this.characters.cycle(step);
    if (ch) this.onSelectCharacter(ch.ID);
    this._renderCharacterSelect();
    this._refreshAvatar();
  }

  /**
   * 캐릭터 선택 영역 갱신 (미리보기는 CSS steps 애니메이션으로 달리기 프레임 재생)
   */
  _renderCharacterSelect() {
    const el = this.elements;
    if (!this.characters || !el.charSelect) return;

    const list = this.characters.ownedList();
    el.charSelect.style.display = 'flex';
    const multi = list.length > 1;
    el.btnCharPrev.style.visibility = multi ? 'visible' : 'hidden';
    el.btnCharNext.style.visibility = multi ? 'visible' : 'hidden';

    const ch = this.characters.getSelected();
    const cfg = this.characters.getPlayerAssetConfig(ch.ID);
    const fw = cfg.FRAME_WIDTH || 64;
    const fh = cfg.FRAME_HEIGHT || 64;
    const run = cfg.ANIMATIONS?.RUN || { FRAMES: [0], FPS: 1 };
    const frames = run.FRAMES.length;
    const scale = (this.overlay.clientHeight || 720) >= 520 ? 3 : 2;
    const frame = p0frame(el);
    if (frame) { frame.style.width = `${fw * scale}px`; frame.style.height = `${fh * scale}px`; }

    const p = el.charPreview;
    p.style.width = `${fw * scale}px`;
    p.style.height = `${fh * scale}px`;
    p.style.backgroundImage = `url("${ch.SRC}")`;
    p.style.backgroundSize = 'auto 100%';
    p.style.setProperty('--char-run-shift', `${-fw * scale * frames}px`);
    p.style.setProperty('--char-run-frames', String(frames));
    p.style.setProperty('--char-run-duration', `${(frames / (run.FPS || 10)).toFixed(3)}s`);
    // 애니메이션 재시작 (캐릭터 교체 시 첫 프레임부터)
    p.style.animation = 'none';
    void p.offsetWidth;
    p.style.animation = '';

    el.charName.textContent = ch.NAME;
    el.charDesc.textContent = ch.DESC || '';
    el.charDots.innerHTML = list
      .map((c) => `<span class="char-dot${c.ID === ch.ID ? ' active' : ''}"></span>`)
      .join('');
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
    this._cancelResult();
    if (this._onOrientationResize && typeof window !== 'undefined') {
      window.removeEventListener('resize', this._onOrientationResize);
      window.removeEventListener('orientationchange', this._onOrientationResize);
    }
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    if (this.shopUI) this.shopUI.destroy();
    if (this._onCharKeyDown && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onCharKeyDown);
    }
    if (this._touchButtonCooldown) {
      this._touchButtonCooldown.clear();
    }
  }
}
