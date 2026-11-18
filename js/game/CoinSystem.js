/**
 * 코인 시스템 (CoinSystem)
 * - 지형 생성에 맞춰 코인을 배치한다 (지면 위 일렬 / 낭떠러지 위 포물선 / 장애물 위 포물선).
 * - 월드와 같은 속도로 스크롤되며, 플레이어 히트박스(또는 펫 자석 범위)에 닿으면 획득된다.
 * - 코인은 별도 에셋 없이 캔버스로 직접 그린다 (회전하는 금화).
 */
export class CoinSystem {
  /**
   * @param {Object} config GAME_CONFIG
   */
  constructor(config) {
    this.groundY = config.WORLD.GROUND_Y;
    this.logicalWidth = config.CANVAS.LOGICAL_WIDTH;
    const c = config.COINS || {};
    this.radius = c.RADIUS ?? 8;
    this.pickupPadding = c.PICKUP_PADDING ?? 6;        // 플레이어 히트박스를 이만큼 넓혀서 판정 (너그러운 획득)
    this.lineChance = c.PLATFORM_LINE_CHANCE ?? 0.55;
    this.gapArcChance = c.GAP_ARC_CHANCE ?? 0.7;
    this.obstacleArcChance = c.OBSTACLE_ARC_CHANCE ?? 0.85;
    this.groundCoinY = this.groundY - (c.GROUND_HEIGHT ?? 26);
    this.magnetSpeed = c.MAGNET_SPEED ?? 360;

    /** @type {Array<{x:number,y:number,phase:number,pulled:boolean}>} */
    this.coins = [];
    this.time = 0;
    this.runCollected = 0;
  }

  reset() {
    this.coins = [];
    this.time = 0;
    this.runCollected = 0;
  }

  _add(x, y) {
    this.coins.push({ x, y, phase: Math.random() * Math.PI * 2, pulled: false });
  }

  /**
   * 새 지면 위에 코인 줄 배치 (착지 여유 구간과 도약 준비 구간은 피함)
   * @param {{x:number,width:number,y:number}} platform
   */
  onPlatformCreated(platform) {
    if (platform.width < 360 || Math.random() > this.lineChance) return;
    const count = 5 + Math.floor(Math.random() * 4); // 5~8개
    const spacing = 28;
    const span = (count - 1) * spacing;
    const minStart = platform.x + 140;
    const maxStart = platform.x + platform.width - 120 - span;
    if (maxStart < minStart) return;
    const startX = minStart + Math.random() * (maxStart - minStart);
    for (let i = 0; i < count; i++) this._add(startX + i * spacing, platform.y - (this.groundY - this.groundCoinY));
  }

  /**
   * 낭떠러지 위 포물선 코인 (점프/갈고리 보상)
   * @param {{startX:number,endX:number,width:number}} gap
   */
  onGapCreated(gap) {
    if (Math.random() > this.gapArcChance) return;
    const count = gap.width >= 200 ? 7 : 5;
    const margin = 14;
    const span = gap.width - margin * 2;
    const peak = gap.width >= 200 ? 84 : 66;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const x = gap.startX + margin + span * t;
      const y = this.groundY - 34 - Math.sin(Math.PI * t) * peak;
      this._add(x, y);
    }
  }

  /**
   * 장애물이 생성되면 겹치는 지면 코인을 치우고, 장애물 위에 포물선 코인을 배치 (점프 보상)
   * @param {{x:number,y:number,width:number,height:number}} obstacle
   */
  onObstacleSpawned(obstacle) {
    const left = obstacle.x - 34;
    const right = obstacle.x + obstacle.width + 34;
    // 장애물 높이 안에 걸치는 코인 제거
    this.coins = this.coins.filter((c) => !(c.x >= left && c.x <= right && c.y > obstacle.y - 22));

    if (Math.random() > this.obstacleArcChance) return;
    const cx = obstacle.x + obstacle.width / 2;
    const count = 5;
    const spacing = 26;
    const base = obstacle.y - 22;                         // 장애물 윗면보다 충분히 위
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      this._add(cx + (i - (count - 1) / 2) * spacing, base - Math.sin(Math.PI * t) * 30);
    }
  }

  /**
   * 이동 / 자석 / 획득 판정
   * @param {number} dt
   * @param {number} speed 월드 스크롤 속도
   * @param {Object} player getHitbox() 를 가진 플레이어
   * @param {{x:number,y:number,radius:number}|null} magnet 코인을 끌어당기는 중심(펫 등)
   * @returns {Array<{x:number,y:number}>} 이번 프레임에 획득한 코인 위치
   */
  update(dt, speed, player, magnet = null) {
    this.time += dt;
    const hb = player && player.state !== 'DEAD' ? player.getHitbox() : null;
    const pad = this.pickupPadding;
    const px = hb ? hb.x + hb.width / 2 : 0;
    const py = hb ? hb.y + hb.height / 2 : 0;
    const got = [];
    const keep = [];

    for (const c of this.coins) {
      c.x -= speed * dt;

      // 자석: 범위 안의 코인을 플레이어 쪽으로 끌어당김
      if (hb && magnet && magnet.radius > 0) {
        const dx = magnet.x - c.x, dy = magnet.y - c.y;
        if (c.pulled || dx * dx + dy * dy <= magnet.radius * magnet.radius) {
          c.pulled = true;
          const dist = Math.hypot(px - c.x, py - c.y) || 1;
          const step = Math.min(dist, this.magnetSpeed * dt);
          c.x += ((px - c.x) / dist) * step;
          c.y += ((py - c.y) / dist) * step;
        }
      }

      if (hb) {
        const hit =
          c.x + this.radius >= hb.x - pad && c.x - this.radius <= hb.x + hb.width + pad &&
          c.y + this.radius >= hb.y - pad && c.y - this.radius <= hb.y + hb.height + pad;
        if (hit) {
          got.push({ x: c.x, y: c.y });
          continue;
        }
      }
      if (c.x > -20) keep.push(c);
    }

    this.coins = keep;
    this.runCollected += got.length;
    return got;
  }

  /**
   * 회전하는 금화 렌더링 (좌우 폭이 줄었다 커지는 방식으로 회전 표현)
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    const r = this.radius;
    ctx.save();
    for (const c of this.coins) {
      if (c.x < -r || c.x > this.logicalWidth + r) continue;
      const spin = Math.abs(Math.cos(this.time * 4 + c.phase));
      const w = Math.max(1.5, r * (0.25 + 0.75 * spin));
      const x = Math.round(c.x), y = Math.round(c.y);

      ctx.fillStyle = '#b8860b';                       // 테두리
      ctx.beginPath(); ctx.ellipse(x, y, w + 1, r + 1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd166';                       // 면
      ctx.beginPath(); ctx.ellipse(x, y, w, r, 0, 0, Math.PI * 2); ctx.fill();
      if (w > 4) {
        ctx.fillStyle = '#fff1b8';                     // 하이라이트
        ctx.fillRect(x - Math.round(w * 0.45), y - Math.round(r * 0.55), 2, Math.round(r * 0.8));
        ctx.fillStyle = '#e0a800';                     // 가운데 홈
        ctx.fillRect(x - 1, y - 3, 2, 6);
      }
    }
    ctx.restore();
  }
}
