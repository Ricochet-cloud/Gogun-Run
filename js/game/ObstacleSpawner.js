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
   * 장애물 생성
   * @param {Object|null} terrainManager
   */
  spawn(terrainManager = null) {
    if (!this.types || this.types.length === 0) return;

    // 무작위 종류 선택
    const randomIndex = Math.floor(Math.random() * this.types.length);
    const selectedType = this.types[randomIndex];

    // 화면 우측 바깥(여유 20px)에 장애물 배치 예정 X
    const spawnX = this.logicalWidth + 20;

    // 지형 시스템이 제공된 경우 낭떠러지 위 스폰 금지 및 안전 여유 공간 검사
    if (terrainManager && typeof terrainManager.isSafeForObstacle === 'function') {
      const check = terrainManager.isSafeForObstacle(spawnX, selectedType.width);
      if (!check.safe) {
        // 낭떠러지 또는 지면 끝자락에 위치할 경우 스폰을 0.25초 연기하여 안전 플랫폼 대기
        this.spawnTimer = Math.max(0, this.currentInterval - 0.25);
        return;
      }
    }

    // 해당 타입의 에셋 설정 매핑
    const obstacleAssetConfig = this.assetConfig ? this.assetConfig[selectedType.id] : null;

    const obstacle = new Obstacle(selectedType, this.groundY, spawnX, obstacleAssetConfig);
    this.obstacles.push(obstacle);
  }

  /**
   * 장애물 목록 이동 및 스폰 주기 업데이트
   * @param {number} dt 경과 시간 (seconds)
   * @param {number} currentSpeed 현재 게임 이동 속도 (px/s)
   * @param {Object|null} terrainManager
   */
  update(dt, currentSpeed, terrainManager = null) {
    // 1. 스폰 타이머 업데이트
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.currentInterval) {
      this.spawn(terrainManager);
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
    this.spawnTimer = 0;
    this._scheduleInitialSpawn(initialSpeed || this.config.WORLD.BASE_SPEED);
  }

  /**
   * 현재 활성 장애물 목록 반환
   * @returns {Obstacle[]}
   */
  getObstacles() {
    return this.obstacles;
  }
}
