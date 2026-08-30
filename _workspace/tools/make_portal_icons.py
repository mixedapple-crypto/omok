"""
포털(우리집 게임숲) 앱 아이콘 생성기.

산출물인 www/icons/*.png는 저장소에 커밋되어 있으므로 앱을 빌드하거나 배포할 때
이 스크립트가 필요하지는 않다. 아이콘 그림을 고칠 때만 돌린다.

    python _workspace/tools/make_portal_icons.py

Pillow가 필요하다. 앱 자체의 "의존성 0" 원칙과는 무관하다 — 결과물인 PNG만
www/로 들어가고, 이 스크립트는 www/ 바깥에 있어 APK에도 사이트에도 포함되지 않는다.

디자인 근거: 포털 화면(www/index.html)의 배경 그라디언트와 색 토큰을 그대로 쓴다.
오목 아이콘(바둑판)과 한눈에 구분되어야 하고, 포털의 정체성은 "게임숲"이라 나무로 간다.
캔버스 중앙 78% 안에 그림을 가두어 안드로이드 maskable 아이콘으로 잘려도 살아남게 한다.
"""
from PIL import Image, ImageDraw

# www/index.html의 :root 토큰과 같은 값이다.
SKY = (191, 228, 245)
MID = (223, 240, 216)
PAPER = (255, 246, 232)
MEADOW = (99, 185, 93)
MEADOW_DEEP = (62, 140, 74)
MEADOW_LIGHT = (143, 208, 136)
TRUNK = (154, 117, 81)
TRUNK_DARK = (124, 92, 61)
GOLD = (245, 184, 64)
CORAL = (255, 138, 92)
INK = (65, 55, 42)

SS = 4          # 슈퍼샘플링 배수. 4배로 그린 뒤 줄여서 가장자리를 매끄럽게 만든다.
BASE = 512
N = BASE * SS


def vertical_gradient(img):
    """포털 body의 linear-gradient(180deg, sky 0%, #DFF0D8 40%, paper 75%)를 옮긴 것."""
    d = ImageDraw.Draw(img)
    for y in range(N):
        t = y / (N - 1)
        if t <= 0.40:
            k = t / 0.40
            c = tuple(round(SKY[i] + (MID[i] - SKY[i]) * k) for i in range(3))
        elif t <= 0.75:
            k = (t - 0.40) / 0.35
            c = tuple(round(MID[i] + (PAPER[i] - MID[i]) * k) for i in range(3))
        else:
            c = PAPER
        d.line([(0, y), (N, y)], fill=c)


def circle(d, cx, cy, r, fill):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)


def draw_tree(img):
    d = ImageDraw.Draw(img)
    u = N / 512.0                      # 512 기준 좌표를 쓰기 위한 배율

    def px(v):
        return v * u

    # --- 땅 ---
    # 잔디 언덕. 나무가 허공에 뜬 것처럼 보이지 않게 받쳐 준다.
    d.ellipse([px(-40), px(372), px(552), px(560)], fill=MEADOW_LIGHT)
    d.ellipse([px(-40), px(392), px(552), px(580)], fill=MEADOW)

    # --- 줄기 ---
    # 아래로 갈수록 두꺼워지는 사다리꼴. 원근이 조금 생겨 밋밋하지 않다.
    d.polygon([(px(232), px(250)), (px(280), px(250)),
               (px(296), px(408)), (px(216), px(408))], fill=TRUNK)
    # 오른쪽에 그림자 면을 얹어 원통처럼 보이게 한다.
    d.polygon([(px(262), px(250)), (px(280), px(250)),
               (px(296), px(408)), (px(272), px(408))], fill=TRUNK_DARK)

    # --- 수관 ---
    # 원 세 개를 겹쳐 뭉게구름 모양으로 만든다. 깊은 색을 먼저 깔고 그 위에
    # 밝은 색을 조금 올려 왼쪽 위에서 빛이 드는 것처럼 보이게 한다.
    circle(d, px(256), px(196), px(132), MEADOW_DEEP)
    circle(d, px(158), px(232), px(88), MEADOW_DEEP)
    circle(d, px(354), px(232), px(88), MEADOW_DEEP)

    circle(d, px(248), px(186), px(122), MEADOW)
    circle(d, px(160), px(224), px(78), MEADOW)
    circle(d, px(346), px(222), px(76), MEADOW)

    circle(d, px(212), px(146), px(64), MEADOW_LIGHT)
    circle(d, px(150), px(200), px(38), MEADOW_LIGHT)

    # --- 열매 ---
    # 세 알의 색이 곧 이 숲에 사는 것들이다: 오목의 돌(먹색), 그리고 따뜻한 두 색.
    circle(d, px(196), px(252), px(21), INK)
    circle(d, px(316), px(178), px(19), GOLD)
    circle(d, px(286), px(272), px(17), CORAL)


def main():
    img = Image.new('RGB', (N, N), PAPER)
    vertical_gradient(img)
    draw_tree(img)

    out = 'www/icons'
    for size in (512, 192, 180):
        img.resize((size, size), Image.LANCZOS).save(f'{out}/icon-{size}.png', optimize=True)
        print(f'{out}/icon-{size}.png')


if __name__ == '__main__':
    main()
