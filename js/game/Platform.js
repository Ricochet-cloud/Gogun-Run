/**
 * 단일 지면 플랫폼 객체 (Ground Platform)
 */
export class Platform {
  /**
   * @param {number} x 시작 X 좌표
   * @param {number} y 플랫폼 상단 표면 Y 좌표
   * @param {number} width 플랫폼 가로 길이
   * @param {number} height 플랫폼 세로 높이
   * @param {number} id 고유 식별 번호
   */
  constructor(x, y, width, height, id = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.id = id;
  }

  /**
   * 월드 스크롤에 따른 이동
   * @param {number} dt 경과 시간
   * @param {number} speed 스크롤 속도 (px/s)
   */
  update(dt, speed) {
    this.x -= speed * dt;
  }

  /**
   * 화면 좌측 바깥으로 완전히 벗어났는지 확인
   * @returns {boolean}
   */
  isOffScreen() {
    return this.x + this.width < -120;
  }
}
