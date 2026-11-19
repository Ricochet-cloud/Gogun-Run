/**
 * 게임 전역 설정 파일
 * 물리, 해상도, 플레이어, 장애물, 난이도, 점수 관련 설정을 관리합니다.
 */

export const GAME_CONFIG = Object.freeze({
  // 캔버스 및 화면 설정
  CANVAS: {
    LOGICAL_WIDTH: 640,
    LOGICAL_HEIGHT: 360,
    ASPECT_RATIO: 640 / 360,
    TARGET_SCALE_PADDING: 0.96, // 브라우저 창 내 여백 비율 (모바일 최적화)
  },

  // 월드 및 환경 설정
  WORLD: {
    GROUND_Y: 290,           // 바닥 윗면 Y 좌표 (논리 좌표 기준)
    GROUND_HEIGHT: 70,       // 바닥 영역 높이
    BASE_SPEED: 250,         // 기본 배경 및 바닥 이동 속도 (px/s)
  },

  // 물리 엔진 설정
  PHYSICS: {
    GRAVITY: 1600,           // 중력 가속도 (px/s^2)
    JUMP_FORCE: -560,        // 점프 초기 속도 (px/s)
    MAX_FALL_SPEED: 900,     // 최대 낙하 속도 (px/s)
  },

  // 플레이어 기본 설정
  PLAYER: {
    START_X: 85,             // 시작 X 위치 (조정: 90→85)
    START_Y: 226,            // 바닥 기준 초기 Y 위치 (STEP 6 확대: 242→226, 290-64)
    WIDTH: 48,               // 플레이어 가로 폭 (확대: 36→48)
    HEIGHT: 64,              // 플레이어 세로 높이 (확대: 48→64)
    RUN_BOUNCE_SPEED: 14,    // 달리기 상하 반동 주기
    RUN_BOUNCE_AMOUNT: 2,    // 달리기 상하 반동 크기 (px)
    HITBOX: {
      PADDING_X: 8,          // 좌우 여백 (너비: 48 - 16 = 32, 확대: 6→8)
      PADDING_TOP: 8,        // 상단 여백 (확대: 4→8)
      PADDING_BOTTOM: 4,     // 하단 여백 (확대: 2→4)
    },
  },

  // 장애물 설정
  OBSTACLES: {
    TYPES: [
      {
        id: 'DEMON_ROCK',
        width: 26,
        height: 32,
        hitbox: { offsetX: 3, offsetY: 4, width: 20, height: 28 },
      },
      {
        id: 'WOODEN_SPIKE',
        width: 32,
        height: 46,
        hitbox: { offsetX: 4, offsetY: 4, width: 24, height: 42 },
      },
      {
        id: 'CURSED_THORNS',
        width: 48,
        height: 28,
        hitbox: { offsetX: 4, offsetY: 4, width: 40, height: 24 },
      },
      // --- 후반(속도가 오른 뒤)에 등장하는 변화형 장애물 ---
      {
        // 쌍둥이 바위: 폭이 넓어서 점프 타이밍이 더 중요하다
        id: 'TWIN_ROCK',
        width: 64,
        height: 32,
        hitbox: { offsetX: 4, offsetY: 4, width: 56, height: 28 },
        minSpeed: 272,
        weight: 0.8,
      },
      {
        // 박쥐 요괴: 공중을 날아온다. 점프하면 부딪히니 "점프하지 말고" 아래로 지나가야 한다.
        // flyY = 바닥에서 박쥐 윗면까지의 높이, extraSpeed = 월드보다 더 빨리 다가오는 속도
        id: 'BAT',
        width: 36,
        height: 22,
        hitbox: { offsetX: 4, offsetY: 4, width: 28, height: 14 },
        flyY: 88,
        extraSpeed: 25,
        warn: true,
        minSpeed: 340,
        weight: 0.35,
      },
    ],
    WARNING_TIME: 1.3,          // 경고(!)가 먼저 뜨고 이 시간(초) 뒤에 장애물이 나타남
    // 장애물 간 안전 최소/최대 거리 (px)
    MIN_GAP_DISTANCE: 340,
    MAX_GAP_DISTANCE: 520,
  },

  // 난이도 및 속도 증가 시스템
  DIFFICULTY: {
    INITIAL_SPEED: 250,       // 시작 속도 (px/s)
    MAX_SPEED: 440,           // 최고 속도 제한 (px/s)
    SPEED_ACCELERATION: 3.2,  // 초당 속도 증가량 (px/s^2) - 약 60초에 걸쳐 점진적 최고 속도 도달
  },

  // 점수 산정 규칙
  SCORE: {
    POINTS_PER_PIXEL: 0.1,    // 10px 이동 시 1점 누적
    // 결과 화면 등급 (점수가 min 이상이면 해당 등급)
    GRADES: [
      { min: 0, label: 'C', color: '#94a3b8' },
      { min: 300, label: 'B', color: '#74c0fc' },
      { min: 800, label: 'A', color: '#06d6a0' },
      { min: 1500, label: 'S', color: '#ffd166' },
      { min: 2500, label: 'SS', color: '#ff5d73' },
    ],
  },

  // 지형 및 플랫폼 설정 (STEP 5 & 6 밸런스 조정)
  TERRAIN: {
    INITIAL_PLATFORM_WIDTH: 850, // 게임 시작 시 초기 안전 지면 길이 (px)
    MIN_PLATFORM_WIDTH: 380,     // 최소 지면 길이 (px)
    MAX_PLATFORM_WIDTH: 700,     // 최대 지면 길이 (px)
    MIN_GAP_WIDTH: 120,          // 최소 낭떠러지 너비 (일반 점프로 안전 통과)
    MAX_GAP_WIDTH: 290,          // 최대 낭떠러지 너비 (갈고리 액션 유도)
    FALL_DEATH_Y: 355,           // 추락 판정 및 게임 오버 기준 Y 좌표
    SAFE_LANDING_MARGIN: 130,    // 낭떠러지 건넌 직후 착지 안전 여유 구역 (px)
    SAFE_TAKEOFF_MARGIN: 110,    // 낭떠러지 진입 전 도약 준비 안전 구역 (px)
  },

  // 갈고리 액션 및 로프 물리 설정 (STEP 5 & 6 밸런스 조정)
  HOOK: {
    MAX_RANGE: 240,              // 갈고리 탐색 및 연결 최대 사거리 (px)
    ANCHOR_SPACING_MIN: 200,     // 앵커 간 최소 간격 (px)
    ANCHOR_SPACING_MAX: 300,     // 앵커 간 최대 간격 (px)
    ANCHOR_Y_MIN: 65,            // 앵커 최저 높이 Y
    ANCHOR_Y_MAX: 95,            // 앵커 최고 높이 Y
    PENDULUM_GRAVITY: 2100,      // 진자 운동 각가속도 중력 계수
    DAMPING: 0.10,               // 회전 감쇠 계수
    RELEASE_BOOST_X: 1.25,       // 해제 시 수평 관성 비행 부스트
    RELEASE_BOOST_Y: 1.25,       // 해제 시 수직 상승 관성 부스트
    SOMERSAULT_SPEED: 12.0,      // 공중제비 회전 각속도 (rad/s)
  },

  // 니어미스(아슬아슬 통과) 및 콤보 설정
  NEAR_MISS: {
    OBSTACLE_MAX_GAP: 16,       // 장애물 위를 지나갈 때 히트박스 간 최소 수직 간격이 이 값 이하면 니어미스 (px)
    OBSTACLE_PERFECT_GAP: 6,    // 이 값 이하면 퍼펙트 (px)
    LEDGE_MAX_OVERLAP: 14,      // 낭떠러지 건너편 지면 끝에 발이 이만큼만 걸쳐 착지하면 아슬아슬 착지 (px)
    BASE_POINTS: 30,            // 니어미스 기본 보너스 점수
    PERFECT_MULTIPLIER: 2,      // 퍼펙트 보너스 배율
    LEDGE_POINTS: 40,           // 아슬아슬 착지 기본 보너스 점수
    COMBO_TIMEOUT: 2.8,         // 이 시간(초) 안에 다음 니어미스가 없으면 콤보 종료
    MAX_COMBO_MULTIPLIER: 5,    // 콤보 점수 배율 상한 (보너스 = 기본 점수 × min(콤보, 상한))
  },

  // 타격감 연출 설정 (수치를 0으로 두면 해당 연출이 꺼짐)
  // 코인 (달리는 중 줍기 → 상점 재화)
  COINS: {
    RADIUS: 8,
    PICKUP_PADDING: 6,
    PLATFORM_LINE_CHANCE: 0.55,
    GAP_ARC_CHANCE: 0.7,
    OBSTACLE_ARC_CHANCE: 0.85,
    GROUND_HEIGHT: 26,
    MAGNET_SPEED: 360,
  },

  EFFECTS: {
    SHAKE_SCALE: 1.0,           // 모든 화면 흔들림 강도 배율
    HIT_STOP_DEATH: 0.09,       // 장애물 충돌 시 화면 정지 시간 (초)
    HIT_STOP_NEAR_MISS: 0.035,  // 니어미스 성공 시 화면 정지 시간 (초)
    HIT_STOP_HOOK: 0.03,        // 갈고리 연결 시 화면 정지 시간 (초)
    LAND_SHAKE_SPEED: 650,      // 이 낙하 속도 이상으로 착지하면 화면이 살짝 흔들림 (px/s)
    SPEED_LINES: true,          // 속도감 라인 표시
    MILESTONE_STEP: 500,        // 이 점수마다 마일스톤 팝업 표시
  },

  // 조작 키 바인딩 설정
  KEYS: {
    JUMP: ['Space', 'ArrowUp'],
    HOOK: ['KeyZ', 'KeyJ', 'ShiftLeft', 'ShiftRight'],
    PAUSE: ['KeyP', 'Escape'],
  },

  // 게임 루프 설정
  LOOP: {
    MAX_DELTA_TIME: 0.1,      // 프레임 드랍 시 과도한 물리 점프 방지 (최대 100ms)
    TARGET_FPS: 60,
  },
});
