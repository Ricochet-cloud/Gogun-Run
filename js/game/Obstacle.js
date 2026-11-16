import { assetLoader } from '../systems/AssetLoader.js';

/**
 * 개별 장애물 클래스
 * 위치, 크기, 히트박스, 이동 및 이미지 에셋/폴백 렌더링을 담당합니다.
 */
export class Obstacle {
  /**
   * @param {Object} typeConfig 장애물 종류 설정 (id, width, height, hitbox)
   * @param {number} groundY 바닥 상단 Y 좌표
   * @param {number} startX 시작 X 좌표 (화면 우측 바깥)
   * @param {Object|null} assetConfig 에셋 설정 (ASSETS_CONFIG.OBSTACLES[type.id])
   */
  constructor(typeConfig, groundY, startX, assetConfig = null) {
    this.id = typeConfig.id;
    this.width = typeConfig.width;
    this.height = typeConfig.height;
    this.hitboxConfig = typeConfig.hitbox;
    this.assetConfig = assetConfig;

    this.x = startX;
    this.y = groundY - this.height;
  }

  /**
   * 이동 업데이트
   * @param {number} dt 경과 시간 (seconds)
   * @param {number} speed 현재 게임 이동 속도 (px/s)
   */
  update(dt, speed) {
    this.x -= speed * dt;
  }

  /**
   * 화면 왼쪽 밖으로 완전히 벗어났는지 확인
   * @returns {boolean}
   */
  isOffScreen() {
    return this.x + this.width < 0;
  }

  /**
   * 충돌 판정용 hitbox 반환
   * @returns {{ x: number, y: number, width: number, height: number }}
   */
  getHitbox() {
    return {
      x: this.x + this.hitboxConfig.offsetX,
      y: this.y + this.hitboxConfig.offsetY,
      width: this.hitboxConfig.width,
      height: this.hitboxConfig.height,
    };
  }

  /**
   * 장애물 렌더링 (에셋 우선 렌더링 및 실패 시 도형 폴백)
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    const img = assetLoader.getImage('obstacle_' + this.id);

    if (img && this.assetConfig) {
      const rw = this.assetConfig.RENDER_WIDTH || this.width;
      const rh = this.assetConfig.RENDER_HEIGHT || this.height;
      const dx = Math.round(this.x + (this.assetConfig.OFFSET_X || 0));
      const dy = Math.round(this.y + (this.assetConfig.OFFSET_Y || 0));

      ctx.drawImage(img, dx, dy, rw, rh);
    } else {
      this._renderFallback(ctx);
    }
  }

  /**
   * 에셋 누락/실패 시 안전한 폴백 렌더링 (절차적 픽셀 아트)
   * @param {CanvasRenderingContext2D} ctx
   */
  _renderFallback(ctx) {
    ctx.save();
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const w = this.width;
    const h = this.height;

    switch (this.id) {
      case 'DEMON_ROCK':
        this._renderDemonRock(ctx, x, y, w, h);
        break;
      case 'WOODEN_SPIKE':
        this._renderWoodenSpike(ctx, x, y, w, h);
        break;
      case 'CURSED_THORNS':
        this._renderCursedThorns(ctx, x, y, w, h);
        break;
      default:
        ctx.fillStyle = '#e63946';
        ctx.fillRect(x, y, w, h);
        break;
    }

    ctx.restore();
  }

  /**
   * 도깨비 바위 폴백 렌더링
   */
  _renderDemonRock(ctx, x, y, w, h) {
    ctx.fillStyle = '#22182c';
    ctx.beginPath();
    ctx.moveTo(x + 4, y + h);
    ctx.lineTo(x, y + h - 8);
    ctx.lineTo(x + 6, y + 4);
    ctx.lineTo(x + 16, y);
    ctx.lineTo(x + w - 4, y + 6);
    ctx.lineTo(x + w, y + h - 6);
    ctx.lineTo(x + w - 2, y + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#3f2d52';
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 6);
    ctx.lineTo(x + 16, y + 2);
    ctx.lineTo(x + w - 6, y + 8);
    ctx.lineTo(x + 14, y + 14);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#d90429';
    ctx.fillRect(x + 8, y + 12, 6, 2);
    ctx.fillRect(x + 12, y + 14, 2, 8);
    ctx.fillRect(x + 10, y + 20, 6, 2);
    ctx.fillRect(x + 18, y + 10, 4, 2);

    ctx.fillStyle = '#ff758f';
    ctx.fillRect(x + 12, y + 15, 2, 3);
  }

  /**
   * 목책 말뚝 장애물 폴백 렌더링
   */
  _renderWoodenSpike(ctx, x, y, w, h) {
    ctx.fillStyle = '#5c3d2e';
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 10);
    ctx.lineTo(x + 1, y + h);
    ctx.lineTo(x + 10, y + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#7f5539';
    ctx.beginPath();
    ctx.moveTo(x + 16, y);
    ctx.lineTo(x + 10, y + h);
    ctx.lineTo(x + 22, y + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#5c3d2e';
    ctx.beginPath();
    ctx.moveTo(x + 27, y + 8);
    ctx.lineTo(x + 21, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ede0d4';
    ctx.fillRect(x + 2, y + 26, w - 4, 4);
    ctx.fillStyle = '#9c6644';
    ctx.fillRect(x + 2, y + 28, w - 4, 1);

    ctx.fillStyle = '#d90429';
    ctx.fillRect(x + 14, y + 30, 4, 8);
  }

  /**
   * 저주 가시 덤불 폴백 렌더링
   */
  _renderCursedThorns(ctx, x, y, w, h) {
    ctx.fillStyle = '#1c0f13';
    ctx.fillRect(x, y + h - 6, w, 6);

    ctx.fillStyle = '#780000';
    for (let i = 0; i < 4; i++) {
      const sx = x + 3 + i * 11;
      ctx.beginPath();
      ctx.moveTo(sx + 5, y + (i % 2 === 0 ? 0 : 5));
      ctx.lineTo(sx, y + h);
      ctx.lineTo(sx + 10, y + h);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(sx + 4, y + (i % 2 === 0 ? 1 : 6), 2, 3);
      ctx.fillStyle = '#780000';
    }
  }
}
