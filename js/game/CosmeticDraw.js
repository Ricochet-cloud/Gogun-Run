/**
 * 꾸미기 공용 그리기 모듈 (CosmeticDraw)
 * - 입자 모양(먼지/니어미스 파편)과 갈고리 와이어 스타일을 캔버스로 그린다.
 * - 게임 화면(EffectsSystem / Renderer)과 상점 미리보기(ShopUI)가 같은 함수를 써서 보이는 모습이 똑같다.
 * - 모든 이름은 화이트리스트로 검증한다 (items.json 의 알 수 없는 값은 기본값으로 대체).
 */

export const PARTICLE_SHAPES = Object.freeze(['square', 'petal', 'heart', 'star', 'spark', 'bubble', 'leaf', 'note']);
export const ROPE_STYLES = Object.freeze(['line', 'dashed', 'chain', 'zigzag', 'wave', 'double', 'beads', 'rainbow']);
export const TIP_SHAPES = Object.freeze(['circle', 'star', 'heart', 'diamond']);

/** 입자 크기(size)에 곱해서 모양 반지름으로 쓰는 배율 */
export const SHAPE_SCALE = 2.1;

const TAU = Math.PI * 2;

/**
 * 입자 한 개 그리기
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} shape PARTICLE_SHAPES 중 하나
 * @param {number} x 중심 X
 * @param {number} y 중심 Y
 * @param {number} s 반지름 비슷한 크기 (px)
 * @param {string} color
 * @param {number} rot 회전 (rad)
 */
export function drawShape(ctx, shape, x, y, s, color, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  switch (shape) {
    case 'petal':
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.95, s * 0.5, 0, 0, TAU);
      ctx.fill();
      break;

    case 'heart':
      ctx.beginPath();
      ctx.moveTo(0, s * 0.85);
      ctx.bezierCurveTo(-s * 1.15, s * 0.1, -s * 0.65, -s * 0.85, 0, -s * 0.3);
      ctx.bezierCurveTo(s * 0.65, -s * 0.85, s * 1.15, s * 0.1, 0, s * 0.85);
      ctx.fill();
      break;

    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? s : s * 0.45;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'spark':
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.2, -s * 0.2);
      ctx.lineTo(s, 0); ctx.lineTo(s * 0.2, s * 0.2);
      ctx.lineTo(0, s); ctx.lineTo(-s * 0.2, s * 0.2);
      ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.2, -s * 0.2);
      ctx.closePath();
      ctx.fill();
      break;

    case 'bubble': {
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * 0.22;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.8, 0, TAU); ctx.fill();
      ctx.globalAlpha = a0;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.8, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(-s * 0.4), Math.round(-s * 0.4), 1.5, 1.5);
      break;
    }

    case 'leaf':
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(0, -s * 0.9, s, 0);
      ctx.quadraticCurveTo(0, s * 0.9, -s, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-s * 0.8, 0); ctx.lineTo(s * 0.8, 0); ctx.stroke();
      break;

    case 'note':
      ctx.beginPath(); ctx.ellipse(-s * 0.3, s * 0.55, s * 0.45, s * 0.32, -0.4, 0, TAU); ctx.fill();
      ctx.fillRect(s * 0.05, -s * 0.85, Math.max(1, s * 0.2), s * 1.4);
      ctx.beginPath();
      ctx.moveTo(s * 0.25, -s * 0.85);
      ctx.quadraticCurveTo(s * 0.95, -s * 0.5, s * 0.55, -s * 0.05);
      ctx.lineTo(s * 0.25, -s * 0.35);
      ctx.closePath();
      ctx.fill();
      break;

    default: {   // 'square' — 기본 픽셀
      const d = Math.max(1, Math.round(s));
      ctx.fillRect(-d / 2, -d / 2, d, d);
    }
  }
  ctx.restore();
}

/** 와이어 끝(접촉점) 모양 */
export function drawTip(ctx, shape, x, y, color) {
  if (shape === 'star') drawShape(ctx, 'star', x, y, 5.5, color, 0);
  else if (shape === 'heart') drawShape(ctx, 'heart', x, y, 5, color, 0);
  else if (shape === 'diamond') drawShape(ctx, 'spark', x, y, 6, color, 0);
  else {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function polyline(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.stroke();
}

/**
 * 와이어 한 줄 그리기
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x1 시작(플레이어) X
 * @param {number} y1
 * @param {number} x2 끝(앵커) X
 * @param {number} y2
 * @param {{style?: string, glow?: string, core?: string, tip?: string, tipShape?: string}} rs 스타일
 * @param {number} t 시간(초) — 애니메이션용
 */
export function drawRope(ctx, x1, y1, x2, y2, rs = {}, t = 0) {
  const style = ROPE_STYLES.includes(rs.style) ? rs.style : 'line';
  const glow = rs.glow || 'rgba(6, 214, 160, 0.45)';
  const core = rs.core || '#ffffff';
  const tip = rs.tip || '#ffd166';
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const at = (d, off = 0) => [x1 + ux * d + nx * off, y1 + uy * d + ny * off];

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const straight = (w, color, dash = null, dashOffset = 0) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.setLineDash(dash || []);
    ctx.lineDashOffset = dashOffset;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);
  };

  switch (style) {
    case 'dashed':
      straight(4, glow);
      straight(2, core, [7, 5], -t * 70);
      break;

    case 'chain': {
      straight(3, glow);
      for (let d = 3, i = 0; d < len; d += 6.5, i++) {
        const [cx, cy] = at(d);
        const ang = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.strokeStyle = core;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        if (i % 2 === 0) ctx.ellipse(0, 0, 4.2, 2.6, 0, 0, TAU);
        else ctx.ellipse(0, 0, 2.4, 1.4, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }

    case 'zigzag': {
      // 번개: 매 프레임 살짝 다른 꺾임 (20fps 로 깜빡)
      const seed = Math.floor(t * 20);
      const pts = [[x1, y1]];
      for (let d = 12, i = 1; d < len - 6; d += 12, i++) {
        const r = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
        const off = (r - Math.floor(r) - 0.5) * 11;
        pts.push(at(d, off));
      }
      pts.push([x2, y2]);
      ctx.strokeStyle = glow; ctx.lineWidth = 5; polyline(ctx, pts);
      ctx.strokeStyle = core; ctx.lineWidth = 1.6; polyline(ctx, pts);
      break;
    }

    case 'wave': {
      const pts = [];
      const fade = (d) => Math.min(1, d / 14, (len - d) / 14);
      for (let d = 0; d <= len; d += 3) pts.push(at(d, Math.sin(d * 0.16 - t * 9) * 3.4 * fade(d)));
      ctx.strokeStyle = glow; ctx.lineWidth = 5; polyline(ctx, pts);
      ctx.strokeStyle = core; ctx.lineWidth = 1.6; polyline(ctx, pts);
      break;
    }

    case 'double': {
      const a = [], b = [];
      const fade = (d) => Math.min(1, d / 10, (len - d) / 10);
      for (let d = 0; d <= len; d += 3) {
        const off = Math.sin(d * 0.22 - t * 7) * 3.2 * fade(d);
        a.push(at(d, off));
        b.push(at(d, -off));
      }
      ctx.strokeStyle = glow; ctx.lineWidth = 3; polyline(ctx, a); polyline(ctx, b);
      ctx.strokeStyle = core; ctx.lineWidth = 1.3; polyline(ctx, a);
      ctx.strokeStyle = tip; polyline(ctx, b);
      break;
    }

    case 'beads': {
      straight(1.2, glow);
      for (let d = 4, i = 0; d < len; d += 8.5, i++) {
        const [cx, cy] = at(d);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(cx, cy, 3.6, 0, TAU); ctx.fill();
        ctx.fillStyle = i % 4 === 0 ? tip : core;
        ctx.beginPath(); ctx.arc(cx, cy, 2.3, 0, TAU); ctx.fill();
      }
      break;
    }

    case 'rainbow': {
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${Math.floor((i * 60 + t * 140) % 360)}, 100%, 62%)`);
      straight(5, g);
      straight(1.4, 'rgba(255,255,255,0.9)');
      break;
    }

    default:     // 'line'
      straight(4, glow);
      straight(1.5, core);
  }

  drawTip(ctx, rs.tipShape, x2, y2, style === 'rainbow' ? '#ffffff' : tip);
  ctx.restore();
}
