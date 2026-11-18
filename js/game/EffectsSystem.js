import { PlayerState } from './Player.js';
import { drawShape, SHAPE_SCALE } from './CosmeticDraw.js';

/**
 * 타격감 연출 시스템 (EffectsSystem)
 * - 히트스톱(순간 정지), 화면 흔들림 보조, 달리기/점프/착지 먼지, 갈고리 링,
 *   사망 파편, 속도감 라인, 점수·니어미스 팝업, 콤보 표시를 담당합니다.
 * - 모든 좌표는 캔버스 논리 좌표(640×360) 기준이며, 수치는 GAME_CONFIG.EFFECTS 에서 조절합니다.
 * - 기존 Renderer 의 피격 섬광/추락 암전/파티클은 그대로 두고, 그 위에 연출을 덧붙이는 구조입니다.
 */

const MAX_PARTICLES = 400;

const KIND_STYLE = Object.freeze({
  NEAR: { color: '#ffd166', label: 'NEAR MISS' },
  PERFECT: { color: '#06d6a0', label: 'PERFECT!' },
  LEDGE: { color: '#74c0fc', label: 'LEDGE SAVE' },
});

export class EffectsSystem {
  /**
   * @param {Object} config 전역 게임 설정 (GAME_CONFIG)
   * @param {import('./Renderer.js').Renderer} renderer 화면 흔들림 전달용
   */
  constructor(config, renderer) {
    this.fx = config.EFFECTS || {};
    this.renderer = renderer;
    this.logicalWidth = config.CANVAS.LOGICAL_WIDTH;
    this.groundY = config.WORLD.GROUND_Y;
    this.baseSpeed = config.WORLD.BASE_SPEED;
    this.maxSpeed = (config.DIFFICULTY && config.DIFFICULTY.MAX_SPEED) || 440;
    this.comboTimeout = (config.NEAR_MISS && config.NEAR_MISS.COMBO_TIMEOUT) || 2.8;

    // 모션 줄이기 설정을 켠 사용자에게는 흔들림을 줄이고 속도 라인을 끔
    this.reducedMotion = !!(
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    /** @type {Array<Object>} */
    this.particles = [];
    /** @type {Array<{ x: number, y: number, r: number, maxR: number, life: number, maxLife: number, color: string }>} */
    this.rings = [];
    /** @type {Array<{ text: string, x: number, y: number, vy: number, size: number, color: string, life: number, maxLife: number }>} */
    this.popups = [];

    this.hitStopTimer = 0;
    this.runDustTimer = 0;

    // 콤보 HUD 상태 (NearMissSystem 이 값을 전달)
    this.combo = 0;
    this.comboRatio = 0;
    this.comboPulse = 0;

    // 속도 라인 풀 (고정 개수를 재활용)
    this.speedLines = [];
    for (let i = 0; i < 12; i++) {
      this.speedLines.push({
        x: Math.random() * this.logicalWidth,
        y: 20 + Math.random() * (this.groundY - 50),
        len: 14 + Math.random() * 26,
        extra: Math.random() * 180,
      });
    }
    this.speedIntensity = 0;

    // 꾸미기 테마 (상점에서 장착한 먼지 색 / 니어미스 연출 색)
    this.theme = {
      dust: ['#cbd5e1', '#94a3b8'],
      run: ['#94a3b8', '#64748b'],
      kinds: { NEAR: { ...KIND_STYLE.NEAR }, PERFECT: { ...KIND_STYLE.PERFECT }, LEDGE: { ...KIND_STYLE.LEDGE } },
      dustShape: 'square', dustFloat: false, dustSpin: false,   // 먼지 입자 모양
      burstShape: 'square',                                      // 니어미스 파편 모양
    };
  }

  /**
   * 장착한 꾸미기 적용 (null 이면 해당 항목은 기본값)
   * @param {{ trail?: Object|null, effect?: Object|null }} cosmetics ShopManager 아이템 객체
   */
  setCosmetics({ trail = null, effect = null } = {}) {
    this.theme.dust = trail?.colors?.length ? trail.colors : ['#cbd5e1', '#94a3b8'];
    this.theme.run = trail?.runColors?.length ? trail.runColors : ['#94a3b8', '#64748b'];
    this.theme.kinds.NEAR.color = effect?.near || KIND_STYLE.NEAR.color;
    this.theme.kinds.PERFECT.color = effect?.perfect || KIND_STYLE.PERFECT.color;
    this.theme.kinds.LEDGE.color = effect?.ledge || KIND_STYLE.LEDGE.color;
    this.theme.kinds.NEAR.label = effect?.labels?.near || KIND_STYLE.NEAR.label;
    this.theme.kinds.PERFECT.label = effect?.labels?.perfect || KIND_STYLE.PERFECT.label;
    this.theme.kinds.LEDGE.label = effect?.labels?.ledge || KIND_STYLE.LEDGE.label;
    this.theme.dustShape = trail?.shape || 'square';
    this.theme.dustFloat = !!trail?.float;
    this.theme.dustSpin = !!trail?.spin;
    this.theme.burstShape = effect?.shape || 'square';
  }

  /** 먼지 입자에 꾸미기 모양/움직임을 덧입힘 (기본 'square' 이면 기존과 동일) */
  _dust(p) {
    const t = this.theme;
    if (t.dustShape !== 'square') {
      p.shape = t.dustShape;
      p.size = p.size + 1;                       // 모양 입자는 조금 크게 해야 알아볼 수 있음
      p.life *= 1.5; p.maxLife *= 1.5;
      p.rot = Math.random() * Math.PI * 2;
    }
    if (t.dustFloat) { p.gravity = -(30 + Math.random() * 40); p.vy = -Math.abs(p.vy) - 10; }   // 위로 떠오름
    if (t.dustSpin) p.spin = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 5);
    this._push(p);
  }

  _pickColor(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  /**
   * 코인 획득 연출 (작은 불꽃 + 팝업)
   * @param {number} chain 짧은 시간 안에 연속으로 먹은 개수
   */
  coinPickup(x, y, chain = 0) {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      this._push({
        x, y, vx: Math.cos(a) * (40 + Math.random() * 50), vy: Math.sin(a) * (40 + Math.random() * 50) - 20,
        size: 2, color: Math.random() < 0.6 ? '#ffd166' : '#fff1b8', life: 0.22, maxLife: 0.22, drag: 4,
      });
    }
    this.popup(chain >= 4 ? `+1 x${chain + 1}` : '+1', x, y - 8, '#ffd166', 9, 0.5, -34);
  }

  /**
   * 연출 상태 초기화 (게임 시작/재시작/타이틀 복귀)
   */
  reset() {
    this.particles = [];
    this.rings = [];
    this.popups = [];
    this.hitStopTimer = 0;
    this.runDustTimer = 0;
    this.combo = 0;
    this.comboRatio = 0;
    this.comboPulse = 0;
    this.speedIntensity = 0;
  }

  // ---------------------------------------------------------------------------
  // 히트스톱 / 화면 흔들림
  // ---------------------------------------------------------------------------

  /**
   * 화면을 아주 짧게 멈춰서 타격감을 강조
   * @param {number} seconds
   */
  hitStop(seconds) {
    if (!(seconds > 0)) return;
    this.hitStopTimer = Math.min(0.12, Math.max(this.hitStopTimer, seconds));
  }

  /**
   * 히트스톱 타이머 진행. 정지 중이면 true (게임 루프는 이때 시간을 0으로 흘려보냄)
   * @param {number} dt 실제 경과 시간 (seconds)
   * @returns {boolean}
   */
  tickHitStop(dt) {
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      return true;
    }
    return false;
  }

  /**
   * 화면 흔들림 추가 (더 강한 흔들림이 진행 중이면 덮어쓰지 않음)
   * @param {number} intensity px
   * @param {number} duration seconds
   */
  shake(intensity, duration) {
    const r = this.renderer;
    if (!r) return;
    const scale = (this.fx.SHAKE_SCALE ?? 1) * (this.reducedMotion ? 0.4 : 1);
    const power = intensity * scale;
    if (power <= 0) return;
    const active = r.shakeDuration > 0;
    r.shakeIntensity = active ? Math.max(r.shakeIntensity, power) : power;
    r.shakeDuration = Math.max(r.shakeDuration, duration);
  }

  // ---------------------------------------------------------------------------
  // 이벤트별 연출
  // ---------------------------------------------------------------------------

  /**
   * 점프 순간 발밑 먼지
   */
  jumpPuff(x, y) {
    for (let i = 0; i < 4; i++) {
      this._dust({
        x: x + (Math.random() - 0.5) * 14,
        y: y - 1,
        vx: -(30 + Math.random() * 60),
        vy: -(8 + Math.random() * 26),
        size: Math.random() < 0.5 ? 2 : 3,
        color: this._pickColor(this.theme.dust),
        life: 0.22,
        maxLife: 0.22,
        gravity: 120,
      });
    }
  }

  /**
   * 착지 충격 먼지 (낙하 속도가 클수록 많이 튐) + 강한 착지 시 약한 흔들림
   * @param {number} impactSpeed 착지 직전 낙하 속도 (px/s)
   */
  landImpact(x, y, impactSpeed = 0) {
    const count = 4 + Math.min(6, Math.floor(Math.max(0, impactSpeed) / 160));
    for (let i = 0; i < count; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      this._dust({
        x: x + (Math.random() - 0.5) * 14,
        y: y - 1,
        vx: dir * (40 + Math.random() * 100),
        vy: -(20 + Math.random() * 55),
        size: Math.random() < 0.5 ? 2 : 3,
        color: this._pickColor(this.theme.dust),
        life: 0.24,
        maxLife: 0.24,
        gravity: 260,
      });
    }
    if (impactSpeed >= (this.fx.LAND_SHAKE_SPEED ?? 650)) {
      this.shake(1.6, 0.09);
    }
  }

  /**
   * 갈고리가 걸린 순간: 확산 링 + 짧은 정지 + 약한 흔들림 (불꽃은 Renderer.spawnSparks 가 담당)
   */
  hookConnect(x, y) {
    this._ring(x, y, 5, 28, 0.3, '#ffd166');
    this.shake(1.5, 0.08);
    this.hitStop(this.fx.HIT_STOP_HOOK ?? 0);
  }

  /**
   * 갈고리 해제로 튕겨 나가는 순간: 뒤로 흩어지는 입자 + 약한 흔들림
   */
  hookRelease(x, y) {
    for (let i = 0; i < 10; i++) {
      this._push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 14,
        vx: -(110 + Math.random() * 120),
        vy: (Math.random() - 0.5) * 120,
        size: Math.random() < 0.5 ? 2 : 3,
        color: Math.random() < 0.5 ? '#e2e8f0' : '#06d6a0',
        life: 0.3,
        maxLife: 0.3,
        drag: 2.5,
      });
    }
    this.shake(2, 0.1);
  }

  /**
   * 니어미스 성공 연출
   * @param {'NEAR' | 'PERFECT' | 'LEDGE'} kind
   * @param {number} x 팝업 기준 X
   * @param {number} y 팝업 기준 Y
   * @param {{ bonus: number, combo: number }} info
   * @param {number} [sx] 불꽃/링 기준 X (기본값: 팝업 위치)
   * @param {number} [sy] 불꽃/링 기준 Y (기본값: 팝업 위치)
   */
  nearMissBurst(kind, x, y, info, sx = x, sy = y) {
    const style = this.theme.kinds[kind] || this.theme.kinds.NEAR;
    const sparks = kind === 'PERFECT' ? 12 : 8;
    for (let i = 0; i < sparks; i++) {
      const angle = (i / sparks) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 60 + Math.random() * 110;
      this._push({
        x: sx,
        y: sy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() < 0.5 ? 2 : 3,
        color: Math.random() < 0.6 ? style.color : '#ffffff',
        life: 0.3,
        maxLife: 0.3,
        drag: 3,
        ...(this.theme.burstShape !== 'square'
          ? { shape: this.theme.burstShape, size: 3, life: 0.5, maxLife: 0.5, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 8 }
          : {}),
      });
    }
    this._ring(sx, sy, 4, kind === 'PERFECT' ? 26 : 18, 0.26, style.color);

    const comboText = info.combo >= 2 ? ` x${info.combo}` : '';
    this.popup(`${style.label}${comboText}`, x, y - 14, style.color, kind === 'PERFECT' ? 13 : 11, 0.95);
    this.popup(`+${info.bonus}`, x, y - 2, '#ffffff', 10, 0.95);

    this.comboPulse = 1;
    this.shake(kind === 'PERFECT' ? 2.2 : 1.4, 0.09);
    this.hitStop(this.fx.HIT_STOP_NEAR_MISS ?? 0);
  }

  /**
   * 사망(장애물 충돌) 파편 + 히트스톱
   */
  deathBurst(x, y) {
    const colors = ['#e63946', '#ff758f', '#1a1a2e', '#f1f5f9'];
    for (let i = 0; i < 24; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 190;
      this._push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        size: 2 + Math.floor(Math.random() * 3),
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8,
        gravity: 520,
      });
    }
    this.hitStop(this.fx.HIT_STOP_DEATH ?? 0);
  }

  /**
   * 범용 파편 폭발 (파워업 획득, 방어막 파괴, 장애물 박살 등에 사용)
   * @param {number} x
   * @param {number} y
   * @param {string[]} colors
   * @param {number} count
   * @param {number} power 파편 속도 배율
   */
  burst(x, y, colors, count = 16, power = 1) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (70 + Math.random() * 170) * power;
      this._push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        size: 2 + Math.floor(Math.random() * 3),
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0.4 + Math.random() * 0.35,
        maxLife: 0.75,
        gravity: 420,
      });
    }
  }

  /** 퍼져나가는 원형 충격파 */
  shockwave(x, y, color = '#ffffff', maxR = 60, life = 0.35) {
    this._ring(x, y, 6, maxR, life, color);
  }

  /**
   * 점수 마일스톤 팝업 (화면 상단 중앙)
   */
  milestone(value) {
    this.popup(`★ ${value} ★`, this.logicalWidth / 2, 54, '#ffe066', 16, 1.3, -10);
  }

  /**
   * 떠오르는 텍스트 팝업
   */
  popup(text, x, y, color = '#ffffff', size = 11, life = 0.9, vy = -26) {
    const margin = 44;
    this.popups.push({
      text,
      x: Math.max(margin, Math.min(this.logicalWidth - margin, x)),
      y,
      vy,
      size,
      color,
      life,
      maxLife: life,
    });
    if (this.popups.length > 12) this.popups.shift();
  }

  /**
   * 콤보 HUD 값 갱신 (NearMissSystem 상태를 매 프레임 전달)
   * @param {number} combo 현재 콤보
   * @param {number} secondsLeft 콤보 유지 남은 시간
   */
  setCombo(combo, secondsLeft) {
    this.combo = combo;
    this.comboRatio = combo > 0 ? Math.max(0, Math.min(1, secondsLeft / this.comboTimeout)) : 0;
  }

  // ---------------------------------------------------------------------------
  // 업데이트
  // ---------------------------------------------------------------------------

  /**
   * 매 프레임 갱신 (히트스톱 중에는 dt = 0 으로 호출됨)
   * @param {number} dt
   * @param {{ player: Object|null, speed: number, playing: boolean }} ctx
   */
  update(dt, { player = null, speed = 0, playing = false } = {}) {
    if (dt > 0) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        if (p.gravity) p.vy += p.gravity * dt;
        if (p.spin) p.rot = (p.rot || 0) + p.spin * dt;
        if (p.drag) {
          const k = Math.max(0, 1 - p.drag * dt);
          p.vx *= k;
          p.vy *= k;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) this.particles.splice(i, 1);
      }

      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.life -= dt;
        if (r.life <= 0) {
          this.rings.splice(i, 1);
          continue;
        }
        const t = 1 - r.life / r.maxLife;
        r.r = r.startR + (r.maxR - r.startR) * (1 - (1 - t) * (1 - t));
      }

      for (let i = this.popups.length - 1; i >= 0; i--) {
        const p = this.popups[i];
        p.y += p.vy * dt;
        p.vy *= Math.max(0, 1 - 2.2 * dt);
        p.life -= dt;
        if (p.life <= 0) this.popups.splice(i, 1);
      }

      if (this.comboPulse > 0) {
        this.comboPulse = Math.max(0, this.comboPulse - dt * 5);
      }

      this._updateRunDust(dt, player, speed, playing);
      this._updateSpeedLines(dt, speed, playing);
    }
  }

  _updateRunDust(dt, player, speed, playing) {
    if (!playing || !player || !player.isOnGround || player.state !== PlayerState.RUNNING) {
      this.runDustTimer = 0;
      return;
    }
    // 빠를수록 먼지를 더 자주 뿌림
    const ratio = Math.max(0, Math.min(1, (speed - this.baseSpeed) / (this.maxSpeed - this.baseSpeed)));
    const interval = 0.11 - 0.05 * ratio;
    this.runDustTimer += dt;
    while (this.runDustTimer >= interval) {
      this.runDustTimer -= interval;
      this._dust({
        x: player.x + 14 + Math.random() * 6,
        y: player.y + player.height - 1,
        vx: -(speed * 0.3 + Math.random() * 40),
        vy: -(8 + Math.random() * 24),
        size: 2,
        color: this._pickColor(this.theme.run),
        life: 0.2 + Math.random() * 0.12,
        maxLife: 0.32,
        gravity: 90,
      });
    }
  }

  _updateSpeedLines(dt, speed, playing) {
    const ratio = Math.max(0, Math.min(1, (speed - this.baseSpeed) / (this.maxSpeed - this.baseSpeed)));
    const target = !this.fx.SPEED_LINES || this.reducedMotion || !playing ? 0 : ratio;
    // 부드럽게 따라가게 해서 갑자기 켜지거나 꺼지지 않도록 함
    this.speedIntensity += (target - this.speedIntensity) * Math.min(1, dt * 3);

    for (const line of this.speedLines) {
      line.x -= (speed * 1.7 + line.extra) * dt;
      if (line.x + line.len < 0) {
        line.x = this.logicalWidth + Math.random() * 220;
        line.y = 20 + Math.random() * (this.groundY - 50);
        line.len = 14 + Math.random() * 26;
        line.extra = Math.random() * 180;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 렌더링
  // ---------------------------------------------------------------------------

  /**
   * 배경 바로 위(플랫폼/캐릭터 뒤)에 그리는 효과: 속도 라인
   * @param {CanvasRenderingContext2D} ctx
   */
  drawBehind(ctx) {
    const shown = Math.ceil(this.speedIntensity * this.speedLines.length - 0.001);
    if (shown <= 0) return;

    ctx.save();
    ctx.fillStyle = '#e2e8f0';
    ctx.globalAlpha = 0.07 + 0.13 * this.speedIntensity;
    for (let i = 0; i < shown; i++) {
      const l = this.speedLines[i];
      ctx.fillRect(Math.round(l.x), Math.round(l.y), Math.round(l.len), 1);
    }
    ctx.restore();
  }

  /**
   * 캐릭터 앞에 그리는 효과: 입자, 링, 팝업, 콤보 표시
   * @param {CanvasRenderingContext2D} ctx
   */
  drawFront(ctx) {
    ctx.save();

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      if (p.shape) {
        drawShape(ctx, p.shape, Math.round(p.x), Math.round(p.y), p.size * SHAPE_SCALE * 0.8, p.color, p.rot || 0);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
    }

    for (const r of this.rings) {
      ctx.globalAlpha = Math.max(0, r.life / r.maxLife);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(Math.round(r.x), Math.round(r.y), r.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const p of this.popups) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, t * 2.2);
      this._text(ctx, p.text, p.x, p.y, p.size, p.color);
    }

    this._drawCombo(ctx);

    ctx.restore();
  }

  _drawCombo(ctx) {
    if (this.combo < 2) return;

    const tier = this.combo >= 6 ? 2 : this.combo >= 4 ? 1 : 0;
    const color = ['#ffd166', '#ff9f43', '#ff5d73'][tier];
    const size = 13 + tier * 2 + Math.round(this.comboPulse * 4);
    const cx = this.logicalWidth / 2;

    ctx.globalAlpha = 1;
    this._text(ctx, `COMBO x${this.combo}`, cx, 30, size, color);

    // 콤보 유지 시간 게이지
    const w = 76;
    const h = 3;
    const x = Math.round(cx - w / 2);
    const y = 42;
    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.round(w * this.comboRatio), h);
  }

  _text(ctx, text, x, y, size, color) {
    ctx.font = `bold ${size}px "Courier New", monospace`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0b0c10';
    ctx.strokeText(text, Math.round(x), Math.round(y));
    ctx.fillStyle = color;
    ctx.fillText(text, Math.round(x), Math.round(y));
  }

  // ---------------------------------------------------------------------------
  // 내부 유틸
  // ---------------------------------------------------------------------------

  _push(particle) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(particle);
  }

  _ring(x, y, startR, maxR, life, color) {
    this.rings.push({ x, y, r: startR, startR, maxR, life, maxLife: life, color });
  }
}
