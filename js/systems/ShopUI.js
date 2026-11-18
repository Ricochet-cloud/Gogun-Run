import { COSMETIC_TYPES } from './ShopManager.js';
import { drawShape, drawRope, SHAPE_SCALE } from '../game/CosmeticDraw.js';

const TAB_LABELS = { character: '캐릭터', cosmetic: '꾸미기', pet: '펫' };
const COSMETIC_HEADINGS = { trail: '달리기 먼지', rope: '갈고리 와이어', effect: '니어미스 연출' };

/**
 * 상점 화면 (모달) 렌더링/조작.
 * 이름·설명 등 JSON 에서 온 문자열은 항상 textContent 로만 넣는다.
 */
export class ShopUI {
  /**
   * @param {HTMLElement} modal #modal-shop 엘리먼트
   * @param {Object} deps { shop, characters, onSelectCharacter, onClose, onOpenStateChange }
   */
  constructor(modal, deps) {
    this.modal = modal;
    this.shop = deps.shop;
    this.characters = deps.characters;
    this.onSelectCharacter = deps.onSelectCharacter || (() => {});
    this.onClose = deps.onClose || (() => {});
    this.tab = 'character';
    /** @type {Array<(t:number)=>void>} 움직이는 미리보기 캔버스 그리기 함수 */
    this._anims = [];
    this._raf = 0;

    this.$coins = modal.querySelector('#shop-coins');
    this.$msg = modal.querySelector('#shop-msg');
    this.$grid = modal.querySelector('#shop-grid');
    this.$tabs = modal.querySelector('.shop-tabs');

    this.$tabs.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      this.tab = b.dataset.tab;
      this.setMessage('');
      this.render();
    });
    modal.querySelector('#btn-close-shop').addEventListener('click', () => this.close());
    modal.addEventListener('click', (e) => { if (e.target === modal) this.close(); });
    this._onKey = (e) => { if (this.isOpen() && e.code === 'Escape') { e.stopPropagation(); this.close(); } };
    window.addEventListener('keydown', this._onKey, true);
  }

  isOpen() { return this.modal.style.display !== 'none'; }

  open() {
    this.setMessage('');
    this.render();
    this.modal.style.display = 'flex';
  }

  close() {
    this._stopAnim();
    this.modal.style.display = 'none';
    this.shop.save();
    this.onClose();
  }

  destroy() { this._stopAnim(); window.removeEventListener('keydown', this._onKey, true); }

  setMessage(text, kind = '') {
    this.$msg.textContent = text;
    this.$msg.className = 'shop-msg' + (kind ? ' ' + kind : '');
  }

  // ---------------------------------------------------------------------------

  render() {
    this.$coins.textContent = this.shop.coins.toLocaleString('ko-KR');
    for (const b of this.$tabs.querySelectorAll('button')) b.classList.toggle('active', b.dataset.tab === this.tab);
    this.$grid.textContent = '';
    this._anims = [];

    if (this.tab === 'character') {
      this._section(null, this.characters.list.map((c) => this._characterCard(c)));
    } else if (this.tab === 'cosmetic') {
      for (const type of COSMETIC_TYPES) {
        this._section(COSMETIC_HEADINGS[type], this.shop.itemsOfType(type).map((it) => this._itemCard(it)));
      }
    } else {
      const none = this._card({
        preview: this._emptyPreview('없음'), name: '펫 없음', desc: '펫을 따로 데리고 다니지 않아요', price: 0,
        owned: true, equipped: this.shop.state.equipped.pet === null,
        onEquip: () => { this.shop.equipItem('pet', null); this.setMessage('펫을 해제했어요'); this.render(); },
      });
      this._section(null, [none, ...this.shop.itemsOfType('pet').map((it) => this._itemCard(it))]);
    }
    this._startAnim();
  }

  // ----- 움직이는 미리보기 (열려 있는 동안에만 갱신) -----

  _startAnim() {
    if (this._raf || !this._anims.length) return;
    const t0 = performance.now();
    const loop = (now) => {
      if (!this.isOpen()) { this._raf = 0; return; }
      const t = Math.max(0, (now - t0) / 1000);
      for (const fn of this._anims) fn(t);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stopAnim() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  /** 120×64 미리보기 캔버스 (draw(ctx, t) 를 계속 호출) */
  _canvasPreview(draw) {
    const c = document.createElement('canvas');
    c.width = 120; c.height = 64;
    c.className = 'shop-canvas';
    const ctx = c.getContext('2d');
    const fn = (t) => { ctx.clearRect(0, 0, 120, 64); draw(ctx, t); };
    fn(0);
    this._anims.push(fn);
    return c;
  }

  _section(title, cards) {
    if (title) {
      const h = document.createElement('div');
      h.className = 'shop-section-title';
      h.textContent = title;
      this.$grid.appendChild(h);
    }
    const wrap = document.createElement('div');
    wrap.className = 'shop-cards';
    for (const c of cards) wrap.appendChild(c);
    this.$grid.appendChild(wrap);
  }

  // ----- 카드 생성 -----

  _characterCard(ch) {
    const cfg = this.characters.getPlayerAssetConfig(ch.ID);
    const fw = cfg.FRAME_WIDTH || 64, fh = cfg.FRAME_HEIGHT || 64;
    const run = cfg.ANIMATIONS?.RUN || { FRAMES: [0], FPS: 1 };
    const preview = this._spritePreview(ch.SRC, fw, fh, run.FRAMES.length, run.FPS || 10, 1.5);
    return this._card({
      preview, name: ch.NAME, desc: ch.DESC, price: ch.PRICE,
      owned: this.shop.ownsCharacter(ch),
      equipped: this.characters.getSelected().ID === ch.ID,
      onBuy: () => this._buy('character', ch.ID, ch.NAME, () => this._equipCharacter(ch.ID)),
      onEquip: () => { this._equipCharacter(ch.ID); this.setMessage(`${ch.NAME} 장착!`, 'good'); this.render(); },
    });
  }

  _equipCharacter(id) { this.onSelectCharacter(id); }

  _itemCard(it) {
    let preview;
    if (it.type === 'trail') preview = this._trailPreview(it);
    else if (it.type === 'rope') preview = this._ropePreview(it);
    else if (it.type === 'effect') preview = this._effectPreview(it);
    else preview = this._spritePreview(it.src, it.frameWidth, it.frameHeight, it.frames, it.fps, 1.5);

    const desc = it.type === 'pet' && it.magnet > 0 ? `${it.desc} (코인 자석 ${it.magnet}px)` : it.desc;
    return this._card({
      preview, name: it.name, desc, price: it.price,
      owned: this.shop.ownsItem(it),
      equipped: this.shop.state.equipped[it.type] === it.id,
      onBuy: () => this._buy('item', it.id, it.name, () => this.shop.equipItem(it.type, it.id)),
      onEquip: () => { this.shop.equipItem(it.type, it.id); this.setMessage(`${it.name} 장착!`, 'good'); this.render(); },
    });
  }

  _card({ preview, name, desc, price, owned, equipped, onBuy, onEquip }) {
    const el = document.createElement('div');
    el.className = 'shop-card' + (equipped ? ' equipped' : '') + (owned ? '' : ' locked');
    const pv = document.createElement('div');
    pv.className = 'shop-preview';
    pv.appendChild(preview);
    const nm = document.createElement('div');
    nm.className = 'shop-name';
    nm.textContent = name;
    const ds = document.createElement('div');
    ds.className = 'shop-desc';
    ds.textContent = desc || '';
    const btn = document.createElement('button');
    btn.className = 'ui-btn ui-interactive shop-btn';
    if (equipped) {
      btn.textContent = '장착 중';
      btn.disabled = true;
      btn.classList.add('ui-btn-subtle');
    } else if (owned) {
      btn.textContent = '장착';
      btn.classList.add('ui-btn-secondary');
      btn.addEventListener('click', onEquip);
    } else {
      btn.textContent = `🪙 ${price.toLocaleString('ko-KR')}`;
      btn.classList.add('ui-btn-primary');
      if (this.shop.coins < price) btn.classList.add('cant');
      btn.addEventListener('click', onBuy);
    }
    el.append(pv, nm, ds, btn);
    return el;
  }

  _buy(kind, id, name, afterBuy) {
    const r = this.shop.buy(kind, id);
    if (!r.ok) { this.setMessage(r.reason, 'bad'); return; }
    afterBuy();                                       // 구매 직후 바로 장착
    this.setMessage(`${name} 구매 완료! 바로 장착했어요`, 'good');
    this.render();
  }

  // ----- 미리보기 조각 -----

  _spritePreview(src, fw, fh, frames, fps, scale) {
    const d = document.createElement('div');
    d.className = 'shop-sprite';
    d.style.width = `${Math.round(fw * scale)}px`;
    d.style.height = `${Math.round(fh * scale)}px`;
    d.style.backgroundImage = `url("${src}")`;
    d.style.backgroundSize = 'auto 100%';
    d.style.setProperty('--shift', `${-Math.round(fw * scale) * frames}px`);
    d.style.setProperty('--frames', String(frames));
    d.style.setProperty('--dur', `${(frames / fps).toFixed(3)}s`);
    return d;
  }

  /** 먼지: 바닥 위로 모양 입자가 계속 흩날림 */
  _trailPreview(it) {
    const cols = [...it.colors, ...it.runColors];
    const N = 9;
    return this._canvasPreview((ctx, t) => {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, 50, 120, 2);
      for (let i = 0; i < N; i++) {
        const ph = (t * 0.7 + i / N) % 1;                          // 0 → 1 로 수명 진행
        const x = 22 + ph * 70 + Math.sin(i * 7.3) * 6;
        const rise = it.float ? 30 : 16;
        const y = 48 - Math.sin(ph * Math.PI) * rise - (it.float ? ph * 14 : 0) + Math.cos(i * 3.1) * 3;
        ctx.globalAlpha = Math.min(1, (1 - ph) * 1.6);
        const rot = it.spin || it.shape !== 'square' ? t * (it.spin ? 4 : 0.6) + i : 0;
        drawShape(ctx, it.shape, Math.round(x), Math.round(y), (it.shape === 'square' ? 3.5 : 5.5), cols[i % cols.length], rot);
      }
      ctx.globalAlpha = 1;
    });
  }

  /** 와이어: 실제 게임과 같은 함수로 그림 */
  _ropePreview(it) {
    return this._canvasPreview((ctx, t) => {
      drawRope(ctx, 10, 46, 108, 18, it, t);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(4, 46, 8, 8);                                    // 플레이어 쪽 끝
    });
  }

  /** 니어미스 연출: 파편 + 라벨이 터지는 모습을 반복 */
  _effectPreview(it) {
    const labels = [
      [it.labels?.perfect || 'PERFECT!', it.perfect],
      [it.labels?.near || 'NEAR MISS', it.near],
      [it.labels?.ledge || 'LEDGE SAVE', it.ledge],
    ];
    return this._canvasPreview((ctx, t) => {
      const cyc = 1.5;
      const idx = Math.floor(t / cyc) % labels.length;
      const k = (t % cyc) / cyc;
      const [text, color] = labels[idx];
      const cx = 60, cy = 36;
      // 파편
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        const d = 6 + k * 24 + (i % 3) * 3;
        ctx.globalAlpha = Math.max(0, 1 - k * 1.3);
        drawShape(ctx, it.shape, cx + Math.cos(a) * d, cy + Math.sin(a) * d, it.shape === 'square' ? 2.5 : 3.4, i % 3 === 0 ? '#ffffff' : color, t * 3 + i);
      }
      // 링
      ctx.globalAlpha = Math.max(0, 1 - k * 1.5);
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 4 + k * 22, 0, Math.PI * 2); ctx.stroke();
      // 라벨
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.2);
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = '#0b0c10';
      const ty = 12 - k * 6;
      ctx.strokeText(text, cx, ty); ctx.fillStyle = color; ctx.fillText(text, cx, ty);
      ctx.globalAlpha = 1;
    });
  }

  _dots(colors) {
    const d = document.createElement('div');
    d.className = 'shop-dots';
    for (const c of colors) {
      const s = document.createElement('span');
      s.style.background = c;
      d.appendChild(s);
    }
    return d;
  }

  _rope(it) {
    const d = document.createElement('div');
    d.className = 'shop-rope';
    d.style.setProperty('--glow', it.glow);
    d.style.setProperty('--core', it.core);
    d.style.setProperty('--tip', it.tip);
    return d;
  }

  _emptyPreview(text) {
    const d = document.createElement('div');
    d.className = 'shop-empty';
    d.textContent = text;
    return d;
  }
}
