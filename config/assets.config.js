/**
 * 게임 에셋 설정 파일
 * 스프라이트 시트 경로, 애니메이션 프레임, FPS, 배경/장애물/바닥 에셋 경로 및 위치 보정을 일원화하여 관리합니다.
 * 에셋 파일 교체 시 게임 로직을 수정하지 않고 이 설정 파일만 변경하면 적용됩니다.
 */

export const ASSETS_CONFIG = Object.freeze({
  // 플레이어 스프라이트 시트 및 애니메이션 설정
  PLAYER: {
    SRC: 'assets/player/tanjiro_sprite_448x64.png', // 이미지 파일 경로 (7프레임 × 64px, 기존 336x48 시트에서 변환)
    FRAME_WIDTH: 64,                            // 개별 프레임 가로폭 (px) — RENDER_WIDTH와 같게 두면 확대/축소 없이 1:1로 그려져 도트가 깨지지 않음
    FRAME_HEIGHT: 64,                           // 개별 프레임 세로높이 (px)
    RENDER_WIDTH: 64,                           // 캔버스에 렌더링될 실제 가로폭 (프레임 크기와 동일해야 함)
    RENDER_HEIGHT: 64,                          // 캔버스에 렌더링될 실제 세로높이 (프레임 크기와 동일해야 함)
    OFFSET_X: -8,                               // 충돌 히트박스 기준 시각적 X 오프셋 (보정: -6→-8)
    OFFSET_Y: 2,                                // 충돌 히트박스 기준 시각적 Y 오프셋 (발 정렬: 새 시트는 발이 프레임 61행 → 바닥(290)에 닿도록 +2)
    ANIMATIONS: {
      RUN: {
        FRAMES: [0, 1, 2, 3],                   // 달리기 프레임 인덱스 목록
        FPS: 10,                                // 초당 재생 프레임 수
        LOOP: true,                             // 반복 재생 여부
      },
      JUMP: {
        FRAMES: [4],                            // 점프 상승/체공 프레임
        FPS: 1,
        LOOP: false,
      },
      LAND: {
        FRAMES: [5],                            // 착지 임팩트 프레임
        FPS: 8,
        LOOP: false,
      },
      DEAD: {
        FRAMES: [6],                            // 사망/피격 프레임
        FPS: 1,
        LOOP: false,
      },
    },
  },

  // 장애물 에셋 설정
  OBSTACLES: {
    DEMON_ROCK: {
      SRC: 'assets/obstacles/demon_rock.svg',
      RENDER_WIDTH: 26,
      RENDER_HEIGHT: 32,
      OFFSET_X: 0,
      OFFSET_Y: 0,
    },
    WOODEN_SPIKE: {
      SRC: 'assets/obstacles/wooden_spike.svg',
      RENDER_WIDTH: 32,
      RENDER_HEIGHT: 46,
      OFFSET_X: 0,
      OFFSET_Y: 0,
    },
    CURSED_THORNS: {
      SRC: 'assets/obstacles/cursed_thorns.svg',
      RENDER_WIDTH: 48,
      RENDER_HEIGHT: 28,
      OFFSET_X: 0,
      OFFSET_Y: 0,
    },
  },

  // 배경 패럴랙스 레이어 설정
  BACKGROUND: {
    LAYERS: [
      {
        ID: 'FAR',                              // 원경 레이어 (달, 밤하늘, 먼 산)
        SRC: 'assets/background/bg_far.png',
        SPEED_FACTOR: 0.1,                      // 스크롤 속도 배율 (느림)
        WIDTH: 640,
        HEIGHT: 360,
        Y: 0,
      },
      {
        ID: 'MID',                              // 중경 레이어 (안개 낀 소나무 숲/대나무 실루엣)
        SRC: 'assets/background/bg_mid.png',
        SPEED_FACTOR: 0.35,                     // 스크롤 속도 배율 (중간)
        WIDTH: 640,
        HEIGHT: 360,
        Y: 0,
      },
      {
        ID: 'NEAR',                             // 전경 레이어 (등롱, 목책 울타리)
        SRC: 'assets/background/bg_near.png',
        SPEED_FACTOR: 0.65,                     // 스크롤 속도 배율 (비교적 빠름)
        WIDTH: 640,
        HEIGHT: 360,
        Y: 0,
      },
    ],
  },

  // 바닥 반복 타일 설정
  GROUND: {
    SRC: 'assets/ground/ground_tile.svg',
    TILE_WIDTH: 64,                             // 타일 가로폭 (px)
    TILE_HEIGHT: 70,                            // 타일 세로높이 (px)
    Y: 290,                                     // 바닥 상단 기준 Y 위치
  },
});
