import { GAME_CONFIG } from '../../config/game.config.js';
import { ASSETS_CONFIG } from '../../config/assets.config.js';
import { assetLoader } from '../systems/AssetLoader.js';
import { AudioManager } from '../systems/AudioManager.js';
import { CloudSync } from '../systems/CloudSync.js';
import { UIManager } from '../systems/UIManager.js';
import { GameState, GameStateManager } from './GameState.js';
import { Player, PlayerState } from './Player.js';
import { Renderer } from './Renderer.js';
import { InputManager } from './InputManager.js';
import { ObstacleSpawner } from './ObstacleSpawner.js';
import { Collision } from './Collision.js';
import { ScoreManager } from './ScoreManager.js';
import { TerrainManager } from './TerrainManager.js';
import { HookSystem } from './HookSystem.js';
import { EffectsSystem } from './EffectsSystem.js';
import { NearMissSystem } from './NearMissSystem.js';
import { CharacterManager } from '../systems/CharacterManager.js';
import { ShopManager } from '../systems/ShopManager.js';
import { ProfileManager } from '../systems/ProfileManager.js';
import { CoinSystem } from './CoinSystem.js';
import { PetCompanion } from './PetCompanion.js';
import { PowerUpSystem, POWERUP_TYPES } from './PowerUpSystem.js';

/**
 * Gogun Run 메인 게임 엔진 (STEP 5)
 * 게임 루프, 상태 관리, 렌더링, 입력, 불연속 지형/낭떠러지, 갈고리 로프 액션,
 * 장애물, 점수/최고기록 및 오디오/UI 시스템을 총괄합니다.
 */
export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.config = GAME_CONFIG;
    this.assetsConfig = ASSETS_CONFIG;

    // 1. 오디오 관리자 초기화
    this.audioManager = new AudioManager();

    // 2. 점수 관리자 초기화 (LocalStorage 최고 기록 연동)
    this.scoreManager = new ScoreManager(this.config);

    // 3. 게임 상태 관리자 (기본 상태: 시작 대기 READY)
    this.gameState = new GameStateManager(GameState.READY);

    // 4. 렌더러 초기화
    this.renderer = new Renderer(this.canvas, this.config, this.assetsConfig);

    // 4-1. 타격감 연출 및 니어미스 콤보 시스템 초기화
    this.effects = new EffectsSystem(this.config, this.renderer);
    this.nearMiss = new NearMissSystem(this.config);
    this.coins = new CoinSystem(this.config);
    this.pet = new PetCompanion();
    this.powerUps = new PowerUpSystem(this.config);
    this.powerUps.onPickup = (kind, x, y) => this._handlePowerUpPickup(kind, x, y);
    this.powerUps.onExpire = (kind) => this._handlePowerUpExpire(kind);
    // 부스트 중에는 낭떠러지가 없는 것처럼 바닥이 이어진 지형을 대신 사용
    this._boostFloor = [{ x: -100000, y: this.config.WORLD.GROUND_Y, width: 200000, height: 70 }];
    this.runSeconds = 0;
    this._coinChain = 0;
    this._coinChainTimer = 0;
    this._nextMilestone = this.config.EFFECTS?.MILESTONE_STEP || 0;

    // 5. 지형 및 낭떠러지 관리자 초기화 (STEP 5 & 6)
    this.terrainManager = new TerrainManager(this.config);

    // 6. 갈고리 액션 및 로프 물리 시스템 초기화 (STEP 5 & 6)
    this.hookSystem = new HookSystem(this.config);

    // 낭떠러지(Chasm) 생성 시 갈고리 앵커 존재 보장 (불가능한 점프 구간 원천 방지)
    this.terrainManager.onGapCreated = (gap) => {
      if (gap.isChasm && this.hookSystem) {
        this.hookSystem.ensureAnchorOverGap(gap.midX);
      }
      this.coins.onGapCreated(gap);
    };
    this.terrainManager.onPlatformCreated = (platform) => this.coins.onPlatformCreated(platform);
    // 훅 연결 후 지형을 다시 만들어 첫 화면부터 코인이 배치되게 함
    this.terrainManager.reset();

    // 7. 캐릭터 선택 관리자 + 플레이어 인스턴스 초기화 (에셋 설정 전달)
    this.characters = new CharacterManager(this.assetsConfig.PLAYER);
    // 상점 (지갑 / 보유 / 장착). 캐릭터 보유 여부는 상점이 판단한다
    this.shop = new ShopManager(this.characters);
    this.profile = new ProfileManager();
    this.characters.isOwned = (ch) => this.shop.ownsCharacter(ch);
    // 온라인 계정/동기화 (설정이 없으면 비활성 — 게임은 로컬로만 동작)
    this.cloud = new CloudSync({ profile: this.profile, shop: this.shop, characters: this.characters, scoreManager: this.scoreManager });
    this.player = new Player(
      this.config.PLAYER,
      this.config.PHYSICS,
      this.config.WORLD.GROUND_Y,
      this.characters.getPlayerAssetConfig()
    );
    this.player.spriteKey = CharacterManager.spriteKey(this.characters.getSelected().ID);

    // 8. 플레이어 사운드 및 피드백 이벤트 훅 연결 (STEP 6 착지 먼지 연동)
    this.player.onJump = () => {
      this.audioManager.playSfx('JUMP');
      this.effects.jumpPuff(
        this.player.x + this.player.width / 2,
        this.player.y + this.player.height
      );
    };
    this.player.onLand = () => {
      this.audioManager.playSfx('LAND');
      this.effects.landImpact(
        this.player.x + this.player.width / 2,
        this.player.y + this.player.height,
        this.player.impactVy || 0
      );

      // 낭떠러지 건너편 지면 끝에 아슬아슬하게 걸쳐 착지했다면 니어미스
      const ledge = this.nearMiss.checkLedgeLanding(this.player, this.terrainManager.getPlatforms());
      if (ledge) {
        this._handleNearMiss(ledge);
      }
    };

    // 9. 입력 관리자 초기화
    this.inputManager = new InputManager(
      this.canvas.parentElement || this.canvas,
      this.config.KEYS
    );

    // 10. 장애물 스포너 초기화
    this.obstacleSpawner = new ObstacleSpawner(
      this.config,
      this.config.WORLD.GROUND_Y,
      this.config.CANVAS.LOGICAL_WIDTH,
      this.assetsConfig.OBSTACLES
    );

    this.obstacleSpawner.onSpawn = (obstacle) => this.coins.onObstacleSpawned(obstacle);
    this.obstacleSpawner.onWarn = () => this.audioManager.playSfx('WARNING');

    // 11. UI 관리자 초기화 (뷰포트 부모 요소에 UI 오버레이 마운트)
    const uiMountPoint = this.canvas.parentElement || document.getElementById('game-container');
    this.uiManager = new UIManager(uiMountPoint, {
      gameState: this.gameState,
      scoreManager: this.scoreManager,
      audioManager: this.audioManager,
      onStart: () => this.startGame(),
      onResume: () => this.resumeGame(),
      onRestart: () => this.restart(),
      onTitle: () => this.goToTitle(),
      onJumpAction: () => this.handleJump(),
      onHookAction: () => this.handleHook(),
      characters: this.characters,
      shop: this.shop,
      profile: this.profile,
      cloud: this.cloud,
      onSelectCharacter: (id) => this.selectCharacter(id),
    });

    // 게임 이동 속도 (시간 경과에 따라 점진적 가속)
    this.currentSpeed = this.config.WORLD.BASE_SPEED;

    // 바닥 스크롤 누적 오프셋
    this.groundScrollOffset = 0;

    // 루프 제어 변수
    this.lastTime = 0;
    this.isRunning = false;
    this.animationFrameId = null;

    this._onResize = this._handleResize.bind(this);
  }

  /**
   * 게임 초기화 및 에셋 비동기 사전 로드
   * @returns {Promise<Game>}
   */
  async init() {
    // 0. 캐릭터 목록(JSON) 로드 후 현재 선택 캐릭터를 플레이어에 반영
    await this.characters.loadManifest();
    await this.shop.loadCatalog();
    this.applyEquipment();
    this.shop.onChange(() => this.applyEquipment());
    this.uiManager.refreshCharacterSelect();
    // 서버 기록을 불러오면 화면/장착 상태 갱신
    this.cloud.onApplied = () => {
      this.applyEquipment();
      this.uiManager.refreshCharacterSelect();
      this.uiManager._refreshHome();
    };
    this.cloud.init();   // 기다리지 않음 (네트워크가 느려도 게임은 바로 시작)
    // 지갑은 탭을 닫거나 숨길 때도 저장
    this._onPageHide = () => { if (this.cloud.wiping) return; this.shop.save(); this.cloud.flush(); };
    window.addEventListener('pagehide', this._onPageHide);

    // 1. 에셋 매니페스트 구성 및 비동기 일괄 로드
    const manifest = [
      ...this.characters.getManifest(),
      ...this.shop.itemsOfType('pet').map((p) => ({ key: PetCompanion.spriteKey(p.id), src: p.src })),
      { key: 'ground', src: this.assetsConfig.GROUND.SRC },
    ];

    if (this.assetsConfig.BACKGROUND?.LAYERS) {
      for (const layer of this.assetsConfig.BACKGROUND.LAYERS) {
        manifest.push({ key: 'bg_' + layer.ID, src: layer.SRC });
      }
    }

    if (this.assetsConfig.OBSTACLES) {
      for (const [id, cfg] of Object.entries(this.assetsConfig.OBSTACLES)) {
        manifest.push({ key: 'obstacle_' + id, src: cfg.SRC });
      }
    }

    try {
      await assetLoader.loadAll(manifest);
      // STEP 6 디버그: 에셋 로드 상태 확인
      console.log('[Game] 에셋 로드 완료:');
      console.log('  - player:', assetLoader.isLoaded(this.player.spriteKey) ? '✓ 로드됨' : '✗ 실패');
      console.log('  - bg_FAR:', assetLoader.isLoaded('bg_FAR') ? '✓ 로드됨' : '✗ 실패');
      console.log('  - bg_MID:', assetLoader.isLoaded('bg_MID') ? '✓ 로드됨' : '✗ 실패');
      console.log('  - bg_NEAR:', assetLoader.isLoaded('bg_NEAR') ? '✓ 로드됨' : '✗ 실패');
    } catch (err) {
      console.warn('[Game] 일부 에셋 로드 중 오류 발생. 폴백 렌더링으로 진행합니다.', err);
    }

    // 2. 입력 액션 연결
    this.inputManager.on('jump', (source) => this.handleJump(source));
    this.inputManager.on('hook', () => this.handleHook());
    this.inputManager.on('pause', () => this.togglePause());

    // 3. 윈도우 및 뷰포트 반응형 리사이즈/회전 이벤트 연결 (STEP 6)
    window.addEventListener('resize', this._onResize);
    if (typeof window !== 'undefined' && window.visualViewport) {
      this._onVisualViewportResize = () => this._handleResize();
      window.visualViewport.addEventListener('resize', this._onVisualViewportResize);
    }
    this._onOrientationChange = () => {
      setTimeout(this._onResize, 150);
    };
    window.addEventListener('orientationchange', this._onOrientationChange);

    // 4. 브라우저 탭 전환 시 자동 일시정지 (물리 튐 및 불필요한 사망 방지)
    this._onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden && this.gameState.is(GameState.PLAYING)) {
        this.pauseGame();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }

    this.renderer.handleResize();

    return this;
  }

  /**
   * 시작 화면에서 게임 플레이 시작
   */
  startGame() {
    this.audioManager.unlockAudio();
    this.gameState.setState(GameState.PLAYING);
    this.audioManager.playBgm();
  }

  /**
   * 장착 상태(캐릭터 / 꾸미기 / 펫)를 게임 객체에 반영
   */
  applyEquipment() {
    const ch = this.characters.getSelected();
    this.player.setCharacter(CharacterManager.spriteKey(ch.ID), this.characters.getPlayerAssetConfig(ch.ID));
    this.effects.setCosmetics({ trail: this.shop.getEquipped('trail'), effect: this.shop.getEquipped('effect') });
    this.renderer.ropeStyle = this.shop.getEquipped('rope');
    this.pet.setPet(this.shop.getEquipped('pet'));
  }

  /**
   * 캐릭터 변경 (타이틀 화면에서 호출, 선택은 localStorage에 저장됨)
   * @param {string} id 캐릭터 ID
   */
  selectCharacter(id) {
    const ch = this.characters.select(id);
    if (!ch) return;
    this.player.setCharacter(CharacterManager.spriteKey(ch.ID), this.characters.getPlayerAssetConfig(ch.ID));
  }

  /**
   * 점프 / 시작 / 재시작 단축키 액션 처리 (STEP 6 입력 가드 및 디바운스)
   */
  handleJump(source) {
    // 설정/상점 창이 열려 있으면 스페이스/엔터가 게임 시작·재시작으로 새지 않게 막는다
    if (this.uiManager.isModalOpen()) return;
    if (this.gameState.is(GameState.PLAYING)) {
      // 갈고리에 매달려 있는 상태에서 점프를 누르면 갈고리 해제 및 관성 점프로 직관적 연계
      if (this.player.state === PlayerState.HOOKED) {
        this.effects.hookRelease(this.player.x + this.player.width / 2, this.player.y);
        this.hookSystem.releaseHook(this.player, this.audioManager);
      } else {
        this.player.jump();
      }
    } else if (this.gameState.is(GameState.READY)) {
      // 메인 화면의 빈 곳을 눌러서는 시작하지 않는다 ("게임 시작" 버튼 / 스페이스·엔터만)
      if (source === 'pointer') return;
      this.startGame();
    } else if (this.gameState.is(GameState.GAME_OVER)) {
      // 350ms 디바운스로 게임오버 순간 키 연타에 의한 의도치 않은 즉시 재시작 방지
      const elapsed = performance.now() - (this.gameOverTime || 0);
      if (elapsed >= 350) {
        this.restart();
      }
    }
  }

  /**
   * 갈고리 발사 / 해제 액션 처리 (Z / J / Shift / 우클릭 / 가상버튼, 연결 이펙트 연동)
   */
  handleHook() {
    if (this.gameState.is(GameState.PLAYING)) {
      if (this.powerUps.isBoosting) return;      // 부스트 중에는 갈고리가 필요 없음
      const res = this.hookSystem.triggerHook(this.player, this.audioManager);
      if (res === 'CONNECTED' && this.hookSystem.connectedAnchor) {
        const anchor = this.hookSystem.connectedAnchor;
        if (this.renderer) this.renderer.spawnSparks(anchor.x, anchor.y);
        this.effects.hookConnect(anchor.x, anchor.y);
      } else if (res === 'RELEASED') {
        this.effects.hookRelease(this.player.x + this.player.width / 2, this.player.y);
      }
    }
  }

  /**
   * 니어미스 이벤트 처리: 보너스 점수, 연출, 효과음
   * @param {object} ev NearMissSystem 이벤트
   */
  _handleNearMiss(ev) {
    if (!ev) return;
    this.scoreManager.addBonus(ev.bonus);
    this.effects.nearMissBurst(ev.kind, ev.x, ev.y, ev, ev.sparkX, ev.sparkY);
    this.audioManager.playSfx('NEAR_MISS', { combo: ev.combo, perfect: ev.kind === 'PERFECT' });
  }

  /** 파워업 획득 연출 */
  _handlePowerUpPickup(kind, x, y) {
    const t = POWERUP_TYPES[kind];
    this.effects.burst(x, y, [t.color, t.glow, '#ffffff'], 18, 0.9);
    this.effects.shockwave(x, y, t.glow, 46, 0.35);
    this.effects.popup(t.label.toUpperCase() + '!', x, y - 18, t.glow, 12, 1.0);
    this.audioManager.playSfx('POWERUP', { kind });
    if (kind === 'BOOST') {
      // 매달려 있었거나 낭떠러지 아래로 떨어지던 중이어도 바닥 위로 끌어올린다
      if (this.player.state === PlayerState.HOOKED) this.hookSystem.releaseHook(this.player, null);
      const floorY = this.config.WORLD.GROUND_Y;
      if (this.player.y + this.player.height > floorY) this.player.land(floorY);
      this.effects.shake(3, 0.25);
      this.effects.hitStop(0.05);
      this.audioManager.playSfx('BOOST_START');
    }
  }

  _handlePowerUpExpire(kind) {
    this.audioManager.playSfx(kind === 'BOOST' ? 'BOOST_END' : 'POWER_DOWN');
    if (kind === 'BOOST') {
      const p = this.player;
      this.effects.shockwave(p.x + p.width / 2, p.y + p.height / 2, '#ffd166', 50, 0.3);
    }
  }

  /**
   * 런 단위 연출/콤보 상태 초기화
   */
  _resetRunFx() {
    this.powerUps.reset();
    this.runSeconds = 0;
    this.effects.reset();
    this.nearMiss.reset();
    this._nextMilestone = this.config.EFFECTS?.MILESTONE_STEP || 0;
  }

  /**
   * 일시정지 토글 (P / Escape 키 또는 HUD 일시정지 버튼)
   */
  togglePause() {
    if (this.gameState.is(GameState.PLAYING)) {
      this.pauseGame();
    } else if (this.gameState.is(GameState.PAUSED)) {
      this.resumeGame();
    }
  }

  /**
   * 게임 일시정지 (조작 차단 연동)
   */
  pauseGame() {
    if (!this.gameState.is(GameState.PLAYING)) return;
    this.gameState.setState(GameState.PAUSED);
    this.shop.save();
    this.audioManager.pauseBgm();
    this.inputManager.setEnabled(false);
  }

  /**
   * 게임 재개 (조작 복원 연동)
   */
  resumeGame() {
    if (!this.gameState.is(GameState.PAUSED)) return;
    this.lastTime = performance.now();
    this.gameState.setState(GameState.PLAYING);
    this.audioManager.resumeBgm();
    this.inputManager.setEnabled(true);
  }

  /**
   * 게임 재시작 (시각 효과 초기화 및 조작 활성화)
   */
  restart() {
    this.currentSpeed = this.config.WORLD.BASE_SPEED;
    this.groundScrollOffset = 0;
    this.player.reset();
    this.coins.reset();
    this._coinChain = 0;
    this.terrainManager.reset();
    this.hookSystem.reset();
    this.obstacleSpawner.reset(this.currentSpeed);
    this.scoreManager.reset();
    this.renderer.resetEffects();
    this._resetRunFx();
    this.inputManager.setEnabled(true);
    this.lastTime = performance.now();
    this.gameState.setState(GameState.PLAYING);
    this.audioManager.playBgm();
  }

  /**
   * 타이틀(시작 화면)로 이동
   */
  goToTitle() {
    this.currentSpeed = this.config.WORLD.BASE_SPEED;
    this.groundScrollOffset = 0;
    this.player.reset();
    this.coins.reset();
    this._coinChain = 0;
    this.terrainManager.reset();
    this.hookSystem.reset();
    this.obstacleSpawner.reset(this.currentSpeed);
    this.scoreManager.reset();
    this.renderer.resetEffects();
    this._resetRunFx();
    this.inputManager.setEnabled(true);
    this.gameState.setState(GameState.READY);
    this.audioManager.stopBgm();
  }

  /**
   * 브라우저 리사이즈 대응
   */
  _handleResize() {
    this.renderer.handleResize();
  }

  /**
   * 게임 루프 시작
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
  }

  /**
   * 게임 루프 정지
   */
  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * delta time 기반 메인 루프
   * @param {DOMHighResTimeStamp} timestamp
   */
  _loop(timestamp) {
    if (!this.isRunning) return;

    // 초 단위 delta time 계산
    const rawDt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    // 탭 전환 등 긴 지연 시 물리 튀는 현상 방지
    const dt = Math.min(rawDt, this.config.LOOP.MAX_DELTA_TIME);

    // 히트스톱: 짧은 정지 연출 (물리/렌더 모두 dt=0)
    const frozen = this.effects.tickHitStop(dt);
    const stepDt = frozen ? 0 : dt;

    this.update(stepDt);
    this.render(stepDt);

    this.animationFrameId = requestAnimationFrame(this._loop.bind(this));
  }

  /**
   * 게임 물리, 지형, 갈고리, 장애물, 점수 및 충돌 업데이트
   * @param {number} dt 경과 시간 (seconds)
   */
  update(dt) {
    if (this.gameState.is(GameState.PLAYING)) {
      // 1. 시간에 따른 점진적 속도 상승 (최대 속도 제한)
      const accel = (this.config.DIFFICULTY && this.config.DIFFICULTY.SPEED_ACCELERATION) || 4.0;
      const maxSpeed = (this.config.DIFFICULTY && this.config.DIFFICULTY.MAX_SPEED) || 460;
      this.currentSpeed = Math.min(this.currentSpeed + accel * dt, maxSpeed);
      this.runSeconds += dt;

      // 1-1. 파워업 갱신 (획득/지속시간/아이템 스폰). 부스트 중에는 월드 속도가 빨라진다
      this.powerUps.update(dt, this.currentSpeed, {
        player: this.player,
        terrain: this.terrainManager,
        obstacles: this.obstacleSpawner.getObstacles(),
      });
      const speed = this.currentSpeed * this.powerUps.speedMul;
      this.player.currentSpeed = speed;

      // 2. 불연속 플랫폼 지형 이동 및 생성 (STEP 5)
      this.terrainManager.update(dt, speed);

      // 3. 갈고리 앵커 스크롤 및 진자 운동 물리 시뮬레이션 (STEP 5)
      this.hookSystem.update(dt, speed, this.player);

      // 4. 플레이어 물리 및 플랫폼 착지 업데이트 (STEP 5)
      this.player.update(dt, this.powerUps.isBoosting ? this._boostFloor : this.terrainManager.getPlatforms());

      // 4-1. 코인 이동/획득 (펫 자석 포함)
      this._coinChainTimer -= dt;
      if (this._coinChainTimer <= 0) this._coinChain = 0;
      const picked = this.coins.update(dt, speed, this.player, this.powerUps.getMagnet(this.player) || this.pet.getMagnet());
      for (const c of picked) {
        this.shop.addCoins(1);
        this.effects.coinPickup(c.x, c.y, this._coinChain);
        this.audioManager.playSfx('COIN', { chain: this._coinChain });
        this._coinChain++;
        this._coinChainTimer = 0.6;
      }

      // 5. 자동 달리기 바닥 스크롤 오프셋 누적
      this.groundScrollOffset += speed * dt;

      // 6. 낭떠러지 추락 사망 판정 (FALL_DEATH_Y 초과 시 GAME_OVER)
      const fallDeathY = this.config.TERRAIN?.FALL_DEATH_Y || 355;
      if (this.player.y > fallDeathY && !this.gameState.is(GameState.GAME_OVER)) {
        this.handleGameOver('FALL');
        return;
      }

      // 7. 장애물 생성 및 이동 (지형 안전 영역 연동)
      this.obstacleSpawner.update(dt, speed, this.terrainManager);

      // 8. 점수 및 생존 거리 누적
      this.scoreManager.update(dt, speed);

      // 9. 장애물과의 충돌 검사 (생존 상태일 때만 판정)
      if (this.player.state !== PlayerState.DEAD) {
        const hitObstacle = Collision.findPlayerObstacle(
          this.player,
          this.obstacleSpawner.getObstacles()
        );

        if (hitObstacle && !this._absorbHit(hitObstacle)) {
          this.handleGameOver('OBSTACLE');
        } else {
          // 10. 니어미스 판정 (장애물 아슬아슬 통과). 부스트 중에는 콤보 타이머만 흘려보낸다
          const events = this.nearMiss.update(
            dt, this.player, this.powerUps.isBoosting ? [] : this.obstacleSpawner.getObstacles()
          );
          for (const ev of events) this._handleNearMiss(ev);

          // 11. 점수 마일스톤 연출
          const step = this.config.EFFECTS?.MILESTONE_STEP || 0;
          if (step > 0 && this.scoreManager.currentScore >= this._nextMilestone) {
            this.effects.milestone(this._nextMilestone);
            this._nextMilestone += step;
          }
        }
      }
    }

    // 펫은 모든 화면 상태에서 플레이어를 따라다님
    this.pet.update(dt, this.player);

    // 실시간 HUD 수치 업데이트
    this.uiManager.updateHUD(
      this.scoreManager.currentScore,
      this.scoreManager.bestScore,
      this.currentSpeed * this.powerUps.speedMul
    );
    this.uiManager.updateCoins(this.coins.runCollected, this.shop.coins);
  }

  /**
   * 장애물 충돌을 파워업이 막아주는지 처리.
   * 부스트: 장애물을 박살내며 통과 / 무적 직후: 그냥 통과 / 방어막: 1회 방어 후 장애물 파괴
   * @returns {boolean} true 면 죽지 않음
   */
  _absorbHit(obstacle) {
    const pu = this.powerUps;
    const cx = obstacle.x + obstacle.width / 2;
    const cy = obstacle.y + obstacle.height / 2;
    if (pu.isBoosting) {
      this.obstacleSpawner.remove(obstacle);
      pu.stats.smashes++;
      this.scoreManager.addBonus(20);
      this.effects.burst(cx, cy, ['#ffd166', '#ff9f43', '#ffffff', '#2a1636'], 18, 1.1);
      this.effects.popup('SMASH +20', cx, cy - 12, '#ffd166', 10, 0.7);
      this.effects.shake(2, 0.12);
      this.audioManager.playSfx('SMASH');
      return true;
    }
    if (pu.grace > 0) return true;
    if (pu.consumeShield()) {
      this.obstacleSpawner.remove(obstacle);
      this.effects.burst(cx, cy, ['#4cc9f0', '#a5e8ff', '#ffffff'], 26, 1.2);
      this.effects.shockwave(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#a5e8ff', 70, 0.4);
      this.effects.popup('BLOCKED!', cx, cy - 14, '#a5e8ff', 12, 0.9);
      this.effects.shake(4, 0.2);
      this.effects.hitStop(0.06);
      this.audioManager.playSfx('SHIELD_BREAK');
      return true;
    }
    return false;
  }

  /**
   * 충돌 또는 낭떠러지 추락 시 게임 오버 처리 (STEP 6 시각 피드백 및 디바운스 타이머)
   * @param {'OBSTACLE' | 'FALL'} cause 사망 원인
   */
  handleGameOver(cause = 'OBSTACLE') {
    if (this.gameState.is(GameState.GAME_OVER)) {
      return;
    }

    this.gameOverTime = performance.now();

    // 점수 확정/원인/통계는 UI 전환(리스너 동기 실행) 전에 반영해야 최고기록·신기록이 올바르게 표시됨
    this.scoreManager.finalizeScore();
    this.uiManager.setGameOverCause(cause);
    this.uiManager.setRunStats({
      nearMisses: this.nearMiss.totalCount,
      maxCombo: this.nearMiss.maxCombo,
      coins: this.coins.runCollected,
      bonus: this.scoreManager.bonus,
      distanceScore: Math.max(0, this.scoreManager.currentScore - this.scoreManager.bonus),
      seconds: this.runSeconds,
      powerUps: this.powerUps.stats.pickups,
      shieldSaves: this.powerUps.stats.shieldSaves,
      smashes: this.powerUps.stats.smashes,
    });
    this.shop.save(); // 이번 판에서 모은 코인 저장
    this.profile.recordRun({ nearMisses: this.nearMiss.totalCount, coins: this.coins.runCollected });
    this.cloud.onRunFinished();   // 최고 점수/코인 즉시 서버 저장

    this.gameState.setState(GameState.GAME_OVER);
    this.player.die();

    // 갈고리 연결 해제
    this.hookSystem.state = 'IDLE';
    this.hookSystem.connectedAnchor = null;

    // 시각 피드백: 장애물 충돌 시 화면 흔들림+붉은 섬광, 추락 시 암전 비네트
    if (this.renderer) {
      if (cause === 'OBSTACLE') {
        this.renderer.triggerHitEffect();
      } else if (cause === 'FALL') {
        this.renderer.triggerFallEffect();
      }
    }
    if (cause === 'OBSTACLE') {
      this.effects.deathBurst(
        this.player.x + this.player.width / 2,
        this.player.y + this.player.height / 2
      );
    }
    this.effects.setCombo(0, 0);

    // 오디오 처리: BGM 정지, 타격/추락 효과음 및 게임 오버 징글 재생
    this.audioManager.stopBgm();
    this.audioManager.playSfx('HIT');

    setTimeout(() => {
      if (this.gameState.is(GameState.GAME_OVER)) {
        this.audioManager.playSfx('GAME_OVER');
      }
    }, 150);
  }

  /**
   * 프레임 렌더링 (STEP 5 & 6 포스트 효과)
   * @param {number} dt
   */
  render(dt = 0.016) {
    // 1. 화면 초기화 및 화면 흔들림 변환 적용
    this.renderer.clear();

    // 2. 패럴랙스 배경 렌더링
    const bgSpeed = this.gameState.is(GameState.PLAYING) ? this.currentSpeed * this.powerUps.speedMul : 40;
    this.renderer.drawBackground(bgSpeed, dt);

    // 3. 불연속 플랫폼 지형 렌더링 (낭떠러지 구간은 바닥이 뚫려 심연이 노출됨)
    this.renderer.drawPlatforms(this.terrainManager.getPlatforms());

    // 4. 갈고리 앵커 렌더링 (사거리 내 조준 링 및 연결 이펙트)
    this.renderer.drawHookAnchors(
      this.hookSystem.anchors,
      this.hookSystem.activeAnchor,
      this.hookSystem.connectedAnchor,
      this.player
    );

    // 5. 로프 렌더링 (연결 시 빛나는 강철 와이어 라인)
    this.renderer.drawRope(this.player, this.hookSystem.connectedAnchor);

    // 5-1. 이펙트 갱신 및 속도선(캐릭터 뒤)
    this.effects.update(dt, {
      player: this.player,
      speed: this.currentSpeed * this.powerUps.speedMul,
      playing: this.gameState.is(GameState.PLAYING),
    });
    if (this.gameState.is(GameState.PLAYING)) {
      this.effects.setCombo(this.nearMiss.combo, this.nearMiss.timeLeft);
    }
    this.effects.drawBehind(this.renderer.ctx);

    // 5-2. 코인 (타이틀 화면에서는 숨김)
    if (!this.gameState.is(GameState.READY)) this.coins.render(this.renderer.ctx);

    // 6. 장애물 에셋 렌더링
    this.obstacleSpawner.render(this.renderer.ctx);
    this.obstacleSpawner.renderWarnings(this.renderer.ctx);
    if (!this.gameState.is(GameState.READY)) this.powerUps.renderItems(this.renderer.ctx);

    // 6-1. 펫 (플레이어 뒤)
    const onTitle = this.gameState.is(GameState.READY);   // 홈 화면에서는 캐릭터/펫을 그리지 않는다
    if (!onTitle) this.pet.render(this.renderer.ctx);

    // 7. 플레이어 스프라이트 렌더링 (공중제비 회전 지원)
    const rctx = this.renderer.ctx;
    if (!onTitle) {
      this.powerUps.renderBehindPlayer(rctx, this.player);
      rctx.save();
      rctx.globalAlpha = this.powerUps.playerAlpha();
      this.player.render(rctx);
      rctx.restore();
      this.powerUps.renderFrontOfPlayer(rctx, this.player);
    }

    // 7-1. 파티클/링/팝업/콤보 HUD
    this.effects.drawFront(this.renderer.ctx);
    if (this.gameState.is(GameState.PLAYING)) this.powerUps.renderHUD(this.renderer.ctx);

    // 8. 포스트 렌더링 효과 (파티클, 화면 흔들림 복원, 피격 섬광, 추락 암전)
    this.renderer.renderPostEffects(dt);
  }

  /**
   * 자원 해제 (STEP 6 누수 방지 리스너 일괄 정리)
   */
  destroy() {
    this.stop();

    // 창 리사이즈/회전 이벤트 정리
    window.removeEventListener('resize', this._onResize);
    if (typeof window !== 'undefined' && window.visualViewport && this._onVisualViewportResize) {
      window.visualViewport.removeEventListener('resize', this._onVisualViewportResize);
    }
    if (this._onOrientationChange) {
      window.removeEventListener('orientationchange', this._onOrientationChange);
    }
    if (this._onVisibilityChange && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
    }

    // 입력/오디오/UI 리소스 정리
    if (this.inputManager) {
      this.inputManager.destroy();
    }
    if (this.audioManager) {
      this.audioManager.destroy();
    }
    if (this.uiManager) {
      this.uiManager.destroy();
    }

    // 게임 시스템 리소스 초기화
    this.player = null;
    this.terrainManager = null;
    this.hookSystem = null;
    this.obstacleSpawner = null;
    this.renderer = null;
    this.scoreManager = null;
    this.gameState = null;
  }
}
