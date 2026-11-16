# Gogun Run (고군 런) — 귀멸 테마 픽셀 액션 러너

HTML5 Canvas와 Vanilla JavaScript ES Modules로 구현된 2D 무한 러너 게임입니다.

---

## 1. 실행 방법

ES Modules를 사용하므로 로컬 웹 서버 환경에서 실행해야 합니다.

```bash
# Python 내장 서버 실행
python -m http.server 8000

# 또는 npx serve 실행
npx serve -l 3000
```

실행 후 브라우저에서 `http://localhost:8000`으로 접속합니다.

### 기본 조작법
- **점프**: `Space` / `ArrowUp` / `마우스 좌클릭` / 화면 우하단 `[JUMP]` 터치 버튼
  - 지상에서 일반 점프를 수행합니다.
  - 갈고리에 연결된 상태에서 누르면 갈고리를 풀고 전방 관성 점프를 수행합니다.
  - 시작 화면에서는 게임 시작, 게임 오버 화면에서는 재시작으로 작동합니다.
- **갈고리(와이어 액션)**: `Z` / `J` / `Shift` / `마우스 우클릭` / 화면 우하단 `[HOOK]` 터치 버튼
  - 사거리 내에 황금빛 조준 링이 표시된 앵커가 있을 때 누르면 갈고리를 발사하여 연결합니다.
  - 연결된 상태에서는 중력과 관성에 따라 앵커를 중심으로 원호를 그리며 진자 회전 운동을 합니다.
  - 연결 상태에서 한 번 더 누르면 갈고리를 해제하며 모인 관성 속도로 공중제비(Somersault) 비행을 합니다.
- **일시정지**: `P` / `Escape` 또는 상단 HUD `[❚❚]` 버튼
- **UI 조작**: 마우스 클릭 또는 터치 (시작, 일시정지, 계속하기, 다시하기, 메인으로, 환경 설정)

---

## 2. 에셋 교체 가이드 (Asset Customization Guide)

본 프로젝트는 **에셋 설정 파일(`config/assets.config.js`)과 게임 로직이 완전히 분리**되어 있어, 코드 수정 없이 이미지 파일 교체와 설정값 변경만으로 캐릭터, 장애물, 배경, 바닥을 커스텀할 수 있습니다.

> [!TIP]
> 권장 이미지 형식은 투명 배경을 지원하는 **PNG** 또는 **SVG** 파일입니다.

---

### 2.1 플레이어 스프라이트 교체

플레이어 이미지는 가로로 나열된 스프라이트 시트(Sprite Sheet) 구조를 사용합니다.

- **기본 경로**: `assets/player/player_spritesheet.svg` (또는 `.png`)
- **설정 위치**: `config/assets.config.js` -> `ASSETS_CONFIG.PLAYER`

```javascript
PLAYER: {
  SRC: 'assets/player/my_character.png', // 교체할 이미지 파일 경로
  FRAME_WIDTH: 48,                       // 개별 프레임 가로폭 (px)
  FRAME_HEIGHT: 48,                      // 개별 프레임 세로높이 (px)
  RENDER_WIDTH: 48,                      // 캔버스에 그릴 가로폭
  RENDER_HEIGHT: 48,                     // 캔버스에 그릴 세로높이
  OFFSET_X: -6,                          // 충돌 히트박스 기준 시각적 X 보정
  OFFSET_Y: 0,                           // 충돌 히트박스 기준 시각적 Y 보정
  ANIMATIONS: {
    RUN: {
      FRAMES: [0, 1, 2, 3],              // 달리기 프레임 인덱스 목록 (0부터 시작)
      FPS: 10,                           // 초당 프레임 재생 속도
      LOOP: true,                        // 무한 반복 여부
    },
    JUMP: {
      FRAMES: [4],                       // 점프 체공 프레임
      FPS: 1,
      LOOP: false,
    },
    LAND: {
      FRAMES: [5],                       // 착지 임팩트 모션 프레임
      FPS: 8,
      LOOP: false,
    },
    DEAD: {
      FRAMES: [6],                       // 게임 오버/사망 프레임
      FPS: 1,
      LOOP: false,
    },
  },
}
```

#### 프레임 번호 및 애니메이션 조정 방법
1. 스프라이트 시트 내 48×48 크기의 프레임들을 왼쪽에서 오른쪽으로 0, 1, 2, 3... 번호가 매겨집니다.
2. 프레임 수가 달라진 경우 `FRAMES: [0, 1, 2, 3, 4, 5]` 형태로 프레임 배열을 수정합니다.
3. 달리기 동작을 빠르게 하려면 `FPS` 값을 12~14로 높이고, 부드럽게 하려면 낮춥니다.
4. 히트박스(물리 판정)와 캐릭터 발끝이 맞지 않을 경우 `OFFSET_X`, `OFFSET_Y`를 1~2px 단위로 미세 조정합니다.

---

### 2.2 장애물 에셋 교체

게임 내 3종의 장애물은 독립된 단일 이미지 또는 스프라이트로 교체 가능합니다.

- **설정 위치**: `config/assets.config.js` -> `ASSETS_CONFIG.OBSTACLES`

| 장애물 ID | 기본 에셋 파일 | 권장 크기 (가로×세로) | 설명 |
|---|---|---|---|
| `DEMON_ROCK` | `assets/obstacles/demon_rock.svg` | 26 × 32 px | 도깨비 바위 |
| `WOODEN_SPIKE` | `assets/obstacles/wooden_spike.svg` | 32 × 46 px | 목책 말뚝 및 부적 |
| `CURSED_THORNS` | `assets/obstacles/cursed_thorns.svg` | 48 × 28 px | 저주 가시 덤불 |

#### 교체 예시:
```javascript
OBSTACLES: {
  DEMON_ROCK: {
    SRC: 'assets/obstacles/my_rock.png',
    RENDER_WIDTH: 26,
    RENDER_HEIGHT: 32,
    OFFSET_X: 0,
    OFFSET_Y: 0,
  },
  // ...
}
```
> [!NOTE]
> 충돌 판정 히트박스는 `config/game.config.js`의 `OBSTACLES.TYPES[].hitbox`에 설정되어 있어, 이미지를 변경해도 게임 밸런스에 영향을 주지 않고 안전하게 렌더링됩니다.

---

### 2.3 배경 패럴랙스 레이어 교체

원근감을 주는 3단계 패럴랙스(원경 / 중경 / 전경) 레이어를 지원합니다.

- **설정 위치**: `config/assets.config.js` -> `ASSETS_CONFIG.BACKGROUND.LAYERS`
- **권장 크기**: 640 × 360 px (가로 좌우 끝이 자연스럽게 이어지는 심리스(Seamless) 이미지 권장)

```javascript
BACKGROUND: {
  LAYERS: [
    {
      ID: 'FAR',
      SRC: 'assets/background/bg_far.png',
      SPEED_FACTOR: 0.1,  // 원경: 게임 속도의 10%로 천천히 스크롤 (밤하늘, 달, 산)
      WIDTH: 640,
      HEIGHT: 360,
      Y: 0,
    },
    {
      ID: 'MID',
      SRC: 'assets/background/bg_mid.png',
      SPEED_FACTOR: 0.35, // 중경: 게임 속도의 35%로 스크롤 (소나무 숲, 대나무)
      WIDTH: 640,
      HEIGHT: 360,
      Y: 0,
    },
    {
      ID: 'NEAR',
      SRC: 'assets/background/bg_near.png',
      SPEED_FACTOR: 0.65, // 전경: 게임 속도의 65%로 스크롤 (등롱, 목책 울타리)
      WIDTH: 640,
      HEIGHT: 360,
      Y: 0,
    },
  ],
}
```

---

### 2.4 바닥 타일 교체

바닥은 가로로 무한 반복(Tiling) 스크롤되는 타일 이미지입니다.

- **설정 위치**: `config/assets.config.js` -> `ASSETS_CONFIG.GROUND`
- **권장 크기**: 64 × 70 px (좌우 경계선이 자연스럽게 연결되는 패턴)

```javascript
GROUND: {
  SRC: 'assets/ground/my_ground_tile.png',
  TILE_WIDTH: 64,  // 타일 패턴 1개 가로폭
  TILE_HEIGHT: 70, // 바닥 전체 높이 (Y: 290 ~ 360)
  Y: 290,
}
```

---

### 2.5 안전한 폴백(Fallback) 렌더링 시스템

- 에셋 이미지 파일이 누락되거나 경로 오타, 네트워크 오류 등으로 로딩에 실패하더라도 **게임이 멈추거나 튕기지 않습니다.**
- [`AssetLoader`](file:///C:/My_Project_Pri/Gogun-Run/js/systems/AssetLoader.js)가 실패를 감지하면 자동으로 내장된 **절차적 픽셀 아트 도형 렌더링**으로 즉시 전환되어 게임 플레이가 온전히 유지됩니다.

---

### 2.6 오디오 파일 교체 가이드 (Audio Customization Guide)

오디오 시스템은 파일 교체 및 설정 파일(`config/audio.config.js`) 수정을 통해 자유롭게 커스텀할 수 있습니다.

- **설정 위치**: `config/audio.config.js` -> `AUDIO_CONFIG`
- **지원 포맷**: `.wav`, `.mp3`, `.ogg`

| 오디오 키 | 기본 파일 경로 | 설명 | 권장 속성 |
|---|---|---|---|
| `BGM.MAIN` | `assets/audio/bgm_main.wav` | 메인 플레이 배경음악 | 루프(Loop) 가능한 음원 |
| `SFX.JUMP` | `assets/audio/sfx_jump.wav` | 점프 도약 효과음 | 짧고 경쾌한 사운드 (~0.2s) |
| `SFX.LAND` | `assets/audio/sfx_land.wav` | 착지 충격 효과음 | 바닥 접지음 (~0.15s) |
| `SFX.HIT` | `assets/audio/sfx_hit.wav` | 장애물 충돌 효과음 | 강한 타격음 (~0.3s) |
| `SFX.GAME_OVER` | `assets/audio/sfx_game_over.wav` | 게임 오버 사운드 | 패배 징글/하강 멜로디 (~1.2s) |
| `SFX.BUTTON_CLICK` | `assets/audio/sfx_click.wav` | UI 버튼 클릭 효과음 | 명료한 클릭 비프음 (~0.05s) |

#### 오디오 교체 방법:
1. 원하는 음원 파일(`my_bgm.mp3` 등)을 `assets/audio/` 폴더에 복사합니다.
2. `config/audio.config.js` 파일에서 해당 키의 `SRC` 경로 및 `VOLUME_FACTOR`를 수정합니다.
3. 브라우저를 새로고침하면 교체된 오디오가 즉시 적용됩니다.

> [!NOTE]
> 오디오 파일이 누락되었거나 로드에 실패해도 게임이 중단되지 않고 Web Audio API 내장 신디사이저가 8비트 레트로 효과음을 자동으로 합성하여 재생합니다.

---

### 2.7 최고 기록 및 설정 저장 (LocalStorage)

- **최고 기록**: `GOGUN_RUN_HIGH_SCORE` 키로 브라우저에 자동 저장되며, 신기록 달성 시 축하 배너가 표시됩니다.
- **오디오 설정**: `GOGUN_RUN_AUDIO_SETTINGS` 키로 BGM 볼륨, SFX 볼륨, 음소거 여부가 저장되어 다음 방문 시에도 유지됩니다.
- 시크릿 모드나 쿠키 차단 등으로 LocalStorage 접근이 불가능한 경우에도 인메모리 폴백으로 안전하게 게임이 진행됩니다.

---

### 2.8 지형 및 갈고리 액션 물리 설정 (STEP 5)

지형의 낭떠러지 크기와 갈고리 물리 계수는 `config/game.config.js`에서 세밀하게 조절할 수 있습니다.

- **설정 위치**: `config/game.config.js` -> `GAME_CONFIG.TERRAIN`, `GAME_CONFIG.HOOK`

```javascript
TERRAIN: {
  INITIAL_PLATFORM_WIDTH: 850, // 초기 안전 지면 길이 (px)
  MIN_PLATFORM_WIDTH: 380,     // 최소 지면 길이 (px)
  MAX_PLATFORM_WIDTH: 700,     // 최대 지면 길이 (px)
  MIN_GAP_WIDTH: 120,          // 최소 낭떠러지 너비 (일반 점프로 안전 통과)
  MAX_GAP_WIDTH: 290,          // 최대 낭떠러지 너비 (갈고리 액션 유도)
  FALL_DEATH_Y: 355,           // 추락 판정 및 게임 오버 기준 Y 좌표
  SAFE_LANDING_MARGIN: 130,    // 낭떠러지 건넌 직후 착지 안전 여유 구역 (px)
  SAFE_TAKEOFF_MARGIN: 110,    // 낭떠러지 진입 전 도약 준비 안전 구역 (px)
},

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
}
```
