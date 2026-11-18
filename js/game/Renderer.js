import { drawRope } from './CosmeticDraw.js';
import { assetLoader } from '../systems/AssetLoader.js';

/**
 * Canvas 렌더링 및 해상도/스케일링/에셋 렌더링 관리 모듈
 */
export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} config 전역 게임 설정 (GAME_CONFIG)
   * @param {Object|null} assetsConfig 에셋 전역 설정 (ASSETS_CONFIG)
   */
  constructor(canvas, config, assetsConfig = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config;
    this.assetsConfig = assetsConfig;

    this.logicalWidth = config.CANVAS.LOGICAL_WIDTH;
    this.logicalHeight = config.CANVAS.LOGICAL_HEIGHT;
    this.aspectRatio = config.CANVAS.ASPECT_RATIO;
    this.groundY = config.WORLD.GROUND_Y;

    // 캔버스 논리 해상도 고정
    this.canvas.width = this.logicalWidth;
    this.canvas.height = this.logicalHeight;

    // 픽셀 스무딩 비활성화 (선명한 도트 표현)
    this._disableSmoothing();

    // 임시 배경용 별 좌표 생성 (폴백용)
    this._stars = this._generateStars(28);

    // 패럴랙스 레이어별 누적 스크롤 오프셋 관리
    this._parallaxOffsets = new Map();

    // UI 애니메이션 타이머 (텍스트 점멸용)
    this._uiTimer = 0;

    // 시각 피드백 및 파티클 시스템 (STEP 6)
    this.shakeDuration = 0;
    this.shakeIntensity = 0;
    this.hitFlashAlpha = 0;
    this.fallDarkness = 0;
    /** @type {Array<{ x: number, y: number, vx: number, vy: number, size: number, color: string, life: number, maxLife: number }>} */
    this.particles = [];
  }

  /**
   * 시각 효과 초기화 (게임 시작/재시작)
   */
  resetEffects() {
    this.shakeDuration = 0;
    this.shakeIntensity = 0;
    this.hitFlashAlpha = 0;
    this.fallDarkness = 0;
    this.particles = [];
  }

  /**
   * 피격 시각 피드백 트리거 (화면 흔들림 및 붉은 섬광)
   */
  triggerHitEffect() {
    this.shakeDuration = 0.28;
    this.shakeIntensity = 8;
    this.hitFlashAlpha = 0.55;
  }

  /**
   * 낭떠러지 추락 시각 피드백 트리거 (암전 비네트)
   */
  triggerFallEffect() {
    this.fallDarkness = 0.75;
  }

  /**
   * 착지 먼지 이펙트 생성
   * @param {number} x
   * @param {number} y
   */
  spawnDust(x, y) {
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 16,
        y: y - 2,
        vx: (Math.random() - 0.5) * 90,
        vy: -Math.random() * 35 - 15,
        size: Math.random() < 0.5 ? 2 : 3,
        color: Math.random() < 0.5 ? '#cbd5e1' : '#94a3b8',
        life: 0.18,
        maxLife: 0.18,
      });
    }
  }

  /**
   * 갈고리 연결 스파크 이펙트 생성
   * @param {number} x
   * @param {number} y
   */
  spawnSparks(x, y) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 70 + Math.random() * 90;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() < 0.5 ? 2 : 3,
        color: Math.random() < 0.4 ? '#ffd166' : '#06d6a0',
        life: 0.26,
        maxLife: 0.26,
      });
    }
  }

  /**
   * 픽셀 선명도 유지를 위한 스무딩 비활성화
   */
  _disableSmoothing() {
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.mozImageSmoothingEnabled = false;
    this.ctx.webkitImageSmoothingEnabled = false;
    this.ctx.msImageSmoothingEnabled = false;
  }

  /**
   * 폴백 배경용 별 좌표 목록 생성
   * @param {number} count
   */
  _generateStars(count) {
    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.floor((i * 97 + 23) % this.logicalWidth),
        y: Math.floor((i * 47 + 11) % (this.groundY - 40)),
        size: i % 3 === 0 ? 2 : 1,
        alpha: 0.4 + (i % 5) * 0.12,
      });
    }
    return stars;
  }

  /**
   * 캔버스 크기 반응형 조정 (종횡비 유지 및 중앙 정렬 확대, visualViewport 지원)
   * @param {number|null} containerWidth
   * @param {number|null} containerHeight
   */
  handleResize(containerWidth = null, containerHeight = null) {
    const vw = (typeof window !== 'undefined' && window.visualViewport)
      ? window.visualViewport.width
      : (typeof window !== 'undefined' ? window.innerWidth : this.logicalWidth);
    const vh = (typeof window !== 'undefined' && window.visualViewport)
      ? window.visualViewport.height
      : (typeof window !== 'undefined' ? window.innerHeight : this.logicalHeight);

    const targetWidth = containerWidth !== null ? containerWidth : vw;
    const targetHeight = containerHeight !== null ? containerHeight : vh;

    const targetRatio = this.aspectRatio;
    const padding = this.config.CANVAS.TARGET_SCALE_PADDING || 0.96;

    let displayWidth = targetWidth * padding;
    let displayHeight = displayWidth / targetRatio;

    if (displayHeight > targetHeight * padding) {
      displayHeight = targetHeight * padding;
      displayWidth = displayHeight * targetRatio;
    }

    const wPx = `${Math.floor(displayWidth)}px`;
    const hPx = `${Math.floor(displayHeight)}px`;

    this.canvas.style.width = wPx;
    this.canvas.style.height = hPx;

    // 뷰포트 및 UI 오버레이 크기 동기화
    if (typeof document !== 'undefined') {
      const viewport = document.getElementById('game-viewport');
      if (viewport) {
        viewport.style.width = wPx;
        viewport.style.height = hPx;
      }
    }

    this._disableSmoothing();
  }

  /**
   * 화면 지우기 (화면 흔들림 변환 적용)
   */
  clear() {
    this.ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
    this.ctx.save();
    if (this.shakeDuration > 0) {
      const offsetX = (Math.random() * 2 - 1) * this.shakeIntensity;
      const offsetY = (Math.random() * 2 - 1) * this.shakeIntensity;
      this.ctx.translate(offsetX, offsetY);
    }
  }

  /**
   * 포스트 렌더링 효과 (파티클, 화면 흔들림 복원, 피격 섬광, 추락 암전)
   * @param {number} dt 경과 시간 (seconds)
   */
  renderPostEffects(dt = 0.016) {
    const ctx = this.ctx;

    // 1. 파티클 업데이트 및 렌더링
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1.0;

    // 2. 화면 흔들림 캔버스 변환 복원
    ctx.restore();

    // 3. 흔들림 잔여 시간 차감
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
    }

    // 4. 피격 시 붉은 섬광 오버레이 (Red hit flash)
    if (this.hitFlashAlpha > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(230, 57, 70, ${this.hitFlashAlpha.toFixed(2)})`;
      ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
      ctx.restore();
      this.hitFlashAlpha = Math.max(0, this.hitFlashAlpha - dt * 2.2);
    }

    // 5. 낭떠러지 추락 시 암전 비네트 오버레이 (Fall darkness)
    if (this.fallDarkness > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(11, 12, 16, ${this.fallDarkness.toFixed(2)})`;
      ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
      ctx.restore();
      this.fallDarkness = Math.max(0, this.fallDarkness - dt * 1.6);
    }
  }

  /**
   * 배경 렌더링 (패럴랙스 다중 레이어 지원 및 누락 시 폴백 렌더링)
   * @param {number} currentSpeed 현재 게임 속도 (px/s)
   * @param {number} dt 경과 시간 (seconds)
   */
  drawBackground(currentSpeed = 0, dt = 0.016) {
    const layers = this.assetsConfig?.BACKGROUND?.LAYERS;

    if (layers && layers.length > 0) {
      let farRendered = false;

      for (const layer of layers) {
        // 레이어별 패럴랙스 오프셋 갱신
        const speedFactor = layer.SPEED_FACTOR || 0.1;
        const prevOffset = this._parallaxOffsets.get(layer.ID) || 0;
        const nextOffset = prevOffset + currentSpeed * speedFactor * dt;
        this._parallaxOffsets.set(layer.ID, nextOffset);

        const img = assetLoader.getImage('bg_' + layer.ID);
        if (img) {
          const layerW = layer.WIDTH || this.logicalWidth;
          const layerH = layer.HEIGHT || this.logicalHeight;
          const layerY = layer.Y || 0;

          // 미러 타일링: 이미지가 좌우로 이어지는(시임리스) 구조가 아니므로,
          // 홀수 번째 타일을 좌우 반전해서 붙이면 맞닿는 가장자리가 항상 같은 픽셀이 되어 이음새가 사라짐.
          // 반복 주기는 (원본 + 반전본) = layerW * 2
          const period = layerW * 2;
          const scrollX = Math.floor(nextOffset % period);

          for (let k = 0; k < 4; k++) {
            const tileX = -scrollX + k * layerW;
            // 화면 밖 타일은 그리지 않음
            if (tileX >= this.logicalWidth || tileX + layerW <= 0) continue;

            if (k % 2 === 0) {
              this.ctx.drawImage(img, tileX, layerY, layerW, layerH);
            } else {
              this.ctx.save();
              this.ctx.translate(tileX + layerW, layerY);
              this.ctx.scale(-1, 1);
              this.ctx.drawImage(img, 0, 0, layerW, layerH);
              this.ctx.restore();
            }
          }

          if (layer.ID === 'FAR') {
            farRendered = true;
          }
        }
      }

      // 원경(FAR) 레이어가 누락되었을 경우 기본 밤하늘 폴백 렌더링
      if (!farRendered) {
        this._drawFallbackBackground();
      }
    } else {
      this._drawFallbackBackground();
    }
  }

  /**
   * 에셋 누락/실패 시 안전한 폴백 배경 렌더링 (야간 하늘, 달, 산)
   */
  _drawFallbackBackground() {
    const ctx = this.ctx;
    const w = this.logicalWidth;

    // 1. 밤하늘 그라데이션
    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.groundY);
    skyGrad.addColorStop(0, '#0c0f1d');
    skyGrad.addColorStop(1, '#1b2238');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, this.groundY);

    // 2. 별 렌더링
    for (const star of this._stars) {
      ctx.fillStyle = `rgba(230, 240, 255, ${star.alpha})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }

    // 3. 보름달
    const moonX = w - 75;
    const moonY = 35;
    const moonRadius = 16;
    ctx.fillStyle = 'rgba(255, 243, 205, 0.15)';
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonRadius + 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fefae0';
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
    ctx.fill();

    // 4. 원경 산 실루엣
    ctx.fillStyle = '#141724';
    ctx.beginPath();
    ctx.moveTo(0, this.groundY);
    ctx.lineTo(0, this.groundY - 45);
    ctx.lineTo(80, this.groundY - 80);
    ctx.lineTo(170, this.groundY - 40);
    ctx.lineTo(260, this.groundY - 95);
    ctx.lineTo(370, this.groundY - 35);
    ctx.lineTo(480, this.groundY - 70);
    ctx.lineTo(570, this.groundY - 45);
    ctx.lineTo(w, this.groundY - 60);
    ctx.lineTo(w, this.groundY);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * 바닥 렌더링 (타일 에셋 기반 연속 스크롤 및 누락 시 폴백)
   * @param {number} scrollOffset 가로 스크롤 누적값
   */
  drawGround(scrollOffset) {
    const img = assetLoader.getImage('ground');

    if (img && this.assetsConfig?.GROUND) {
      const tileW = this.assetsConfig.GROUND.TILE_WIDTH || 64;
      const tileH = this.assetsConfig.GROUND.TILE_HEIGHT || (this.logicalHeight - this.groundY);
      const groundY = this.groundY;
      const offset = Math.floor(scrollOffset % tileW);

      for (let x = -tileW; x < this.logicalWidth + tileW; x += tileW) {
        this.ctx.drawImage(img, x - offset, groundY, tileW, tileH);
      }
    } else {
      this._drawFallbackGround(scrollOffset);
    }
  }

  /**
   * 바닥 폴백 렌더링
   * @param {number} scrollOffset
   */
  _drawFallbackGround(scrollOffset) {
    const ctx = this.ctx;
    const w = this.logicalWidth;
    const groundY = this.groundY;
    const groundHeight = this.logicalHeight - groundY;

    ctx.fillStyle = '#1d1e2c';
    ctx.fillRect(0, groundY, w, groundHeight);

    ctx.fillStyle = '#3a3f58';
    ctx.fillRect(0, groundY, w, 3);
    ctx.fillStyle = '#525b7a';
    ctx.fillRect(0, groundY, w, 1);

    const patternWidth = 32;
    const offset = Math.floor(scrollOffset % patternWidth);

    ctx.fillStyle = '#2b2d42';
    for (let x = -patternWidth; x < w + patternWidth; x += patternWidth) {
      const drawX = x - offset;
      ctx.fillRect(drawX, groundY + 6, 12, 2);
      ctx.fillRect(drawX + 18, groundY + 12, 8, 2);
      ctx.fillRect(drawX + 6, groundY + 22, 16, 3);
      ctx.fillRect(drawX + 14, groundY + 36, 10, 2);
    }
  }

  /**
   * 불연속 플랫폼 지형 렌더링 (STEP 5)
   * 낭떠러지 구간은 바닥을 비워두고 플랫폼 구간만 타일 및 절벽 테두리 렌더링
   * @param {Array<{ x: number, y: number, width: number, height: number }>} platforms
   */
  drawPlatforms(platforms) {
    const ctx = this.ctx;
    const img = assetLoader.getImage('ground');
    const tileW = this.assetsConfig?.GROUND?.TILE_WIDTH || 64;
    const tileH = this.assetsConfig?.GROUND?.TILE_HEIGHT || (this.logicalHeight - this.groundY);

    for (const p of platforms) {
      // 화면 밖 클리핑 최적화
      if (p.x + p.width < 0 || p.x > this.logicalWidth) continue;

      const px = Math.round(p.x);
      const py = Math.round(p.y);
      const pw = Math.round(p.width);
      const ph = Math.round(p.height);

      ctx.save();
      // 플랫폼 영역 클리핑
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.clip();

      if (img) {
        // 지면 타일 이미지 반복 렌더링
        const startX = px - (((px % tileW) + tileW) % tileW);
        for (let x = startX; x < px + pw; x += tileW) {
          ctx.drawImage(img, x, py, tileW, tileH);
        }
      } else {
        // 폴백 플랫폼 렌더링 (석재 기와/목조 질감)
        ctx.fillStyle = '#1d1e2c';
        ctx.fillRect(px, py, pw, ph);

        ctx.fillStyle = '#3a3f58';
        ctx.fillRect(px, py, pw, 3);
        ctx.fillStyle = '#525b7a';
        ctx.fillRect(px, py, pw, 1);

        const patternWidth = 32;
        for (let x = px; x < px + pw; x += patternWidth) {
          ctx.fillStyle = '#2b2d42';
          ctx.fillRect(x + 2, py + 6, 12, 2);
          ctx.fillRect(x + 18, py + 12, 8, 2);
          ctx.fillRect(x + 6, py + 22, 16, 3);
        }
      }

      ctx.restore();

      // 플랫폼 좌우 절벽(낭떠러지) 가장자리 음영 라인
      ctx.fillStyle = '#0a0c14';
      ctx.fillRect(px, py, 2, ph);
      ctx.fillRect(px + pw - 2, py, 2, ph);

      // 모서리 하이라이트
      ctx.fillStyle = '#64748b';
      ctx.fillRect(px, py, 1, 4);
      ctx.fillRect(px + pw - 1, py, 1, 4);
    }
  }

  /**
   * 갈고리 앵커 렌더링 (STEP 5)
   * 활성/연결 상태에 따른 동적 발광 이펙트 및 타겟팅 가이드 표시
   * @param {Array<{ id: number, x: number, y: number }>} anchors
   * @param {Object|null} activeAnchor
   * @param {Object|null} connectedAnchor
   * @param {Object|null} player
   */
  drawHookAnchors(anchors, activeAnchor, connectedAnchor, player) {
    const ctx = this.ctx;

    for (const anchor of anchors) {
      if (anchor.x < -30 || anchor.x > this.logicalWidth + 30) continue;

      const ax = Math.round(anchor.x);
      const ay = Math.round(anchor.y);
      const isConnected = connectedAnchor && connectedAnchor.id === anchor.id;
      const isActive = activeAnchor && activeAnchor.id === anchor.id;

      ctx.save();

      if (isConnected) {
        // 연결된 앵커: 눈부신 비취빛/황금빛 에너지 펄스
        ctx.fillStyle = 'rgba(6, 214, 160, 0.4)';
        ctx.beginPath();
        ctx.arc(ax, ay, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(ax, ay, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ax, ay, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (isActive) {
        // 사거리 내 활성 앵커: 조준 링 및 가이드 점선
        const pulse = 0.5 + Math.abs(Math.sin(this._uiTimer * 6)) * 0.5;

        // 외곽 타겟팅 조준 링
        ctx.strokeStyle = `rgba(255, 209, 102, ${pulse})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ax, ay, 8 + pulse * 2, 0, Math.PI * 2);
        ctx.stroke();

        // 플레이어와 활성 앵커 간 은은한 조준 가이드 점선
        if (player) {
          const px = Math.round(player.x + player.width / 2);
          const py = Math.round(player.y + player.height / 2);
          ctx.strokeStyle = 'rgba(255, 209, 102, 0.28)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(px, py - 4);
          ctx.lineTo(ax, ay);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(ax, ay, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 일반 유휴 앵커: 동양풍 목조 처마 등롱 / 철제 고리
        ctx.fillStyle = '#3a425c';
        ctx.fillRect(ax - 1, ay - 6, 2, 6);

        ctx.fillStyle = '#525b7a';
        ctx.beginPath();
        ctx.arc(ax, ay, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#1b1f2e';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  /**
   * 갈고리 로프 렌더링 (STEP 5)
   * @param {Object} player
   * @param {Object|null} connectedAnchor
   */
  drawRope(player, connectedAnchor) {
    if (!connectedAnchor) return;
    const ctx = this.ctx;

    const px = Math.round(player.x + player.width / 2);
    const py = Math.round(player.y + player.height / 2 - 4);
    const ax = Math.round(connectedAnchor.x);
    const ay = Math.round(connectedAnchor.y);

    ctx.save();

    // 와이어 (상점 꾸미기로 색/스타일 변경 가능)
    drawRope(ctx, px, py, ax, ay, this.ropeStyle || {}, performance.now() / 1000);

    ctx.restore();
  }

  /**
   * HUD 렌더링 (실시간 점수, 속도, 상태 표시)
   * @param {string} gameState 현재 게임 상태
   * @param {Object} player 플레이어 객체
   * @param {number} score 현재 점수
   * @param {number} currentSpeed 현재 게임 속도
   * @param {number} dt 경과 시간 (seconds)
   */
  drawHUD(gameState, player, score, currentSpeed, dt = 0.016) {
    const ctx = this.ctx;
    this._uiTimer += dt;

    ctx.save();
    ctx.font = '11px monospace';
    ctx.textBaseline = 'top';

    // 1. 좌측 상단: 모드 및 조작 가이드
    ctx.fillStyle = 'rgba(10, 12, 18, 0.75)';
    ctx.fillRect(8, 8, 250, 42);
    ctx.strokeStyle = '#3a3f58';
    ctx.lineWidth = 1;
    ctx.strokeRect(8.5, 8.5, 249, 41);

    ctx.fillStyle = '#06d6a0';
    ctx.fillText(`● GOGUN RUN [STEP 3]`, 14, 13);

    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`STATE: ${gameState} | ANIM: ${player.currentAnim}`, 14, 25);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`JUMP: [SPACE] / [↑] / CLICK`, 14, 37);

    // 2. 우측 상단: 실시간 점수 및 속도 HUD
    const hudW = 160;
    const hudX = this.logicalWidth - hudW - 8;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.75)';
    ctx.fillRect(hudX, 8, hudW, 42);
    ctx.strokeStyle = '#3a3f58';
    ctx.lineWidth = 1;
    ctx.strokeRect(hudX + 0.5, 8.5, hudW - 1, 41);

    const formattedScore = String(score).padStart(6, '0');
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`SCORE: ${formattedScore}`, hudX + 12, 13);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.fillText(`SPEED: ${Math.round(currentSpeed)} px/s`, hudX + 12, 31);

    ctx.restore();
  }

  /**
   * 게임 오버 결과 오버레이 렌더링
   * @param {number} finalScore 최종 점수
   */
  drawGameOver(finalScore) {
    const ctx = this.ctx;
    const w = this.logicalWidth;
    const h = this.logicalHeight;

    ctx.save();

    ctx.fillStyle = 'rgba(8, 10, 16, 0.8)';
    ctx.fillRect(0, 0, w, h);

    const panelW = 320;
    const panelH = 160;
    const panelX = Math.floor((w - panelW) / 2);
    const panelY = Math.floor((h - panelH) / 2) - 10;

    ctx.fillStyle = '#141724';
    ctx.fillRect(panelX, panelY, panelW, panelH);

    ctx.strokeStyle = '#e63946';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX + 1, panelY + 1, panelW - 2, panelH - 2);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    ctx.fillStyle = '#e63946';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('GAME OVER', w / 2, panelY + 22);

    const formattedScore = String(finalScore).padStart(6, '0');
    ctx.fillStyle = '#f1faee';
    ctx.font = '14px monospace';
    ctx.fillText(`FINAL SCORE: ${formattedScore}`, w / 2, panelY + 65);

    const pulse = 0.5 + Math.abs(Math.sin(this._uiTimer * 3.5)) * 0.5;
    ctx.fillStyle = `rgba(255, 209, 102, ${pulse})`;
    ctx.font = 'bold 12px monospace';
    ctx.fillText('PRESS [SPACE] OR CLICK TO RESTART', w / 2, panelY + 115);

    ctx.restore();
  }
}
