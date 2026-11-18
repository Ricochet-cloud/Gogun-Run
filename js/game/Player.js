import { Physics } from './Physics.js';
import { assetLoader } from '../systems/AssetLoader.js';

/**
 * 플레이어 상태 열거형 (STEP 5 확장)
 */
export const PlayerState = Object.freeze({
  RUNNING: 'RUNNING',   // 지상 달리기
  JUMPING: 'JUMPING',   // 일반 점프 상승
  FALLING: 'FALLING',   // 공중 하강 또는 낭떠러지 추락 중
  HOOKED: 'HOOKED',     // 갈고리 로프 연결 및 진자 회전
  AIRBORNE: 'AIRBORNE', // 갈고리 해제 후 공중제비 관성 비행
  DEAD: 'DEAD',         // 사망 (장애물 충돌 또는 추락)
});

/**
 * 플레이어 캐릭터 클래스
 */
export class Player {
  /**
   * @param {Object} playerConfig 플레이어 물리 및 크기 설정
   * @param {Object} physicsConfig 물리 파라미터
   * @param {number} groundY 바닥 상단 Y 좌표
   * @param {Object|null} assetConfig 에셋 설정 (ASSETS_CONFIG.PLAYER)
   */
  constructor(playerConfig, physicsConfig, groundY, assetConfig = null) {
    this.config = playerConfig;
    this.physics = physicsConfig;
    this.groundY = groundY;
    this.assetConfig = assetConfig;
    this.spriteKey = 'player'; // AssetLoader 이미지 키 (캐릭터 선택 시 교체)

    this.width = playerConfig.WIDTH;
    this.height = playerConfig.HEIGHT;
    this.startX = playerConfig.START_X;
    this.startY = playerConfig.START_Y;

    this.x = this.startX;
    this.y = this.startY;
    this.vy = 0;

    this.state = PlayerState.RUNNING;
    this.isOnGround = true;

    // 공중제비 및 시각적 회전 각도 (라디안)
    this.rotationAngle = 0;
    this.somersaultSpeed = 12.0;

    // 스프라이트 애니메이션 상태
    this.currentAnim = 'RUN';
    this.animFrameIndex = 0;
    this.animTimer = 0;
    this.landTimer = 0;

    // 사운드 및 외부 이벤트 연동 훅
    this.onJump = null;
    this.onLand = null;
  }

  /**
   * 캐릭터(스프라이트 시트) 교체
   * @param {string} spriteKey AssetLoader 이미지 키
   * @param {Object} assetConfig 해당 캐릭터의 에셋 설정
   */
  setCharacter(spriteKey, assetConfig) {
    this.spriteKey = spriteKey;
    this.assetConfig = assetConfig;
    this.animFrameIndex = 0;
    this.animTimer = 0;
  }

  /**
   * 애니메이션 전환
   * @param {'RUN' | 'JUMP' | 'LAND' | 'DEAD'} animName
   */
  setAnimation(animName) {
    if (this.currentAnim !== animName) {
      this.currentAnim = animName;
      this.animFrameIndex = 0;
      this.animTimer = 0;
    }
  }

  /**
   * 충돌 판정용 hitbox 반환
   * 이미지 크기나 회전과 무관하게 안정적인 물리 AABB 반환
   * @returns {{ x: number, y: number, width: number, height: number }}
   */
  getHitbox() {
    const pad = this.config.HITBOX || { PADDING_X: 6, PADDING_TOP: 4, PADDING_BOTTOM: 2 };
    return {
      x: this.x + pad.PADDING_X,
      y: this.y + pad.PADDING_TOP,
      width: this.width - pad.PADDING_X * 2,
      height: this.height - pad.PADDING_TOP - pad.PADDING_BOTTOM,
    };
  }

  /**
   * 일반 점프 수행
   * @returns {boolean} 점프 성공 여부
   */
  jump() {
    // 지상에 있거나 달리는 중일 때만 점프 가능 (공중 중복 점프 방지)
    if (!this.isOnGround || this.state === PlayerState.DEAD || this.state === PlayerState.HOOKED) {
      return false;
    }

    this.vy = this.physics.JUMP_FORCE;
    this.isOnGround = false;
    this.state = PlayerState.JUMPING;
    this.rotationAngle = 0;
    this.setAnimation('JUMP');

    if (typeof this.onJump === 'function') {
      this.onJump();
    }
    return true;
  }

  /**
   * 갈고리 연결 상태 진입
   */
  setHookedState() {
    this.state = PlayerState.HOOKED;
    this.isOnGround = false;
    this.setAnimation('JUMP');
  }

  /**
   * 갈고리 해제 후 공중제비 관성 비행 상태 진입
   * @param {number} launchVy 해제 수직 속도
   * @param {number} initialAngle 시작 회전각
   */
  setAirborneState(launchVy, initialAngle = 0) {
    this.state = PlayerState.AIRBORNE;
    this.isOnGround = false;
    this.vy = launchVy;
    this.rotationAngle = initialAngle;
    this.setAnimation('JUMP');
  }

  /**
   * 플랫폼 상단 착지 처리
   * @param {number} surfaceY 플랫폼 윗면 Y 좌표
   */
  land(surfaceY) {
    this.y = surfaceY - this.height;
    this.impactVy = this.vy; // 착지 직전 낙하 속도 (착지 연출 강도에 사용)
    this.vy = 0;
    this.isOnGround = true;
    this.state = PlayerState.RUNNING;
    this.rotationAngle = 0;

    // 착지 애니메이션 (0.12초간 LAND 재생 후 RUN 복귀)
    this.setAnimation('LAND');
    this.landTimer = 0.12;

    if (typeof this.onLand === 'function') {
      this.onLand();
    }
  }

  /**
   * 사망 상태 설정 (장애물 충돌 또는 추락)
   */
  die() {
    this.state = PlayerState.DEAD;
    this.rotationAngle = 0;
    this.setAnimation('DEAD');
  }

  /**
   * 플레이어 물리 및 애니메이션 프레임 업데이트
   * @param {number} dt 경과 시간 (seconds)
   * @param {Array<Object>|null} platforms 활성 플랫폼 목록
   */
  update(dt, platforms = null) {
    if (this.state === PlayerState.DEAD) {
      return;
    }

    const prevY = this.y;

    // 1. 갈고리 연결 상태: 위치 및 회전은 HookSystem이 주도
    if (this.state === PlayerState.HOOKED) {
      this.isOnGround = false;
    }
    // 2. 공중제비 비행 (AIRBORNE)
    else if (this.state === PlayerState.AIRBORNE) {
      this.vy = Physics.applyGravity(
        this.vy,
        dt,
        this.physics.GRAVITY,
        this.physics.MAX_FALL_SPEED
      );
      this.y += this.vy * dt;

      // 공중제비 360도 연속 회전 애니메이션
      this.rotationAngle += this.somersaultSpeed * dt;

      // 스윙으로 밀려난 X 좌표를 기본 시작 위치로 부드럽게 복귀
      if (Math.abs(this.x - this.startX) > 1) {
        this.x += (this.startX - this.x) * Math.min(2.0 * dt, 1);
      }

      this._checkLanding(prevY, platforms);
    }
    // 3. 일반 점프 (JUMPING) 또는 하강 (FALLING)
    else if (this.state === PlayerState.JUMPING || this.state === PlayerState.FALLING) {
      this.vy = Physics.applyGravity(
        this.vy,
        dt,
        this.physics.GRAVITY,
        this.physics.MAX_FALL_SPEED
      );
      this.y += this.vy * dt;

      if (this.vy > 0 && this.state === PlayerState.JUMPING) {
        this.state = PlayerState.FALLING;
      }

      if (Math.abs(this.x - this.startX) > 1) {
        this.x += (this.startX - this.x) * Math.min(3.0 * dt, 1);
      }

      this._checkLanding(prevY, platforms);
    }
    // 4. 지상 달리기 (RUNNING)
    else if (this.state === PlayerState.RUNNING) {
      // 발 아래 지면(플랫폼) 존재 여부 검사: 지면이 없으면 낭떠러지 추락(FALLING)으로 전환
      if (platforms) {
        const footLeft = this.x + 6;
        const footRight = this.x + this.width - 6;
        let hasSupport = false;

        for (const platform of platforms) {
          if (footRight >= platform.x && footLeft <= platform.x + platform.width) {
            hasSupport = true;
            break;
          }
        }

        // 지면을 벗어나 낭떠러지로 진입했을 때
        if (!hasSupport) {
          this.isOnGround = false;
          this.state = PlayerState.FALLING;
          this.vy = 0;
          this.setAnimation('JUMP');
        }
      }

      // 착지 모션 제어
      if (this.landTimer > 0) {
        this.landTimer -= dt;
        if (this.landTimer <= 0) {
          this.setAnimation('RUN');
        }
      } else if (this.currentAnim !== 'RUN') {
        this.setAnimation('RUN');
      }
    }

    // 5. 스프라이트 애니메이션 프레임 전진
    const animConfig = this.assetConfig?.ANIMATIONS?.[this.currentAnim];
    if (animConfig && animConfig.FRAMES && animConfig.FRAMES.length > 0) {
      const fps = animConfig.FPS || 10;
      const frameDuration = 1 / fps;
      this.animTimer += dt;

      if (this.animTimer >= frameDuration) {
        this.animTimer -= frameDuration;
        if (this.animFrameIndex < animConfig.FRAMES.length - 1) {
          this.animFrameIndex++;
        } else if (animConfig.LOOP) {
          this.animFrameIndex = 0;
        }
      }
    }
  }

  /**
   * 플랫폼 착지 판정 헬퍼
   * @param {number} prevY
   * @param {Array<Object>|null} platforms
   */
  _checkLanding(prevY, platforms) {
    if (platforms) {
      const collision = Physics.checkPlatformLanding(
        this.x,
        this.y,
        prevY,
        this.width,
        this.height,
        this.vy,
        platforms
      );
      if (collision.onGround && collision.platform) {
        this.land(collision.platform.y);
      }
    } else {
      const collision = Physics.checkGroundCollision(this.y, this.height, this.groundY);
      if (collision.onGround) {
        this.land(this.groundY);
      }
    }
  }

  /**
   * 플레이어 렌더링 (공중 회전 및 에셋/폴백 지원)
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    const isRotating = this.rotationAngle !== 0;

    // STEP 6 디버그: 실제 위치와 크기 확인 (첫 프레임만 로그)
    if (!window.__DEBUG_PLAYER_LOGGED__) {
      console.log('[Player Render Debug]');
      console.log('  위치 X:', this.x);
      console.log('  위치 Y:', this.y);
      console.log('  크기:', `${this.width}×${this.height}`);
      console.log('  바닥 Y:', this.groundY);
      console.log('  플레이어 하단:', this.y + this.height);
      console.log('  발이 바닥에 닿았는가?', this.y + this.height === this.groundY ? '✓ YES' : '✗ NO');
      window.__DEBUG_PLAYER_LOGGED__ = true;
    }

    if (isRotating) {
      ctx.save();
      const cx = Math.round(this.x + this.width / 2);
      const cy = Math.round(this.y + this.height / 2);
      ctx.translate(cx, cy);
      ctx.rotate(this.rotationAngle);
      this._drawSprite(ctx, -this.width / 2, -this.height / 2);
      ctx.restore();
    } else {
      this._drawSprite(ctx, this.x, this.y);
    }
  }

  /**
   * 단일 스프라이트 내부 드로잉
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} drawX
   * @param {number} drawY
   */
  _drawSprite(ctx, drawX, drawY) {
    const img = assetLoader.getImage(this.spriteKey);

    if (img && this.assetConfig) {
      const animConfig = this.assetConfig.ANIMATIONS?.[this.currentAnim];
      const frames = animConfig?.FRAMES || [0];
      const frameIdx = frames[this.animFrameIndex] || 0;

      const fw = this.assetConfig.FRAME_WIDTH || 48;
      const fh = this.assetConfig.FRAME_HEIGHT || 48;
      const sx = frameIdx * fw;
      const sy = 0;

      const rw = this.assetConfig.RENDER_WIDTH || fw;
      const rh = this.assetConfig.RENDER_HEIGHT || fh;
      const dx = Math.round(drawX + (this.assetConfig.OFFSET_X || 0));
      const dy = Math.round(drawY + (this.assetConfig.OFFSET_Y || 0));

      if (this.rotationAngle !== 0) {
        this._drawRotatedSprite(ctx, img, sx, sy, fw, fh, dx, dy, rw, rh);
      } else {
        ctx.drawImage(img, sx, sy, fw, fh, dx, dy, rw, rh);
      }

      // STEP 6 디버그: 플레이어 경계선 그리기 (히트박스 확인)
      if (window.__DEBUG_SHOW_BOUNDS__) {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 1;
        ctx.strokeRect(dx, dy, rw, rh);

        // 바닥 참조선
        ctx.strokeStyle = '#00ff00';
        ctx.beginPath();
        ctx.moveTo(0, this.groundY);
        ctx.lineTo(640, this.groundY);
        ctx.stroke();
      }
    } else {
      this._renderFallbackAt(ctx, drawX, drawY);
    }
  }

  /**
   * 회전 중 스프라이트 그리기.
   * 도트 이미지를 최근접 보간(smoothing off)으로 바로 회전시키면 픽셀이 찢어져 깨져 보이므로,
   * 먼저 4배로 또렷하게 키운 임시 캔버스에 그린 뒤 그것을 회전/축소해서 그린다.
   */
  _drawRotatedSprite(ctx, img, sx, sy, fw, fh, dx, dy, rw, rh) {
    const SS = 4;
    if (!this._rotCanvas) {
      this._rotCanvas = document.createElement('canvas');
      this._rotCtx = this._rotCanvas.getContext('2d');
    }
    const c = this._rotCanvas;
    if (c.width !== fw * SS || c.height !== fh * SS) {
      c.width = fw * SS;
      c.height = fh * SS;
    }
    const oc = this._rotCtx;
    oc.clearRect(0, 0, c.width, c.height);
    oc.imageSmoothingEnabled = false;
    oc.drawImage(img, sx, sy, fw, fh, 0, 0, c.width, c.height);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, 0, 0, c.width, c.height, dx, dy, rw, rh);
    ctx.imageSmoothingEnabled = false;
  }

  /**
   * 에셋 누락 시 폴백 렌더링
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   */
  _renderFallbackAt(ctx, x, y) {
    ctx.save();
    const isDead = this.state === PlayerState.DEAD;

    let renderY = y;
    let legOffset = 0;

    if (this.isOnGround && !isDead) {
      const bounce = Math.sin(this.animTimer * (this.config.RUN_BOUNCE_SPEED || 14));
      renderY += bounce * (this.config.RUN_BOUNCE_AMOUNT || 2);
      legOffset = Math.sin(this.animTimer * (this.config.RUN_BOUNCE_SPEED || 14)) * 5;
    }

    const rx = Math.round(x);
    const ry = Math.round(renderY);
    const w = this.width;

    // 1. 하오리 몸통
    const bodyHeight = 22;
    const bodyY = ry + 14;
    ctx.fillStyle = '#10141a';
    ctx.fillRect(rx + 4, bodyY, w - 8, bodyHeight);

    const blockSize = 5;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        const isGreen = (r + c) % 2 === 0;
        ctx.fillStyle = isGreen ? '#2a9d8f' : '#1d2a23';
        ctx.fillRect(rx + 5 + c * blockSize, bodyY + 2 + r * 5, blockSize, 5);
      }
    }

    // 2. 머리 및 얼굴
    ctx.fillStyle = '#4a1525';
    ctx.fillRect(rx + 6, ry, w - 12, 14);
    ctx.fillStyle = '#851e3e';
    ctx.fillRect(rx + 10, ry + 2, 6, 4);

    ctx.fillStyle = isDead ? '#dfc8b4' : '#fbd4b4';
    ctx.fillRect(rx + 10, ry + 6, w - 18, 8);

    ctx.fillStyle = '#a82835';
    ctx.fillRect(rx + 12, ry + 7, 3, 3);

    if (isDead) {
      ctx.fillStyle = '#780000';
      ctx.fillRect(rx + 20, ry + 7, 1, 1);
      ctx.fillRect(rx + 22, ry + 7, 1, 1);
      ctx.fillRect(rx + 21, ry + 8, 1, 1);
      ctx.fillRect(rx + 20, ry + 9, 1, 1);
      ctx.fillRect(rx + 22, ry + 9, 1, 1);
    } else {
      ctx.fillStyle = '#851e3e';
      ctx.fillRect(rx + 20, ry + 8, 3, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rx + 21, ry + 9, 1, 1);
    }

    // 3. 일륜도
    ctx.fillStyle = '#8d99ae';
    ctx.fillRect(rx + 1, bodyY + 12, 6, 3);
    ctx.fillStyle = '#111111';
    ctx.fillRect(rx - 2, bodyY + 11, 4, 4);

    // 4. 다리
    const legWidth = 5;
    const legHeight = 12;
    const legBaseY = ry + 36;

    if (this.isOnGround && !isDead) {
      ctx.fillStyle = '#fbd4b4';
      ctx.fillRect(rx + 18 + legOffset, legBaseY, legWidth, legHeight);
      ctx.fillStyle = '#e76f51';
      ctx.fillRect(rx + 18 + legOffset, legBaseY + legHeight - 2, legWidth + 2, 2);

      ctx.fillStyle = '#c79f82';
      ctx.fillRect(rx + 10 - legOffset, legBaseY, legWidth, legHeight);
      ctx.fillStyle = '#b74f35';
      ctx.fillRect(rx + 10 - legOffset, legBaseY + legHeight - 2, legWidth + 2, 2);
    } else {
      ctx.fillStyle = isDead ? '#dfc8b4' : '#fbd4b4';
      ctx.fillRect(rx + 12, legBaseY - 2, legWidth, legHeight - 2);
      ctx.fillRect(rx + 18, legBaseY - 4, legWidth, legHeight - 4);
      ctx.fillStyle = '#e76f51';
      ctx.fillRect(rx + 12, legBaseY + legHeight - 4, legWidth + 2, 2);
      ctx.fillRect(rx + 18, legBaseY + legHeight - 6, legWidth + 2, 2);
    }

    ctx.restore();
  }

  /**
   * 위치 및 상태 초기화
   */
  reset() {
    this.x = this.startX;
    this.y = this.startY;
    this.vy = 0;
    this.rotationAngle = 0;
    this.state = PlayerState.RUNNING;
    this.isOnGround = true;
    this.animTimer = 0;
    this.landTimer = 0;
    this.setAnimation('RUN');
  }
}
