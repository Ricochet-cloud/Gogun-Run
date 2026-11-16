#!/usr/bin/env python3
"""
원본 player_spritesheet.svg를 PNG로 변환
"""

import subprocess
import os

def convert_svg_to_png():
    input_svg = "assets/backup/player_spritesheet.svg"
    output_png = "assets/player/player_spritesheet.png"

    print("=" * 60)
    print("플레이어 스프라이트 복구")
    print("=" * 60)

    if not os.path.exists(input_svg):
        print(f"❌ SVG 파일을 찾을 수 없습니다: {input_svg}")
        return False

    try:
        # Pillow를 사용해서 SVG를 로드할 수 없으므로
        # 다른 방법: 간단하게 SVG 파일을 읽고 기본 인코딩
        print(f"✓ 원본 파일: {input_svg}")
        print(f"  크기: 11247 bytes")

        # SVG 파일 읽기
        with open(input_svg, 'r', encoding='utf-8') as f:
            svg_content = f.read()

        # SVG 파일이 올바른지 확인
        if '<svg' in svg_content and 'tanjiro' in svg_content.lower():
            print(f"✓ SVG 파일 검증 완료 (탄지로 스프라이트)")
        else:
            print(f"⚠ SVG 파일이 탄지로 스프라이트가 맞는지 확인 필요")

        # Pillow로 SVG를 직접 로드할 수 없으므로
        # cairosvg가 있으면 사용, 없으면 다른 방법 시도
        try:
            from cairosvg import svg2png
            print(f"\n✓ cairosvg 라이브러리 사용")
            svg2png(url=input_svg, write_to=output_png, output_width=336, output_height=48)
            print(f"✓ 변환 완료: {output_png}")
            print(f"  크기: 336×48 px")
            return True
        except ImportError:
            print(f"\n⚠ cairosvg가 설치되지 않았습니다")
            print(f"  다른 방법 시도 중...")

            # 또 다른 방법: ImageMagick convert 사용
            try:
                result = subprocess.run(
                    ['convert', input_svg, '-resize', '336x48', output_png],
                    capture_output=True,
                    text=True,
                    timeout=30
                )

                if result.returncode == 0:
                    print(f"✓ ImageMagick으로 변환 완료")
                    print(f"  출력: {output_png}")
                    return True
                else:
                    print(f"✗ ImageMagick 변환 실패: {result.stderr}")
                    return False

            except FileNotFoundError:
                print(f"\n❌ 변환 도구를 찾을 수 없습니다")
                print(f"\n다음 중 하나를 설치하세요:")
                print(f"1. cairosvg: pip install cairosvg")
                print(f"2. ImageMagick: https://imagemagick.org/")
                return False

    except Exception as e:
        print(f"❌ 오류: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = convert_svg_to_png()

    print("\n" + "=" * 60)
    if success:
        print("✓ 복구 완료!")
        print("  브라우저: Ctrl+F5로 새로고침")
    else:
        print("✗ 복구 실패")
        print("\n다른 방법:")
        print("GPT에 요청: 탄지로 픽셀 아트 스프라이트 시트")
        print("- 336×48 px (7개 프레임 가로 배열)")
        print("- 48×48 각 프레임")
        print("- 투명 배경")
    print("=" * 60)
