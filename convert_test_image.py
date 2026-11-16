#!/usr/bin/env python3
"""
테스트 이미지를 정확한 스프라이트 시트 크기로 변환
1899×822 → 336×48 (7개 프레임, 각 48×48)
"""

from PIL import Image
import os

def convert_test_image():
    input_path = "테스트.png"
    output_path = "assets/player/player_spritesheet.png"

    if not os.path.exists(input_path):
        print(f"❌ 파일을 찾을 수 없습니다: {input_path}")
        return False

    try:
        print("=" * 60)
        print("테스트 이미지 변환 시작")
        print("=" * 60)

        # 1. 원본 이미지 로드
        img = Image.open(input_path)
        print(f"✓ 원본 이미지 로드: {img.size}")
        print(f"  형식: {img.mode}")

        # 2. 이미지를 7개 프레임으로 분할
        original_width = img.width
        original_height = img.height
        frame_count = 7

        # 각 프레임의 원본 크기
        frame_width = original_width // frame_count
        frame_height = original_height

        print(f"\n✓ 이미지를 {frame_count}개 프레임으로 분할")
        print(f"  각 프레임 원본 크기: {frame_width}×{frame_height} px")

        # 3. 각 프레임 추출 및 48×48으로 리사이징
        frames = []
        for i in range(frame_count):
            # 프레임 위치 계산
            left = i * frame_width
            top = 0
            right = left + frame_width
            bottom = frame_height

            # 프레임 추출
            frame = img.crop((left, top, right, bottom))

            # 48×48으로 리사이징 (종횡비 유지)
            frame.thumbnail((48, 48), Image.Resampling.LANCZOS)

            # RGBA 투명 배경 48×48 이미지 생성
            output_frame = Image.new('RGBA', (48, 48), (0, 0, 0, 0))

            # 리사이징된 이미지를 중앙에 배치
            offset_x = (48 - frame.width) // 2
            offset_y = (48 - frame.height) // 2

            # 프레임이 RGBA면 알파 채널 사용, 아니면 없음
            if frame.mode == 'RGBA':
                output_frame.paste(frame, (offset_x, offset_y), frame)
            else:
                # RGB 이미지인 경우 배경색 기반 투명도 설정
                frame_rgba = frame.convert('RGBA')
                output_frame.paste(frame_rgba, (offset_x, offset_y), frame_rgba)

            frames.append(output_frame)
            print(f"  ✓ 프레임 {i}: {frame.size} → 48×48")

        # 4. 7개 프레임을 가로로 배열 (336×48)
        print(f"\n✓ 스프라이트 시트 생성: {48 * frame_count}×48")
        final_img = Image.new('RGBA', (48 * frame_count, 48), (0, 0, 0, 0))

        for i, frame in enumerate(frames):
            final_img.paste(frame, (i * 48, 0), frame)

        # 5. 최종 이미지 저장
        final_img.save(output_path, 'PNG')

        print(f"\n✓ 최종 스프라이트 시트 저장")
        print(f"  경로: {output_path}")
        print(f"  크기: {final_img.size}")
        print(f"  형식: PNG (RGBA, 투명 배경)")

        print("\n" + "=" * 60)
        print("✓ 변환 완료!")
        print("=" * 60)
        print("\n다음 단계:")
        print("1. 브라우저 개발자도구 (F12) 열기")
        print("2. Console 탭에서 다음 명령 실행:")
        print("   window.__DEBUG_SHOW_BOUNDS__ = true;")
        print("3. 페이지 새로고침 (Ctrl+F5)")
        print("4. 빨간색 경계선과 녹색 바닥선 확인")
        print("5. Console에 출력된 위치 정보 공유")

        return True

    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = convert_test_image()
    exit(0 if success else 1)
