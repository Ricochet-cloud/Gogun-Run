/**
 * 캐릭터 설정
 *
 * 캐릭터 목록의 실제 데이터는 assets/player/characters/characters.json 에 있습니다.
 * (tools/sprite-cutter.html 에서 "게임에 등록"을 누르면 이 파일이 자동으로 갱신됩니다.)
 * 아래 FALLBACK_CHARACTERS 는 JSON 을 읽지 못했을 때만 쓰는 최소 기본값입니다.
 *
 * characters.json 항목 형식:
 *   id               고유 ID (영문/숫자/_)
 *   name, desc       화면에 보일 이름과 설명
 *   src              스프라이트 시트 경로 (64x64 프레임 7장 = 448x64)
 *   price            가격 (0 = 무료 · 상점 기능용 예약 필드)
 *   spriteOverrides  이 캐릭터만 다르게 쓸 PLAYER 에셋 설정 (선택)
 */
export const CHARACTER_MANIFEST_URL = 'assets/player/characters/characters.json';

export const FALLBACK_CHARACTERS = Object.freeze([
  {
    ID: 'tanjiro',
    NAME: '탄지로',
    DESC: '기본 캐릭터 · 균형형',
    SRC: 'assets/player/tanjiro_sprite_448x64.png',
    PRICE: 0,
    SPRITE_OVERRIDES: {},
  },
]);

export const DEFAULT_CHARACTER_ID = 'tanjiro';
export const CHARACTER_STORAGE_KEY = 'gogun-run:character';
