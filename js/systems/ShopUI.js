import { COSMETIC_TYPES } from './ShopManager.js';

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
    this.modal.style.display = 'none';
    this.shop.save();
    this.onClose();
  }

  destroy() { window.removeEventListener('keydown', this._onKey, true); }

  setMessage(text, kind = '') {
    this.$msg.textContent = text;
    this.$msg.className = 'shop-msg' + (kind ? ' ' + kind : '');
  }

  // ---------------------------------------------------------------------------

  render() {
    this.$coins.textContent = this.shop.coins.toLocaleString('ko-KR');
    for (const b of this.$tabs.querySelectorAll('button')) b.classList.toggle('active', b.dataset.tab === this.tab);
    this.$grid.textContent = '';

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
    if (it.type === 'trail') preview = this._dots([...it.colors, ...it.runColors.slice(0, 1)]);
    else if (it.type === 'rope') preview = this._rope(it);
    else if (it.type === 'effect') preview = this._dots([it.near, it.perfect, it.ledge]);
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
