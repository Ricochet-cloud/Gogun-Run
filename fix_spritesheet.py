#!/usr/bin/env python3
"""
스프라이트 시트 수정 스크립트
2032×774 이미지를 336×48로 변환 및 7개 프레임으로 정렬
"""

from PIL import Image
import os

def fix_player_spritesheet():
    input_path = "assets/player/player_spritesheet.png"
    output_path = "assets/player/player_spritesheet.png"

    if not os.path.exists(input_path):
        print(f"❌ 파일을 찾을 수 없습니다: {input_path}")
        return False

    try:
        # 1. 원본 이미지 로드
        img = Image.open(input_path)
        print(f"✓ 원본 이미지 로드: {img.size}")

        # 2. 이미지를 7개의 48×48 프레임으로 나누기
        # 원본이 2032×774라면, 가로로 7등분, 세로로 프레임 추출
        original_width = img.width
        original_height = img.height

        # 7개 프레임을 추출할 것임
        frame_count = 7
        frame_width = original_width // frame_count
        frame_height = original_height

        print(f"✓ 원본 이미지를 {frame_count}개 프레임으로 분할")
        print(f"  각 프레임 크기: {frame_width}×{frame_height}")

        # 3. 각 프레임을 48×48으로 리사이징
        frames = []
        for i in range(frame_count):
            left = i * frame_width
            top = 0
            right = left + frame_width
            bottom = frame_height

            # 프레임 추출
            frame = img.crop((left, top, right, bottom))

            # 48×48으로 리사이징 (비율 유지, 흰 배경 추가)
            frame.thumbnail((48, 48), Image.Resampling.LANCZOS)

            # 투명 배경의 48×48 이미지 생성
            output_frame = Image.new('RGBA', (48, 48), (0, 0, 0, 0))

            # 리사이징된 이미지를 중앙에 배치
            offset_x = (48 - frame.width) // 2
            offset_y = (48 - frame.height) // 2
            output_frame.paste(frame, (offset_x, offset_y), frame if frame.mode == 'RGBA' else None)

            frames.append(output_frame)
            print(f"  ✓ 프레임 {i}: {frame.size} → {output_frame.size}")

        # 4. 7개 프레임을 가로로 배열 (336×48)
        final_img = Image.new('RGBA', (48 * frame_count, 48), (0, 0, 0, 0))

        for i, frame in enumerate(frames):
            final_img.paste(frame, (i * 48, 0), frame)

        # 5. 최종 이미지 저장
        final_img.save(output_path, 'PNG')
        print(f"\n✓ 최종 스프라이트 시트 저장")
        print(f"  경로: {output_path}")
        print(f"  크기: {final_img.size} (예상: (336, 48))")

        return True

    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("=" * 50)
    print("스프라이트 시트 수정 시작")
    print("=" * 50)

    success = fix_player_spritesheet()

    print("=" * 50)
    if success:
        print("✓ 완료! 브라우저에서 새로고침(Ctrl+F5)하세요")
    else:
        print("✗ 실패했습니다")
    print("=" * 50)
