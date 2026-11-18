import { Obstacle } from './Obstacle.js';

/**
 * 장애물 생성 및 수명 주기 관리자
 */
export class ObstacleSpawner {
  /**
   * @param {Object} config 전역 게임 설정 (GAME_CONFIG)
   * @param {number} groundY 바닥 상단 Y 좌표
   * @param {number} logicalWidth 캔버스 논리 가로폭
   * @param {Object|null} assetConfig 장애물 에셋 설정 (ASSETS_CONFIG.OBSTACLES)
   */
  constructor(config, groundY, logicalWidth, assetConfig = null) {
    this.config = config;
    this.groundY = groundY;
    this.logicalWidth = logicalWidth;
    this.assetConfig = assetConfig;

    this.types = config.OBSTACLES.TYPES;
    this.minGapDistance = config.OBSTACLES.MIN_GAP_DISTANCE || 320;
    this.maxGapDistance = config.OBSTACLES.MAX_GAP_DISTANCE || 520;

    /** @type {Obstacle[]} */
    this.obstacles = [];

    /** @type {Function|null} 장애물 생성 시 호출되는 훅 (코인 배치 조정 등) */
    this.onSpawn = null;
    /** @type {Function|null} 경고가 시작될 때 호출 (경고음 등) */
    this.onWarn = null;
    /** @type {Array<{type:Object,left:number,total:number,retry:number}>} 곧 나타날 장애물 경고 */
    this.warnings = [];
    this.time = 0;

    this.spawnTimer = 0;
    this.currentInterval = 0;

    // 첫 스폰 예약 (초기 게임 시작 후 약 1.5초~2.0초 여유 부여)
    this._scheduleInitialSpawn(config.WORLD.BASE_SPEED);
  }

  /**
   * 초기 시작 시 첫 장애물 스폰 예약
   * @param {number} speed
   */
  _scheduleInitialSpawn(speed) {
    this.spawnTimer = 0;
    this.currentInterval = 1.6;
  }

  /**
   * 다음 장애물 스폰 시점 예약
   * @param {number} currentSpeed 현재 게임 속도 (px/s)
   */
  scheduleNextSpawn(currentSpeed) {
    const randomDistance = this.minGapDistance + Math.random() * (this.maxGapDistance - this.minGapDistance);
    this.currentInterval = randomDistance / currentSpeed;
  }

  /**
   * 현재 속도에서 나올 수 있는 종류 중 가중치 랜덤으로 하나 선택
   * @param {number} speed
   */
  _pickType(speed) {
    const pool = this.types.filter((t) => !t.minSpeed || speed >= t.minSpeed);
    let total = 0;
    for (const t of pool) total += t.weight ?? 1;
    let r = Math.random() * total;
    for (const t of pool) {
      r -= t.weight ?? 1;
      if (r < 0) return t;
    }
    return pool[0];
  }

  /**
   * 장애물 생성 (경고가 필요한 종류는 먼저 경고를 띄우고 잠시 뒤에 나타난다)
   * @param {Object|null} terrainManager
   * @param {number} speed 현재 게임 속도
   */
  spawn(terrainManager = null, speed = 250) {
    if (!this.types || this.types.length === 0) return;
    const selectedType = this._pickType(speed);
    // 경고형은 "경고 시간 뒤에 나타날 자리"가 안전한지를 지금 미리 확인한다 (경고만 뜨고 안 나오는 일 방지)
    const lead = selectedType.warn ? speed * (this.config.OBSTACLES.WARNING_TIME || 0.9) : 0;
    if (!this._isSpawnSafe(terrainManager, selectedType, lead)) {
      // 낭떠러지 또는 지면 끝자락에 위치할 경우 스폰을 0.25초 연기하여 안전 플랫폼 대기
      this.spawnTimer = Math.max(0, this.currentInterval - 0.25);
      return;
    }
    if (selectedType.warn) {
      // 경고 표시 중에도 지형이 흘러가므로, 실제 등장 시점에 다시 안전 검사를 한다
      const wt = this.config.OBSTACLES.WARNING_TIME || 0.9;
      this.warnings.push({ type: selectedType, left: wt, total: wt, retry: 0 });
      if (typeof this.onWarn === 'function') this.onWarn(selectedType);
      return;
    }
    this._create(selectedType);
  }

  _isSpawnSafe(terrainManager, type, lead = 0) {
    if (!terrainManager || typeof terrainManager.isSafeForObstacle !== 'function') return true;
    // 화면 우측 바깥(여유 20px)에 장애물 배치 예정 (lead: 지형이 그만큼 더 흘러간 뒤의 위치를 미리 검사)
    return terrainManager.isSafeForObstacle(this.logicalWidth + 20 + lead, type.width).safe;
  }

  _create(selectedType) {
    const spawnX = this.logicalWidth + 20;
    const obstacleAssetConfig = this.assetConfig ? this.assetConfig[selectedType.id] : null;
    const obstacle = new Obstacle(selectedType, this.groundY, spawnX, obstacleAssetConfig);
    this.obstacles.push(obstacle);
    if (typeof this.onSpawn === 'function') this.onSpawn(obstacle);
  }

  /** 경고 중인 장애물 높이 (화면 오른쪽 가장자리 "!" 표시 위치) */
  _warnY(type) {
    return this.groundY - (type.flyY != null ? type.flyY - type.height / 2 : type.height / 2);
  }

  /**
   * 장애물 목록 이동 및 스폰 주기 업데이트
   * @param {number} dt 경과 시간 (seconds)
   * @param {number} currentSpeed 현재 게임 이동 속도 (px/s)
   * @param {Object|null} terrainManager
   */
  update(dt, currentSpeed, terrainManager = null) {
    // 1. 스폰 타이머 업데이트
    this.time += dt;
    // 경고 카운트다운 → 끝나면 실제 장애물 생성 (자리가 안전하지 않으면 잠깐 더 기다렸다가 포기)
    for (const w of this.warnings) {
      w.left -= dt;
      if (w.left <= 0) {
        if (this._isSpawnSafe(terrainManager, w.type)) { this._create(w.type); w.done = true; }
        else { w.retry += dt; w.left = 0; if (w.retry > 0.4) w.done = true; }
      }
    }
    this.warnings = this.warnings.filter((w) => !w.done);

    this.spawnTimer += dt;
    if (this.spawnTimer >= this.currentInterval) {
      this.spawn(terrainManager, currentSpeed);
      this.spawnTimer = 0;
      this.scheduleNextSpawn(currentSpeed);
    }

    // 2. 각 장애물 이동 및 화면 밖 제거
    const remaining = [];
    for (const obstacle of this.obstacles) {
      obstacle.update(dt, currentSpeed);
      if (!obstacle.isOffScreen()) {
        remaining.push(obstacle);
      }
    }
    this.obstacles = remaining;
  }

  /**
   * 화면 오른쪽 가장자리에 깜빡이는 경고(!) 표시
   * @param {CanvasRenderingContext2D} ctx
   */
  renderWarnings(ctx) {
    if (!this.warnings.length) return;
    ctx.save();
    for (const w of this.warnings) {
      const k = 1 - Math.max(0, w.left) / w.total;       // 0 → 1 로 임박
      const on = Math.sin(this.time * (14 + 14 * k)) > -0.2;
      if (!on) continue;
      const cx = this.logicalWidth - 20;
      const cy = Math.round(this._warnY(w.type));
      // 날아오는 방향 줄무늬
      const g = ctx.createLinearGradient(cx - 70, 0, cx + 10, 0);
      g.addColorStop(0, 'rgba(255, 45, 85, 0)');
      g.addColorStop(1, `rgba(255, 45, 85, ${0.25 + 0.3 * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - 70, cy - 3, 80, 6);
      // 경고 삼각형
      ctx.fillStyle = '#ff2d55';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 15);
      ctx.lineTo(cx + 15, cy + 11);
      ctx.lineTo(cx - 15, cy + 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff1f3';
      ctx.fillRect(cx - 1, cy - 6, 3, 10);
      ctx.fillRect(cx - 1, cy + 6, 3, 3);
    }
    ctx.restore();
  }

  /**
   * 모든 활성 장애물 렌더링
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    for (const obstacle of this.obstacles) {
      obstacle.render(ctx);
    }
  }

  /**
   * 리셋 (재시작 시 잔여 장애물 및 타이머 초기화)
   * @param {number} initialSpeed 초기 속도
   */
  reset(initialSpeed) {
    this.obstacles = [];
    this.warnings = [];
    this.spawnTimer = 0;
    this._scheduleInitialSpawn(initialSpeed || this.config.WORLD.BASE_SPEED);
  }

  /** 장애물 하나를 제거 (방어막/부스트로 박살낼 때) */
  remove(obstacle) {
    this.obstacles = this.obstacles.filter((o) => o !== obstacle);
  }

  /**
   * 현재 활성 장애물 목록 반환
   * @returns {Obstacle[]}
   */
  getObstacles() {
    return this.obstacles;
  }
}
