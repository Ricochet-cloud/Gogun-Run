/**
 * 물리 연산 처리 모듈
 * 플레이어 및 오브젝트의 중력, 이동, 불연속 플랫폼 착지, 진자 운동 연산을 담당합니다.
 */

export class Physics {
  /**
   * 중력 가속도를 적용한 수직 속도 계산
   * @param {number} vy 현재 수직 속도 (px/s)
   * @param {number} dt 경과 시간 (seconds)
   * @param {number} gravity 중력 가속도 (px/s^2)
   * @param {number} maxFallSpeed 최대 낙하 속도 (px/s)
   * @returns {number} 업데이트된 수직 속도
   */
  static applyGravity(vy, dt, gravity, maxFallSpeed) {
    const nextVy = vy + gravity * dt;
    return Math.min(nextVy, maxFallSpeed);
  }

  /**
   * 단일 연속 바닥 착지 여부 판정 (STEP 1~4 호환용)
   * @param {number} y 플레이어 현재 Y 좌표
   * @param {number} height 플레이어 높이
   * @param {number} groundY 바닥 상단 Y 좌표
   * @returns {{ onGround: boolean, y: number }}
   */
  static checkGroundCollision(y, height, groundY) {
    const bottomY = y + height;
    if (bottomY >= groundY) {
      return {
        onGround: true,
        y: groundY - height,
      };
    }
    return {
      onGround: false,
      y,
    };
  }

  /**
   * 불연속 플랫폼 상단 착지 여부 판정 (STEP 5)
   * 플레이어가 하강 중(vy >= 0)이고 플랫폼 상단을 통과할 때 착지 처리
   * @param {number} playerX 플레이어 X 좌표
   * @param {number} playerY 플레이어 현재 Y 좌표
   * @param {number} prevY 이전 프레임 Y 좌표
   * @param {number} width 플레이어 가로 폭
   * @param {number} height 플레이어 높이
   * @param {number} vy 현재 수직 속도
   * @param {Array<{ x: number, y: number, width: number }>} platforms 활성 플랫폼 목록
   * @returns {{ onGround: boolean, y: number, platform: Object|null }}
   */
  static checkPlatformLanding(playerX, playerY, prevY, width, height, vy, platforms) {
    // 상승 중일 때는 지면에 착지하지 않고 통과
    if (vy < 0) {
      return { onGround: false, y: playerY, platform: null };
    }

    const currentFootY = playerY + height;
    const prevFootY = prevY + height;

    // 발 너비 (가장자리 여백 고려하여 판정)
    const footLeft = playerX + 6;
    const footRight = playerX + width - 6;

    for (const platform of platforms) {
      // 수평 범위 내에 있는지 검사
      const isWithinX = footRight >= platform.x && footLeft <= platform.x + platform.width;
      if (!isWithinX) continue;

      // 수직으로 플랫폼 윗면을 통과했거나 살짝 파고들었는지 검사 (스냅 허용 오차 16px)
      const passedSurface = prevFootY <= platform.y + 4 && currentFootY >= platform.y - 12;
      if (passedSurface) {
        return {
          onGround: true,
          y: platform.y - height,
          platform,
        };
      }
    }

    return { onGround: false, y: playerY, platform: null };
  }

  /**
   * 로프 진자 운동 1단계 물리 갱신
   * @param {number} theta 현재 각도 (라디안, 수직 아래 기준)
   * @param {number} omega 현재 각속도 (rad/s)
   * @param {number} ropeLength 로프 길이 (px)
   * @param {number} dt 경과 시간 (seconds)
   * @param {number} gravity 중력 가속도
   * @param {number} damping 회전 감쇠 계수
   * @returns {{ theta: number, omega: number }}
   */
  static stepPendulum(theta, omega, ropeLength, dt, gravity = 2000, damping = 0.12) {
    // 진자 각가속도: alpha = - (g / L) * sin(theta)
    const alpha = -(gravity / Math.max(ropeLength, 40)) * Math.sin(theta);
    let nextOmega = omega + alpha * dt;
    nextOmega *= Math.max(0, 1 - damping * dt);
    const nextTheta = theta + nextOmega * dt;

    return { theta: nextTheta, omega: nextOmega };
  }
}
