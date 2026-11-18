import { assetLoader } from '../systems/AssetLoader.js';

/**
 * 플레이어를 따라다니는 펫 (PetCompanion)
 * - 플레이어의 뒤쪽 위에 부드럽게 따라붙고 위아래로 둥실거린다.
 * - 스프라이트 시트는 가로로 frames 장 (frameWidth × frameHeight) 이어 붙인 형식.
 * - magnet 값이 있으면 그 반경 안의 코인을 끌어당긴다 (CoinSystem 이 사용).
 */
export class PetCompanion {
  constructor() {
    /** @type {Object|null} ShopManager 의 pet 아이템 */
    this.item = null;
    this.x = 0;
    this.y = 0;
    this.time = 0;
    this.initialized = false;
  }

  static spriteKey(id) {
    return `pet_${id}`;
  }

  /** 펫 장착/해제 (null = 없음) */
  setPet(item) {
    this.item = item || null;
    this.initialized = false;
  }

  /** 자석 판정 중심/반경 (펫이 없거나 자석이 없으면 null) */
  getMagnet() {
    if (!this.item || !(this.item.magnet > 0)) return null;
    return { x: this.x, y: this.y, radius: this.item.magnet };
  }

  /**
   * @param {number} dt
   * @param {Object} player Player 인스턴스
   */
  update(dt, player) {
    if (!this.item || !player) return;
    this.time += dt;
    const tx = player.x - 22;
    const ty = player.y - 14 + Math.sin(this.time * 3.2) * 4;
    if (!this.initialized) {
      this.x = tx; this.y = ty; this.initialized = true;
      return;
    }
    const k = Math.min(1, dt * 7);          // 지연을 둔 따라붙기
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    const it = this.item;
    if (!it) return;
    const img = assetLoader.getImage(PetCompanion.spriteKey(it.id));
    const fw = it.frameWidth, fh = it.frameHeight;
    const dx = Math.round(this.x - fw / 2);
    const dy = Math.round(this.y - fh / 2);

    if (img) {
      const frame = Math.floor(this.time * it.fps) % it.frames;
      ctx.drawImage(img, frame * fw, 0, fw, fh, dx, dy, fw, fh);
    } else {
      // 이미지를 못 불러왔을 때의 단순 폴백 (작은 불꽃 구슬)
      ctx.save();
      ctx.fillStyle = '#74c0fc';
      ctx.beginPath();
      ctx.arc(Math.round(this.x), Math.round(this.y), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
