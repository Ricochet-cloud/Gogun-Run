/**
 * 플레이 가능한 캐릭터 목록
 *
 * 새 캐릭터 추가 방법:
 *  1) 스프라이트 시트(64×64 프레임 7장 가로 배치 = 448×64 PNG)를 assets/player/characters/ 에 넣는다.
 *     프레임 순서: 0~3 달리기, 4 점프, 5 착지, 6 사망 (발 바닥선은 프레임 61행에 맞출 것)
 *  2) 아래 CHARACTERS 배열에 항목을 하나 추가한다. (id 는 중복 금지, 영문/숫자/_ 만)
 *
 * SPRITE_OVERRIDES: 이 캐릭터만 다르게 쓸 PLAYER 에셋 설정 (프레임 크기, OFFSET, 애니메이션 등).
 *                   비워두면 config/assets.config.js 의 PLAYER 설정을 그대로 사용한다.
 */
export const CHARACTERS = Object.freeze([
  {
    ID: 'tanjiro',
    NAME: '탄지로',
    DESC: '기본 캐릭터 · 균형형',
    SRC: 'assets/player/tanjiro_sprite_448x64.png',
    SPRITE_OVERRIDES: {},
  },
  {
    ID: 'placeholder_azure',
    NAME: '청색 검사 (임시)',
    DESC: '임시 캐릭터 · 새 시트로 교체하세요',
    SRC: 'assets/player/characters/placeholder_azure_448x64.png',
    SPRITE_OVERRIDES: {},
  },
  {
    ID: 'placeholder_gold',
    NAME: '황금 검사 (임시)',
    DESC: '임시 캐릭터 · 새 시트로 교체하세요',
    SRC: 'assets/player/characters/placeholder_gold_448x64.png',
    SPRITE_OVERRIDES: {},
  },
]);

export const DEFAULT_CHARACTER_ID = 'tanjiro';
export const CHARACTER_STORAGE_KEY = 'gogun-run:character';
