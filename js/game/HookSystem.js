import { Physics } from './Physics.js';

/**
 * 갈고리(와이어) 액션 및 로프 물리 시스템 (HookSystem)
 * 공중 앵커 생성 및 탐색, 갈고리 발사/연결, 진자 운동 물리 시뮬레이션,
 * 해제 시 관성 비행 벡터 전달을 처리합니다.
 */
export class HookSystem {
  /**
   * @param {Object} config 전역 게임 설정 (GAME_CONFIG)
   */
  constructor(config) {
    this.config = config;
    this.hookConfig = config.HOOK || {};
    this.logicalWidth = config.CANVAS.LOGICAL_WIDTH;
    this.logicalHeight = config.CANVAS.LOGICAL_HEIGHT;

    this.maxRange = this.hookConfig.MAX_RANGE || 230;
    this.anchorSpacingMin = this.hookConfig.ANCHOR_SPACING_MIN || 220;
    this.anchorSpacingMax = this.hookConfig.ANCHOR_SPACING_MAX || 340;
    this.anchorYMin = this.hookConfig.ANCHOR_Y_MIN || 65;
    this.anchorYMax = this.hookConfig.ANCHOR_Y_MAX || 95;

    this.gravity = this.hookConfig.PENDULUM_GRAVITY || 2000;
    this.damping = this.hookConfig.DAMPING || 0.12;
    this.releaseBoostX = this.hookConfig.RELEASE_BOOST_X || 1.25;
    this.releaseBoostY = this.hookConfig.RELEASE_BOOST_Y || 1.20;

    /** @type {Array<{ id: number, x: number, y: number }>} */
    this.anchors = [];
    this.anchorIdCounter = 0;

    // 갈고리 상태: 'IDLE' | 'HOOKED'
    this.state = 'IDLE';

    /** @type {Object|null} 현재 연결된 앵커 */
    this.connectedAnchor = null;

    /** @type {Object|null} 현재 플레이어 사거리 내 활성 앵커 */
    this.activeAnchor = null;

    // 진자 운동 파라미터
    this.ropeLength = 0;
    this.theta = 0;   // 라디안 (0: 수직 아래, 음수: 앵커 뒤쪽, 양수: 앵커 앞쪽)
    this.omega = 0;   // 각속도 (rad/s)

    this.reset();
  }

  /**
   * 시스템 초기화 (시작/재시작)
   */
  reset() {
    this.state = 'IDLE';
    this.connectedAnchor = null;
    this.activeAnchor = null;
    this.ropeLength = 0;
    this.theta = 0;
    this.omega = 0;

    this.anchors = [];
    this.anchorIdCounter = 0;

    // 초기 앵커 시퀀스 생성 (화면 상단에 일정 간격으로 사전 배치)
    let curX = 260;
    while (curX < this.logicalWidth + 600) {
      this._createAnchor(curX);
      curX += this._randomSpacing();
    }
  }

  /**
   * 랜덤 앵커 간격 산출
   * @returns {number}
   */
  _randomSpacing() {
    return Math.floor(
      this.anchorSpacingMin + Math.random() * (this.anchorSpacingMax - this.anchorSpacingMin)
    );
  }

  /**
   * 앵커 단일 생성
   * @param {number} x
   */
  _createAnchor(x) {
    const y = Math.floor(this.anchorYMin + Math.random() * (this.anchorYMax - this.anchorYMin));
    this.anchors.push({
      id: ++this.anchorIdCounter,
      x,
      y,
    });
  }

  /**
   * 낭떠러지(Chasm) 상단에 앵커가 없으면 플레이어가 건널 수 있도록 보장 생성 (STEP 6)
   * 불가능한 점프 구간을 원천 방지합니다.
   * @param {number} gapMidX 낭떠러지 중심 x 좌표
   */
  ensureAnchorOverGap(gapMidX) {
    const hasNearbyAnchor = this.anchors.some((a) => Math.abs(a.x - gapMidX) < 85);
    if (!hasNearbyAnchor) {
      const y = Math.floor(this.anchorYMin + Math.random() * (this.anchorYMax - this.anchorYMin));
      this.anchors.push({
        id: ++this.anchorIdCounter,
        x: Math.round(gapMidX),
        y,
      });
      this.anchors.sort((a, b) => a.x - b.x);
    }
  }

  /**
   * 전방 앵커 자동 생성 및 스크롤 업데이트
   * @param {number} dt 경과 시간 (seconds)
   * @param {number} currentSpeed 월드 이동 속도 (px/s)
   * @param {Object} player 플레이어 인스턴스
   */
  update(dt, currentSpeed, player) {
    // 1. 앵커 스크롤 이동
    for (const anchor of this.anchors) {
      anchor.x -= currentSpeed * dt;
    }

    // 2. 화면 밖 앵커 제거
    this.anchors = this.anchors.filter((a) => a.x > -100);

    // 3. 화면 우측 전방 앵커 보충
    let rightmostX = this.anchors.length > 0 ? this.anchors[this.anchors.length - 1].x : 0;
    while (rightmostX < this.logicalWidth + 600) {
      rightmostX += this._randomSpacing();
      this._createAnchor(rightmostX);
    }

    // 4. 연결 상태 물리 처리 또는 유효 타겟 탐색
    if (this.state === 'HOOKED' && this.connectedAnchor) {
      this._updatePendulumPhysics(dt, currentSpeed, player);
    } else {
      this._findActiveAnchor(player);
    }
  }

  /**
   * 플레이어가 연결 가능한 최적의 전방 앵커 탐색
   * @param {Object} player
   */
  _findActiveAnchor(player) {
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;

    let bestAnchor = null;
    let minDistance = Infinity;

    for (const anchor of this.anchors) {
      // 앵커는 플레이어보다 위쪽에 있어야 함
      if (anchor.y >= py - 20) continue;

      // 앵커는 플레이어보다 뒤쪽으로 너무 멀어지지 않고(여유 -30px), 앞쪽 200px 이내
      const dx = anchor.x - px;
      if (dx < -40 || dx > 200) continue;

      const dy = anchor.y - py;
      const dist = Math.hypot(dx, dy);

      if (dist <= this.maxRange && dist < minDistance) {
        minDistance = dist;
        bestAnchor = anchor;
      }
    }

    this.activeAnchor = bestAnchor;
  }

  /**
   * 진자 운동 시뮬레이션
   * @param {number} dt 경과 시간
   * @param {number} currentSpeed 월드 속도
   * @param {Object} player
   */
  _updatePendulumPhysics(dt, currentSpeed, player) {
    const anchor = this.connectedAnchor;

    // 진자 각도 및 각속도 스텝 계산 (Physics 모듈 활용)
    const step = Physics.stepPendulum(
      this.theta,
      this.omega,
      this.ropeLength,
      dt,
      this.gravity,
      this.damping
    );

    this.theta = step.theta;
    this.omega = step.omega;

    // 각도 범위 제한 (너무 위로 완전히 360도 거꾸로 올라가지 않도록 제한: -75도 ~ +75도)
    const maxAngle = (75 * Math.PI) / 180;
    if (this.theta > maxAngle) {
      this.theta = maxAngle;
      if (this.omega > 0) this.omega = 0;
    } else if (this.theta < -maxAngle) {
      this.theta = -maxAngle;
      if (this.omega < 0) this.omega = 0;
    }

    // 로프 제약 조건에 따른 플레이어 중심 좌표 계산
    const playerCenterX = anchor.x + this.ropeLength * Math.sin(this.theta);
    const playerCenterY = anchor.y + this.ropeLength * Math.cos(this.theta);

    player.x = playerCenterX - player.width / 2;
    player.y = playerCenterY - player.height / 2;

    // 현재 프레임의 실제 접선 속도 벡터 계산 (해제 시 관성 전달용)
    const vt = this.ropeLength * this.omega;
    const instantVx = vt * Math.cos(this.theta);
    const instantVy = -vt * Math.sin(this.theta);

    player.vy = instantVy;

    // 시각적 회전 각도를 로프 각도에 동기화
    player.rotationAngle = this.theta;
  }

  /**
   * 갈고리 키 입력 처리 (발사 또는 연결 해제)
   * @param {Object} player
   * @param {Object} audioManager
   * @returns {'CONNECTED' | 'RELEASED' | 'MISSED'}
   */
  triggerHook(player, audioManager = null) {
    // 1. 이미 연결된 상태라면 -> 즉시 해제 및 관성 점프
    if (this.state === 'HOOKED') {
      this.releaseHook(player, audioManager);
      return 'RELEASED';
    }

    // 2. 비연결 상태라면 -> 사거리 내 유효 앵커에 발사 및 연결 시도
    if (this.activeAnchor) {
      this.connectHook(this.activeAnchor, player, audioManager);
      return 'CONNECTED';
    }

    // 3. 연결 가능한 앵커 없음
    return 'MISSED';
  }

  /**
   * 지정된 앵커에 갈고리 연결
   * @param {Object} anchor
   * @param {Object} player
   * @param {Object} audioManager
   */
  connectHook(anchor, player, audioManager = null) {
    this.connectedAnchor = anchor;
    this.state = 'HOOKED';

    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;

    const dx = px - anchor.x;
    const dy = py - anchor.y;

    // 초기 로프 길이 및 각도 계산
    this.ropeLength = Math.max(Math.hypot(dx, dy), 50);
    this.theta = Math.atan2(dx, dy);

    // 초기 진입 속도를 반영한 각속도(omega) 산출
    const currentSpeed = player.currentSpeed || 260;
    const vy = player.vy || 0;
    const vt = currentSpeed * Math.cos(this.theta) - vy * Math.sin(this.theta);

    // 다이내믹한 전방 스윙을 위해 최소 전진 회전 각속도 보장
    this.omega = Math.max(vt / this.ropeLength, 1.4);

    player.setHookedState();

    if (audioManager) {
      audioManager.playSfx('HOOK_CONNECT');
    }
  }

  /**
   * 갈고리 해제 및 강력한 관성 비행 전달
   * @param {Object} player
   * @param {Object} audioManager
   */
  releaseHook(player, audioManager = null) {
    if (this.state !== 'HOOKED' || !this.connectedAnchor) return;

    // 해제 순간의 접선 속도
    const vt = this.ropeLength * this.omega;
    let launchVx = (vt * Math.cos(this.theta)) * this.releaseBoostX;
    let launchVy = (-vt * Math.sin(this.theta)) * this.releaseBoostY;

    // 플레이어가 전방 및 상공으로 호쾌하게 비행할 수 있도록 수직/수평 최솟값 보정
    // 전방으로 상승하는 타이밍에 해제하면 높은 포물선 비행, 하강 타이밍이어도 최소 부스트 보장
    if (launchVy > -180) {
      launchVy = -260;
    }

    // 플레이어에게 관성 벡터 전달 및 공중제비(AIRBORNE) 상태 전환
    player.setAirborneState(launchVy, this.theta);

    this.state = 'IDLE';
    this.connectedAnchor = null;

    if (audioManager) {
      audioManager.playSfx('HOOK_RELEASE');
    }
  }

  /**
   * 현재 연결 상태 여부
   * @returns {boolean}
   */
  isHooked() {
    return this.state === 'HOOKED';
  }
}
