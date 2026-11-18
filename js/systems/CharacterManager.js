import {
  FALLBACK_CHARACTERS,
  CHARACTER_MANIFEST_URL,
  DEFAULT_CHARACTER_ID,
  CHARACTER_STORAGE_KEY,
} from '../../config/characters.config.js';
import { assetLoader } from './AssetLoader.js';

/**
 * 캐릭터 목록 관리 및 선택 상태 저장 (localStorage)
 * 스프라이트는 'char_<ID>' 키로 AssetLoader에 로드된다.
 */
export class CharacterManager {
  /**
   * @param {Object} basePlayerAssets ASSETS_CONFIG.PLAYER (공통 프레임/애니메이션 설정)
   */
  constructor(basePlayerAssets) {
    this.base = basePlayerAssets;
    this.list = FALLBACK_CHARACTERS;
    this.selectedId = this._loadSavedId();
  }

  static spriteKey(id) {
    return `char_${id}`;
  }

  /**
   * JSON 항목을 내부 형식으로 정규화 (잘못된 항목은 null)
   * 경로/ID는 CSS url(), 파일 경로에 쓰이므로 안전한 문자만 허용한다.
   */
  static normalizeEntry(e) {
    if (!e || typeof e !== 'object') return null;
    const id = String(e.id ?? e.ID ?? '');
    const src = String(e.src ?? e.SRC ?? '');
    if (!/^[A-Za-z0-9_]+$/.test(id)) return null;
    if (!/^[\w\-./]+$/.test(src) || src.includes('..')) return null;
    const overrides = e.spriteOverrides ?? e.SPRITE_OVERRIDES;
    return {
      ID: id,
      NAME: String(e.name ?? e.NAME ?? id),
      DESC: String(e.desc ?? e.DESC ?? ''),
      SRC: src,
      PRICE: Number(e.price ?? e.PRICE ?? 0) || 0,
      SPRITE_OVERRIDES: overrides && typeof overrides === 'object' ? overrides : {},
    };
  }

  /**
   * characters.json 을 읽어 목록 교체 (실패하면 기본 목록 유지)
   * @returns {Promise<boolean>} JSON 로드 성공 여부
   */
  async loadManifest(url = CHARACTER_MANIFEST_URL) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const seen = new Set();
      const list = [];
      for (const raw of json.characters || []) {
        const ch = CharacterManager.normalizeEntry(raw);
        if (ch && !seen.has(ch.ID)) { seen.add(ch.ID); list.push(ch); }
      }
      if (list.length === 0) throw new Error('유효한 캐릭터가 없음');
      this.list = list;
      if (!this.get(this.selectedId)) {
        this.selectedId = this.get(DEFAULT_CHARACTER_ID) ? DEFAULT_CHARACTER_ID : list[0].ID;
      }
      return true;
    } catch (err) {
      console.warn('[CharacterManager] characters.json 로드 실패 — 기본 캐릭터 목록 사용:', err.message || err);
      return false;
    }
  }

  /** AssetLoader 매니페스트용 목록 */
  getManifest() {
    return this.list.map((c) => ({ key: CharacterManager.spriteKey(c.ID), src: c.SRC }));
  }

  get(id) {
    return this.list.find((c) => c.ID === id) || null;
  }

  getSelected() {
    return this.get(this.selectedId) || this.list[0];
  }

  getSelectedIndex() {
    return Math.max(0, this.list.findIndex((c) => c.ID === this.getSelected().ID));
  }

  /** 시트 로드에 실패한 캐릭터는 선택 대상에서 제외하지 않고 폴백 렌더링으로 처리한다 */
  isLoaded(id) {
    return assetLoader.isLoaded(CharacterManager.spriteKey(id));
  }

  /**
   * 캐릭터 선택 (유효한 ID일 때만) 및 저장
   * @returns {Object|null} 선택된 캐릭터
   */
  select(id) {
    const ch = this.get(id);
    if (!ch) return null;
    this.selectedId = ch.ID;
    try {
      localStorage.setItem(CHARACTER_STORAGE_KEY, ch.ID);
    } catch (e) {
      // 저장 불가 환경(시크릿 모드 등)에서는 세션 동안만 유지
    }
    return ch;
  }

  /** 오프셋 +1(다음) / -1(이전)로 순환 선택 */
  cycle(step) {
    const n = this.list.length;
    const next = (this.getSelectedIndex() + step + n) % n;
    return this.select(this.list[next].ID);
  }

  /** Player에 전달할 에셋 설정 (공통 설정 + 캐릭터별 덮어쓰기 + 캐릭터 SRC) */
  getPlayerAssetConfig(id = this.selectedId) {
    const ch = this.get(id) || this.list[0];
    return { ...this.base, ...(ch.SPRITE_OVERRIDES || {}), SRC: ch.SRC };
  }

  _loadSavedId() {
    try {
      const saved = localStorage.getItem(CHARACTER_STORAGE_KEY);
      if (saved && this.get(saved)) return saved;
    } catch (e) {
      // 무시
    }
    return this.get(DEFAULT_CHARACTER_ID) ? DEFAULT_CHARACTER_ID : this.list[0].ID;
  }
}
