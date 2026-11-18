import { Platform } from './Platform.js';

/**
 * 지형 및 낭떠러지 생성 관리자 (TerrainManager)
 * 불연속 지면(Platform)과 낭떠러지(Gap)의 무한 생성, 화면 스크롤,
 * 오프스크린 정리 및 장애물 스폰 안전 영역 검증을 총괄합니다.
 */
export class TerrainManager {
  /**
   * @param {Object} config 전역 게임 설정 (GAME_CONFIG)
   */
  constructor(config) {
    this.config = config;
    this.terrainConfig = config.TERRAIN || {};
    this.groundY = config.WORLD.GROUND_Y;
    this.logicalWidth = config.CANVAS.LOGICAL_WIDTH;
    this.logicalHeight = config.CANVAS.LOGICAL_HEIGHT;
    this.platformHeight = this.logicalHeight - this.groundY;

    this.initialPlatformWidth = this.terrainConfig.INITIAL_PLATFORM_WIDTH || 850;
    this.minPlatformWidth = this.terrainConfig.MIN_PLATFORM_WIDTH || 360;
    this.maxPlatformWidth = this.terrainConfig.MAX_PLATFORM_WIDTH || 680;
    this.minGapWidth = this.terrainConfig.MIN_GAP_WIDTH || 120;
    this.maxGapWidth = this.terrainConfig.MAX_GAP_WIDTH || 290;
    this.safeLandingMargin = this.terrainConfig.SAFE_LANDING_MARGIN || 130;
    this.safeTakeoffMargin = this.terrainConfig.SAFE_TAKEOFF_MARGIN || 110;
    this.safeEdgeMargin = this.terrainConfig.SAFE_EDGE_MARGIN || 80;

    /** @type {Function|null} 낭떠러지 생성 시 호출되는 훅 */
    this.onGapCreated = null;
    /** @type {Function|null} 새 플랫폼 생성 시 호출되는 훅 (코인 배치 등) */
    this.onPlatformCreated = null;

    /** @type {Platform[]} */
    this.platforms = [];
    this.idCounter = 0;
    this.spawnCount = 0;

    this.reset();
  }

  /**
   * 지형 초기화 (게임 시작 및 재시작 시 안전한 시작 플랫폼 구성)
   */
  reset() {
    this.platforms = [];
    this.idCounter = 0;
    this.spawnCount = 0;

    // 시작 지점: 플레이어가 안전하게 시작할 수 있는 넉넉한 초기 지면 배치
    const startPlatform = new Platform(
      0,
      this.groundY,
      this.initialPlatformWidth,
      this.platformHeight,
      ++this.idCounter
    );
    this.platforms.push(startPlatform);

    // 화면 우측 바깥까지 여유 플랫폼 사전 생성
    this._fillAhead();
  }

  /**
   * 화면 전방 여유 공간 채우기
   */
  _fillAhead() {
    const bufferDistance = this.logicalWidth + 600;
    while (this.getRightmostEdge() < bufferDistance) {
      this._generateNextPlatform();
    }
  }

  /**
   * 가장 우측 플랫폼의 끝 X 좌표 반환
   * @returns {number}
   */
  getRightmostEdge() {
    if (this.platforms.length === 0) return 0;
    const last = this.platforms[this.platforms.length - 1];
    return last.x + last.width;
  }

  /**
   * 다음 낭떠러지(Gap) 및 플랫폼 생성
   */
  _generateNextPlatform() {
    const lastEdge = this.getRightmostEdge();
    this.spawnCount++;

    // 낭떠러지 간격 결정:
    // 초반 2~3회는 일반 점프로 넘을 수 있는 작은 낭떠러지(130~160px),
    // 이후에는 갈고리 액션이 필요한 중대형 낭떠러지(220~300px)를 조화롭게 교차 배치
    let gapWidth;
    if (this.spawnCount <= 2) {
      gapWidth = this.minGapWidth + Math.random() * 30; // 130 ~ 160px (일반 점프 가능)
    } else {
      const isHookChasm = Math.random() < 0.55;
      if (isHookChasm) {
        // 갈고리 액션이 요구되는 깊고 넓은 낭떠러지
        gapWidth = 230 + Math.random() * (this.maxGapWidth - 230); // 230 ~ 320px
      } else {
        // 타이밍 점프로 넘을 수 있는 일반 낭떠러지
        gapWidth = this.minGapWidth + Math.random() * 40; // 130 ~ 170px
      }
    }

    const nextX = lastEdge + Math.floor(gapWidth);
    const nextWidth = Math.floor(
      this.minPlatformWidth + Math.random() * (this.maxPlatformWidth - this.minPlatformWidth)
    );

    const platform = new Platform(
      nextX,
      this.groundY,
      nextWidth,
      this.platformHeight,
      ++this.idCounter
    );

    this.platforms.push(platform);

    // 낭떠러지 생성 이벤트 방출 (갈고리 앵커 배치 연동)
    if (typeof this.onGapCreated === 'function') {
      this.onGapCreated({
        startX: lastEdge,
        endX: nextX,
        width: gapWidth,
        midX: lastEdge + gapWidth * 0.45,
        isChasm: gapWidth >= 170,
      });
    }

    if (typeof this.onPlatformCreated === 'function') {
      this.onPlatformCreated(platform);
    }
  }

  /**
   * 지형 스크롤 및 생성/정리 업데이트
   * @param {number} dt 경과 시간 (seconds)
   * @param {number} currentSpeed 스크롤 속도 (px/s)
   */
  update(dt, currentSpeed) {
    // 1. 모든 플랫폼 좌측 이동
    for (const platform of this.platforms) {
      platform.update(dt, currentSpeed);
    }

    // 2. 화면 밖으로 벗어난 플랫폼 제거
    this.platforms = this.platforms.filter((p) => !p.isOffScreen());

    // 3. 전방 플랫폼 자동 생성
    this._fillAhead();
  }

  /**
   * 특정 X 좌표 아래에 지면(플랫폼)이 존재하는지 확인
   * @param {number} x 플레이어 중심 X 좌표
   * @param {number} width 플레이어 가로 폭
   * @returns {Platform|null}
   */
  getPlatformUnder(x, width = 36) {
    const footLeft = x + 6;
    const footRight = x + width - 6;

    for (const platform of this.platforms) {
      if (footRight >= platform.x && footLeft <= platform.x + platform.width) {
        return platform;
      }
    }
    return null;
  }

  /**
   * 장애물 스폰 시 해당 좌표가 플랫폼 위 안전한 영역인지 판정
   * (낭떠러지 착지/도약 안전 마진 확보 및 짧은 플랫폼 보호)
   * @param {number} spawnX 장애물 생성 예정 X 좌표
   * @param {number} obstacleWidth 장애물 너비
   * @returns {{ safe: boolean, groundY: number }}
   */
  isSafeForObstacle(spawnX, obstacleWidth = 32) {
    const landingMargin = this.safeLandingMargin;
    const takeoffMargin = this.safeTakeoffMargin;

    for (const platform of this.platforms) {
      const platformStart = platform.x;
      const platformEnd = platform.x + platform.width;

      // 플랫폼 길이가 너무 짧으면 장애물 스폰 제외 (안전 발판 보장)
      if (platform.width < landingMargin + takeoffMargin + 60) {
        continue;
      }

      // 착지 여유 구역(landingMargin)과 도약 준비 구역(takeoffMargin) 사이인지 확인
      if (
        spawnX >= platformStart + landingMargin &&
        (spawnX + obstacleWidth) <= platformEnd - takeoffMargin
      ) {
        return { safe: true, groundY: platform.y };
      }
    }

    return { safe: false, groundY: this.groundY };
  }

  /**
   * 활성 플랫폼 목록 반환
   * @returns {Platform[]}
   */
  getPlatforms() {
    return this.platforms;
  }
}
