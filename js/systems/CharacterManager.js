import { CHARACTERS, DEFAULT_CHARACTER_ID, CHARACTER_STORAGE_KEY } from '../../config/characters.config.js';
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
    this.list = CHARACTERS;
    this.selectedId = this._loadSavedId();
  }

  static spriteKey(id) {
    return `char_${id}`;
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
