/**
 * 상점 관리자 (ShopManager)
 * - 지갑(코인), 보유 목록, 장착 상태를 localStorage에 저장한다.
 * - 판매 품목:
 *     캐릭터 : characters.json (CharacterManager) 의 price
 *     꾸미기 : assets/shop/items.json 의 trail(먼지) / rope(갈고리) / effect(니어미스 연출)
 *     펫     : assets/shop/items.json 의 pet
 * - price 가 0 이면 처음부터 보유한 무료 품목이다.
 */

export const SHOP_ITEMS_URL = 'assets/shop/items.json';
export const SHOP_STORAGE_KEY = 'gogun-run:shop';

/** 꾸미기 슬롯별 기본 장착 아이템 ID (items.json 에 반드시 price 0 으로 존재해야 함) */
const COSMETIC_DEFAULTS = Object.freeze({
  trail: 'trail_default',
  rope: 'rope_default',
  effect: 'effect_default',
});
export const COSMETIC_TYPES = Object.freeze(['trail', 'rope', 'effect']);

/** JSON 이 없을 때 쓰는 최소 기본 품목 */
const FALLBACK_ITEMS = Object.freeze([
  { id: 'trail_default', type: 'trail', name: '기본 먼지', desc: '', price: 0, colors: ['#cbd5e1', '#94a3b8'], runColors: ['#94a3b8', '#64748b'] },
  { id: 'rope_default', type: 'rope', name: '기본 와이어', desc: '', price: 0, glow: 'rgba(6, 214, 160, 0.45)', core: '#ffffff', tip: '#ffd166' },
  { id: 'effect_default', type: 'effect', name: '기본 연출', desc: '', price: 0, near: '#ffd166', perfect: '#06d6a0', ledge: '#74c0fc' },
]);

const SAFE_ID = /^[A-Za-z0-9_]+$/;
const SAFE_PATH = /^[\w\-./]+$/;
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\))$/;

export class ShopManager {
  /**
   * @param {import('./CharacterManager.js').CharacterManager} characters
   */
  constructor(characters) {
    this.characters = characters;
    /** @type {Array<Object>} */
    this.items = FALLBACK_ITEMS.map((i) => ({ ...i }));
    this.state = this._load();
    this.listeners = new Set();
  }

  // ---------------------------------------------------------------------------
  // 데이터 로드
  // ---------------------------------------------------------------------------

  static _color(v, fallback) {
    return typeof v === 'string' && SAFE_COLOR.test(v.trim()) ? v.trim() : fallback;
  }

  /** items.json 한 항목 검증/정규화 (이상하면 null) */
  static normalizeItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id ?? '');
    const type = String(raw.type ?? '');
    if (!SAFE_ID.test(id)) return null;
    const base = {
      id, type,
      name: String(raw.name ?? id),
      desc: String(raw.desc ?? ''),
      price: Math.max(0, Math.round(Number(raw.price) || 0)),
    };
    const col = ShopManager._color;
    if (type === 'trail') {
      const pair = (arr, d) => (Array.isArray(arr) && arr.length ? arr.slice(0, 4).map((c) => col(c, d[0])) : d);
      return { ...base, colors: pair(raw.colors, ['#cbd5e1', '#94a3b8']), runColors: pair(raw.runColors, ['#94a3b8', '#64748b']) };
    }
    if (type === 'rope') {
      return { ...base, glow: col(raw.glow, 'rgba(6, 214, 160, 0.45)'), core: col(raw.core, '#ffffff'), tip: col(raw.tip, '#ffd166') };
    }
    if (type === 'effect') {
      return { ...base, near: col(raw.near, '#ffd166'), perfect: col(raw.perfect, '#06d6a0'), ledge: col(raw.ledge, '#74c0fc') };
    }
    if (type === 'pet') {
      const src = String(raw.src ?? '');
      if (!SAFE_PATH.test(src) || src.includes('..')) return null;
      const num = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || d));
      return {
        ...base, src,
        frameWidth: num(raw.frameWidth, 32, 8, 128), frameHeight: num(raw.frameHeight, 32, 8, 128),
        frames: Math.round(num(raw.frames, 4, 1, 16)), fps: num(raw.fps, 8, 1, 30),
        magnet: num(raw.magnet, 0, 0, 200),
      };
    }
    return null;
  }

  /** items.json 로드 (실패 시 기본 품목만 유지) */
  async loadCatalog(url = SHOP_ITEMS_URL) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const seen = new Set();
      const list = [];
      for (const raw of json.items || []) {
        const it = ShopManager.normalizeItem(raw);
        if (it && !seen.has(it.id)) { seen.add(it.id); list.push(it); }
      }
      // 슬롯별 기본 아이템이 없으면 기본값을 채워 넣는다
      for (const f of FALLBACK_ITEMS) if (!seen.has(f.id)) list.unshift({ ...f });
      this.items = list;
      this._sanitizeEquipped();
      return true;
    } catch (err) {
      console.warn('[ShopManager] items.json 로드 실패 — 기본 품목만 사용:', err.message || err);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // 저장/불러오기
  // ---------------------------------------------------------------------------

  _defaultState() {
    return { coins: 0, ownedCharacters: [], ownedItems: [], equipped: { ...COSMETIC_DEFAULTS, pet: null } };
  }

  _load() {
    const d = this._defaultState();
    try {
      const raw = JSON.parse(localStorage.getItem(SHOP_STORAGE_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return d;
      const strs = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && SAFE_ID.test(x)) : []);
      const eq = raw.equipped && typeof raw.equipped === 'object' ? raw.equipped : {};
      return {
        coins: Math.max(0, Math.floor(Number(raw.coins) || 0)),
        ownedCharacters: strs(raw.ownedCharacters),
        ownedItems: strs(raw.ownedItems),
        equipped: {
          trail: typeof eq.trail === 'string' ? eq.trail : d.equipped.trail,
          rope: typeof eq.rope === 'string' ? eq.rope : d.equipped.rope,
          effect: typeof eq.effect === 'string' ? eq.effect : d.equipped.effect,
          pet: typeof eq.pet === 'string' ? eq.pet : null,
        },
      };
    } catch (e) {
      return d;
    }
  }

  save() {
    try {
      localStorage.setItem(SHOP_STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      // 저장 불가 환경에서는 세션 동안만 유지
    }
  }

  /** 카탈로그가 바뀐 뒤 장착 중인 항목이 유효/보유 상태인지 확인하고 아니면 기본값으로 되돌림 */
  _sanitizeEquipped() {
    const eq = this.state.equipped;
    for (const type of COSMETIC_TYPES) {
      const it = this.getItem(eq[type]);
      if (!it || it.type !== type || !this.ownsItem(it)) eq[type] = COSMETIC_DEFAULTS[type];
    }
    if (eq.pet) {
      const it = this.getItem(eq.pet);
      if (!it || it.type !== 'pet' || !this.ownsItem(it)) eq.pet = null;
    }
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { this.save(); for (const fn of this.listeners) fn(); }

  // ---------------------------------------------------------------------------
  // 지갑
  // ---------------------------------------------------------------------------

  get coins() { return this.state.coins; }

  /** 코인 적립 (런 중에는 메모리에만 쌓고, save() 는 런 종료/일시정지 시점에 호출) */
  addCoins(n) {
    if (!(n > 0)) return;
    this.state.coins += Math.floor(n);
  }

  // ---------------------------------------------------------------------------
  // 보유 / 구매 / 장착
  // ---------------------------------------------------------------------------

  getItem(id) { return this.items.find((i) => i.id === id) || null; }
  itemsOfType(type) { return this.items.filter((i) => i.type === type); }

  ownsCharacter(ch) { return !!ch && (ch.PRICE <= 0 || this.state.ownedCharacters.includes(ch.ID)); }
  ownsItem(it) { return !!it && (it.price <= 0 || this.state.ownedItems.includes(it.id)); }

  /**
   * 구매
   * @param {'character'|'item'} kind
   * @returns {{ok: boolean, reason?: string}}
   */
  buy(kind, id) {
    const target = kind === 'character' ? this.characters.get(id) : this.getItem(id);
    if (!target) return { ok: false, reason: '없는 상품이에요' };
    const price = kind === 'character' ? target.PRICE : target.price;
    const owned = kind === 'character' ? this.ownsCharacter(target) : this.ownsItem(target);
    if (owned) return { ok: false, reason: '이미 가지고 있어요' };
    if (this.state.coins < price) return { ok: false, reason: `코인이 ${price - this.state.coins}개 부족해요` };
    this.state.coins -= price;
    (kind === 'character' ? this.state.ownedCharacters : this.state.ownedItems).push(id);
    this._emit();
    return { ok: true };
  }

  /** 꾸미기/펫 장착. 펫 해제는 equipItem('pet', null) */
  equipItem(type, id) {
    if (type === 'pet' && id === null) { this.state.equipped.pet = null; this._emit(); return { ok: true }; }
    const it = this.getItem(id);
    if (!it || it.type !== type) return { ok: false, reason: '없는 상품이에요' };
    if (!this.ownsItem(it)) return { ok: false, reason: '먼저 구매해야 해요' };
    this.state.equipped[type] = id;
    this._emit();
    return { ok: true };
  }

  /** 현재 장착한 아이템 객체 (없으면 슬롯 기본값 / 펫은 null) */
  getEquipped(type) {
    if (type === 'pet') return this.getItem(this.state.equipped.pet);
    return this.getItem(this.state.equipped[type]) || this.getItem(COSMETIC_DEFAULTS[type]);
  }
}
