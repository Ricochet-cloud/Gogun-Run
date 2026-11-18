/**
 * 파워업 시스템 (PowerUpSystem)
 * - 달리는 중 가끔 나타나는 아이템 3종: 자석(코인 끌어당김) / 방어막(장애물 1회 방어) / 부스트(낭떠러지 무시하고 질주)
 * - 아이템과 효과 표시는 모두 캔버스로 그린다 (별도 이미지 에셋 없음).
 * - 이 클래스는 "상태와 그리기"만 담당하고, 충돌/속도 반영은 Game 이 이 상태를 읽어서 처리한다.
 */

export const POWERUP_TYPES = Object.freeze({
  MAGNET: { id: 'MAGNET', label: '자석', color: '#ff6b6b', glow: '#ffa8a8', duration: 8, radius: 170 },
  SHIELD: { id: 'SHIELD', label: '방어막', color: '#4cc9f0', glow: '#a5e8ff', duration: 30, radius: 0 },   // 30초 안에 못 써도 사라짐
  BOOST: { id: 'BOOST', label: '부스트', color: '#ffd166', glow: '#fff1b8', duration: 4.5, radius: 0 },
});

const TYPE_LIST = Object.values(POWERUP_TYPES);
const ITEM_RADIUS = 13;
const BOOST_SPEED_MUL = 1.5;
const BOOST_MAX_EXTRA = 3.0;      // 부스트가 끝났어도 안전한 지면에 닿을 때까지 최대 더 달리는 시간
const GRACE_AFTER_HIT = 1.0;      // 방어막이 깨지거나 부스트가 끝난 직후의 무적 시간
const SAFE_AHEAD = 150;           // 부스트 종료 시 발 앞쪽으로 이만큼은 지면이 이어져 있어야 함

export class PowerUpSystem {
  /**
   * @param {Object} config GAME_CONFIG
   */
  constructor(config) {
    this.groundY = config.WORLD.GROUND_Y;
    this.logicalWidth = config.CANVAS.LOGICAL_WIDTH;
    this.reset();

    /** 콜백: (kind, x, y) */
    this.onPickup = null;
    /** 콜백: (kind) — 시간이 다 되어 끝났을 때 */
    this.onExpire = null;
  }

  reset() {
    /** @type {Array<{type: Object, x: number, y: number, phase: number}>} */
    this.items = [];
    this.time = 0;
    this.spawnTimer = 8 + Math.random() * 4;     // 첫 아이템은 8~12초 뒤
    this.magnetLeft = 0;
    this.shieldLeft = 0;
    this.boostLeft = 0;
    this.boostExtra = 0;
    this.boostActive = false;
    this.grace = 0;
    this.speedMul = 1;
    this.stats = { pickups: 0, shieldSaves: 0, smashes: 0 };
  }

  // ----- 상태 조회 -----

  get isBoosting() { return this.boostActive; }
  get hasShield() { return this.shieldLeft > 0; }
  get hasMagnet() { return this.magnetLeft > 0; }
  /** 장애물에 닿아도 죽지 않는 상태 (부스트 중이거나 직후 무적) */
  get invulnerable() { return this.boostActive || this.grace > 0; }
  /** 자석 판정 (CoinSystem 의 magnet 인자 형식) — 없으면 null */
  getMagnet(player) {
    if (this.magnetLeft <= 0 || !player) return null;
    return { x: player.x + player.width / 2, y: player.y + player.height / 2, radius: POWERUP_TYPES.MAGNET.radius };
  }

  // ----- 효과 적용 -----

  /** 아이템을 얻었을 때 (아이템 줍기 또는 디버그용으로 직접 호출) */
  activate(kind) {
    this.stats.pickups++;
    if (kind === 'MAGNET') this.magnetLeft = POWERUP_TYPES.MAGNET.duration;
    else if (kind === 'SHIELD') this.shieldLeft = POWERUP_TYPES.SHIELD.duration;
    else if (kind === 'BOOST') { this.boostLeft = POWERUP_TYPES.BOOST.duration; this.boostExtra = 0; this.boostActive = true; }
  }

  /** 방어막으로 충돌을 막았을 때 */
  consumeShield() {
    if (this.shieldLeft <= 0) return false;
    this.shieldLeft = 0;
    this.grace = GRACE_AFTER_HIT;
    this.stats.shieldSaves++;
    return true;
  }

  // ----- 갱신 -----

  /**
   * @param {number} dt
   * @param {number} speed 월드 스크롤 속도 (부스트 배율 적용 전)
   * @param {Object} ctx { player, terrain, obstacles }
   */
  update(dt, speed, { player, terrain, obstacles }) {
    this.time += dt;
    const effSpeed = speed * this.speedMul;

    // 아이템 이동 / 획득
    const hb = player && player.state !== 'DEAD' ? player.getHitbox() : null;
    const keep = [];
    for (const it of this.items) {
      it.x -= effSpeed * dt;
      if (hb) {
        const pad = 6;
        const hit =
          it.x + ITEM_RADIUS >= hb.x - pad && it.x - ITEM_RADIUS <= hb.x + hb.width + pad &&
          it.y + ITEM_RADIUS >= hb.y - pad && it.y - ITEM_RADIUS <= hb.y + hb.height + pad;
        if (hit) {
          this.activate(it.type.id);
          if (this.onPickup) this.onPickup(it.type.id, it.x, it.y);
          continue;
        }
      }
      if (it.x > -30) keep.push(it);
    }
    this.items = keep;

    // 지속 시간 감소
    if (this.magnetLeft > 0) {
      this.magnetLeft -= dt;
      if (this.magnetLeft <= 0) { this.magnetLeft = 0; if (this.onExpire) this.onExpire('MAGNET'); }
    }
    if (this.shieldLeft > 0) {
      this.shieldLeft -= dt;
      if (this.shieldLeft <= 0) { this.shieldLeft = 0; if (this.onExpire) this.onExpire('SHIELD'); }
    }
    if (this.grace > 0) this.grace = Math.max(0, this.grace - dt);

    if (this.boostActive) {
      this.boostLeft -= dt;
      if (this.boostLeft <= 0) {
        // 시간이 다 됐어도 발밑/앞쪽에 안전한 지면이 이어질 때까지 조금 더 달린다
        this.boostExtra += dt;
        if (this._solidAhead(player, terrain) || this.boostExtra >= BOOST_MAX_EXTRA) {
          this.boostActive = false;
          this.boostLeft = 0;
          this.grace = Math.max(this.grace, GRACE_AFTER_HIT);
          if (this.onExpire) this.onExpire('BOOST');
        }
      }
    }

    // 부스트 속도 배율을 부드럽게 변화
    const targetMul = this.boostActive ? BOOST_SPEED_MUL : 1;
    this.speedMul += (targetMul - this.speedMul) * Math.min(1, dt * 6);
    if (Math.abs(targetMul - this.speedMul) < 0.003) this.speedMul = targetMul;

    // 새 아이템 스폰 (부스트 중에는 새로 만들지 않음)
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && !this.boostActive) {
      if (this._trySpawn(terrain, obstacles)) this.spawnTimer = 11 + Math.random() * 6;
      else this.spawnTimer = 0.4;     // 안전한 자리가 없으면 곧 다시 시도
    }
  }

  /** 플레이어 발밑 지면이 앞으로 충분히 이어지는지 */
  _solidAhead(player, terrain) {
    if (!player || !terrain) return true;
    const p = terrain.getPlatformUnder(player.x, player.width);
    return !!p && p.x + p.width >= player.x + player.width + SAFE_AHEAD;
  }

  _trySpawn(terrain, obstacles) {
    const x = this.logicalWidth + 30;
    if (terrain && !terrain.isSafeForObstacle(x, 26).safe) return false;
    for (const o of obstacles || []) {
      if (Math.abs(o.x + o.width / 2 - x) < 110) return false;
    }
    const weights = [['MAGNET', 4], ['SHIELD', 3], ['BOOST', 2]];
    let r = Math.random() * 9;
    let kind = 'MAGNET';
    for (const [k, w] of weights) { if ((r -= w) < 0) { kind = k; break; } }
    this.items.push({ type: POWERUP_TYPES[kind], x, y: this.groundY - 52, phase: Math.random() * 6 });
    return true;
  }

  // ----- 그리기 -----

  /** 월드 위에 떠 있는 아이템 */
  renderItems(ctx) {
    for (const it of this.items) {
      if (it.x < -20 || it.x > this.logicalWidth + 20) continue;
      const bob = Math.sin(this.time * 3 + it.phase) * 3;
      this._drawOrb(ctx, it.type, Math.round(it.x), Math.round(it.y + bob), ITEM_RADIUS, 1);
    }
  }

  /** 플레이어 주변 효과 (뒤: 부스트 잔상 / 앞: 방어막, 자석) */
  renderBehindPlayer(ctx, player) {
    if (!this.boostActive && this.speedMul < 1.02) return;
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;
    ctx.save();
    // 낭떠러지 위에서도 달릴 수 있게 해주는 에너지 다리
    const gy = this.groundY;
    const grad = ctx.createLinearGradient(cx - 120, 0, cx + 60, 0);
    grad.addColorStop(0, 'rgba(255, 209, 102, 0)');
    grad.addColorStop(1, 'rgba(255, 209, 102, 0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(Math.round(cx - 120), gy - 1, 180, 3);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(Math.round(cx - 90), gy + 3, 140, 1);

    // 속도 잔상 줄무늬
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 7; i++) {
      const y = player.y + 6 + ((i * 37 + Math.floor(this.time * 30) * 11) % (player.height - 8));
      const len = 30 + ((i * 53) % 50);
      const gx = ctx.createLinearGradient(cx - len - 10, 0, cx - 10, 0);
      gx.addColorStop(0, 'rgba(255, 241, 184, 0)');
      gx.addColorStop(1, 'rgba(255, 209, 102, 0.9)');
      ctx.fillStyle = gx;
      ctx.fillRect(Math.round(cx - len - 10), Math.round(y), len, 2);
    }
    // 몸 뒤의 빛무리
    ctx.globalAlpha = 0.28 + 0.1 * Math.sin(this.time * 20);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.ellipse(cx - 6, cy, 34, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  renderFrontOfPlayer(ctx, player) {
    const cx = player.x + player.width / 2;
    const cy = player.y + player.height / 2;

    if (this.magnetLeft > 0) {
      const R = POWERUP_TYPES.MAGNET.radius;
      const fade = this.magnetLeft < 2 ? (Math.sin(this.time * 18) > 0 ? 1 : 0.35) : 1;
      ctx.save();
      ctx.strokeStyle = POWERUP_TYPES.MAGNET.color;
      ctx.lineWidth = 1;
      for (let k = 0; k < 2; k++) {
        const t = ((this.time * 0.9 + k * 0.5) % 1);
        ctx.globalAlpha = (1 - t) * 0.35 * fade;
        ctx.beginPath();
        ctx.arc(cx, cy, R * (1 - t), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (this.shieldLeft > 0) {
      const pulse = 1 + Math.sin(this.time * 6) * 0.04;
      const R = 40 * pulse;
      const blink = this.shieldLeft < 4 ? (Math.sin(this.time * 16) > 0 ? 1 : 0.4) : 1;
      ctx.save();
      ctx.globalAlpha = 0.16 * blink;
      ctx.fillStyle = POWERUP_TYPES.SHIELD.color;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.85 * blink;
      ctx.strokeStyle = POWERUP_TYPES.SHIELD.glow;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      // 빛이 도는 호
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      const a = this.time * 3;
      ctx.beginPath(); ctx.arc(cx, cy, R - 3, a, a + 0.9); ctx.stroke();
      ctx.restore();
    }
  }

  /** 무적 중 깜빡임용 알파값 (1 = 불투명) */
  playerAlpha() {
    if (this.grace > 0 && !this.boostActive) return Math.sin(this.time * 40) > 0 ? 1 : 0.35;
    return 1;
  }

  /** 하단 상태 칩 (남은 시간 막대) */
  renderHUD(ctx) {
    const rows = [];
    if (this.boostActive) rows.push({ t: POWERUP_TYPES.BOOST, ratio: Math.max(0, this.boostLeft) / POWERUP_TYPES.BOOST.duration });
    if (this.magnetLeft > 0) rows.push({ t: POWERUP_TYPES.MAGNET, ratio: this.magnetLeft / POWERUP_TYPES.MAGNET.duration });
    if (this.shieldLeft > 0) rows.push({ t: POWERUP_TYPES.SHIELD, ratio: 1 });
    if (!rows.length) return;
    ctx.save();
    let x = 10;
    const y = this.groundY + 30;
    for (const r of rows) {
      this._drawOrb(ctx, r.t, x + 11, y + 11, 10, 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(x + 26, y + 6, 46, 6);
      ctx.fillStyle = r.t.color;
      ctx.fillRect(x + 27, y + 7, Math.round(44 * Math.min(1, r.ratio)), 4);
      x += 82;
    }
    ctx.restore();
  }

  _drawOrb(ctx, type, x, y, r, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    // 바깥 광채
    const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.9);
    g.addColorStop(0, type.glow + 'aa');
    g.addColorStop(1, type.glow + '00');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    // 구슬
    ctx.fillStyle = '#1b1f33';
    ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = type.color;
    ctx.beginPath(); ctx.arc(x, y, r - 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, Math.PI * 2); ctx.fill();

    // 아이콘
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, r * 0.18);
    ctx.lineCap = 'round';
    const s = r * 0.5;
    if (type.id === 'MAGNET') {
      ctx.beginPath();
      ctx.moveTo(x - s, y - s);
      ctx.lineTo(x - s, y + s * 0.2);
      ctx.arc(x, y + s * 0.2, s, Math.PI, 0, true);
      ctx.lineTo(x + s, y - s);
      ctx.stroke();
    } else if (type.id === 'SHIELD') {
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.1);
      ctx.lineTo(x + s, y - s * 0.6);
      ctx.lineTo(x + s * 0.8, y + s * 0.5);
      ctx.lineTo(x, y + s * 1.2);
      ctx.lineTo(x - s * 0.8, y + s * 0.5);
      ctx.lineTo(x - s, y - s * 0.6);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(x + s * 0.3, y - s * 1.2);
      ctx.lineTo(x - s * 0.7, y + s * 0.1);
      ctx.lineTo(x, y + s * 0.1);
      ctx.lineTo(x - s * 0.3, y + s * 1.2);
      ctx.lineTo(x + s * 0.7, y - s * 0.2);
      ctx.lineTo(x, y - s * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
