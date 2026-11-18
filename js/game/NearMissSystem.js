import { PlayerState } from './Player.js';

/**
 * 니어미스(아슬아슬 통과) 및 콤보 시스템 (NearMissSystem)
 *
 * 1) 장애물 니어미스
 *    장애물과 가로로 겹치는 동안 "플레이어 발 히트박스 ↔ 장애물 윗면" 수직 간격의 최솟값을 기록하고,
 *    장애물이 완전히 뒤로 지나간 순간 그 값이 기준 이하면 보너스를 줍니다.
 *    (충돌했다면 게임 오버이므로 자연히 보너스 대상이 아님)
 * 2) 아슬아슬 착지(LEDGE)
 *    낭떠러지를 건너 건너편 지면의 앞쪽 끝에 발이 조금만 걸쳐 착지하면 보너스를 줍니다.
 * 3) 콤보
 *    니어미스가 이어질수록 콤보가 쌓여 보너스 배율이 올라가고, 일정 시간 동안 다음 니어미스가 없으면 끊깁니다.
 *
 * 수치는 GAME_CONFIG.NEAR_MISS 에서 조절합니다.
 */
export class NearMissSystem {
  /**
   * @param {Object} config 전역 게임 설정 (GAME_CONFIG)
   */
  constructor(config) {
    const c = config.NEAR_MISS || {};
    this.maxGap = c.OBSTACLE_MAX_GAP ?? 16;
    this.perfectGap = c.OBSTACLE_PERFECT_GAP ?? 6;
    this.ledgeMaxOverlap = c.LEDGE_MAX_OVERLAP ?? 14;
    this.basePoints = c.BASE_POINTS ?? 30;
    this.perfectMultiplier = c.PERFECT_MULTIPLIER ?? 2;
    this.ledgePoints = c.LEDGE_POINTS ?? 40;
    this.comboTimeout = c.COMBO_TIMEOUT ?? 2.8;
    this.maxMultiplier = c.MAX_COMBO_MULTIPLIER ?? 5;

    this.reset();
  }

  /**
   * 콤보와 통계 초기화 (게임 시작/재시작/타이틀 복귀)
   */
  reset() {
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.totalCount = 0;
    this.totalBonus = 0;
    /** @type {WeakMap<Object, { minGap: number, invalid: boolean }>} */
    this.tracked = new WeakMap();
  }

  /**
   * 콤보 유지 남은 시간 (초)
   * @returns {number}
   */
  get timeLeft() {
    return this.combo > 0 ? Math.max(0, this.comboTimer) : 0;
  }

  /**
   * 매 프레임 갱신: 콤보 타이머 진행 및 장애물 통과 판정
   * @param {number} dt 경과 시간 (seconds)
   * @param {Object} player Player 인스턴스
   * @param {Array<Object>} obstacles 활성 장애물 목록
   * @returns {Array<Object>} 이번 프레임에 발생한 니어미스 이벤트 목록
   */
  update(dt, player, obstacles) {
    const events = [];

    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTimer = 0;
      }
    }

    if (!player || player.state === PlayerState.DEAD || !obstacles) {
      return events;
    }

    const pb = player.getHitbox();
    const playerBottom = pb.y + pb.height;

    for (const obstacle of obstacles) {
      const ob = obstacle.getHitbox();
      const overlapX = ob.x < pb.x + pb.width && ob.x + ob.width > pb.x;
      let rec = this.tracked.get(obstacle);

      if (overlapX) {
        // 양수면 플레이어가 장애물 위쪽에 있음 (음수면 겹침 = 충돌 상황)
        const gap = ob.y - playerBottom;
        if (!rec) {
          rec = { minGap: gap, invalid: false };
          this.tracked.set(obstacle, rec);
        }
        rec.minGap = Math.min(rec.minGap, gap);
        if (gap < 0) rec.invalid = true;
      } else if (rec && ob.x + ob.width <= pb.x) {
        // 장애물이 플레이어 뒤로 완전히 지나감 → 판정 확정
        this.tracked.delete(obstacle);
        if (!rec.invalid && rec.minGap <= this.maxGap) {
          const perfect = rec.minGap <= this.perfectGap;
          const base = perfect ? this.basePoints * this.perfectMultiplier : this.basePoints;
          const event = this._award(perfect ? 'PERFECT' : 'NEAR', base);
          event.x = pb.x + pb.width / 2;
          event.y = player.y - 4;
          event.sparkX = ob.x + ob.width;
          event.sparkY = ob.y;
          events.push(event);
        }
      }
    }

    return events;
  }

  /**
   * 착지 직후 호출: 낭떠러지 건너편 지면 끝에 아슬아슬하게 걸쳐 착지했는지 판정
   * @param {Object} player Player 인스턴스 (land() 이후 위치)
   * @param {Array<Object>} platforms 활성 플랫폼 목록
   * @returns {Object|null} 니어미스 이벤트 (해당 없으면 null)
   */
  checkLedgeLanding(player, platforms) {
    if (!player || !platforms || player.state === PlayerState.DEAD) return null;

    const footLeft = player.x + 6;
    const footRight = player.x + player.width - 6;
    const footY = player.y + player.height;

    for (const platform of platforms) {
      if (Math.abs(platform.y - footY) > 1) continue;
      if (!(footRight >= platform.x && footLeft <= platform.x + platform.width)) continue;

      // 지면의 앞쪽 끝이 발 범위 안에 있고(= 뒤꿈치는 아직 허공), 걸친 길이가 짧을 때만 인정
      if (platform.x > footLeft) {
        const overlap = footRight - platform.x;
        if (overlap <= this.ledgeMaxOverlap) {
          const event = this._award('LEDGE', this.ledgePoints);
          event.x = player.x + player.width / 2;
          event.y = player.y - 4;
          event.sparkX = platform.x;
          event.sparkY = platform.y;
          return event;
        }
      }
      break;
    }

    return null;
  }

  /**
   * 콤보를 올리고 보너스 점수를 계산
   * @param {'NEAR' | 'PERFECT' | 'LEDGE'} kind
   * @param {number} base 기본 점수
   * @returns {{ kind: string, bonus: number, combo: number, mult: number, x?: number, y?: number, sparkX?: number, sparkY?: number }}
   */
  _award(kind, base) {
    this.combo += 1;
    this.comboTimer = this.comboTimeout;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.totalCount += 1;

    const mult = Math.min(this.combo, this.maxMultiplier);
    const bonus = Math.round(base * mult);
    this.totalBonus += bonus;

    return { kind, bonus, combo: this.combo, mult };
  }
}
