# 从 assets/jianting.png 生成 Android 启动图标（各密度 legacy + 自适应前景）。
# 可重跑；颜色取自 DESIGN.md 的纸面色，图形居中落在自适应图标的 66% 安全区内。
from PIL import Image, ImageDraw, ImageOps
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res"
SRC = Image.open(ROOT / "assets" / "jianting.png").convert("RGBA")
BG = (246, 239, 219, 255)  # #f6efdb 旧纸页边

# 自适应图标画布 108dp；前景图形占 62%（66% 安全区留一点呼吸）
FOREGROUND_DP = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
LAUNCHER_DP = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

def fit_logo(size, ratio):
    box = (SRC.width * ratio, SRC.height * ratio)
    logo = SRC.resize((int(box[0]), int(box[1])), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    return canvas

def solid_bg(size, mask=None):
    img = Image.new("RGBA", (size, size), BG)
    if mask is not None:
        img.putalpha(mask)
    return img

for dpi, size in FOREGROUND_DP.items():
    folder = RES / f"mipmap-{dpi}"
    folder.mkdir(parents=True, exist_ok=True)
    fit_logo(size, 0.62).save(folder / "ic_launcher_foreground.png", optimize=True)

for dpi, size in LAUNCHER_DP.items():
    folder = RES / f"mipmap-{dpi}"
    square = Image.alpha_composite(solid_bg(size), fit_logo(size, 0.80))
    square.save(folder / "ic_launcher.png", optimize=True)

    circle = Image.new("L", (size, size), 0)
    ImageDraw.Draw(circle).ellipse((0, 0, size - 1, size - 1), fill=255)
    round_img = Image.alpha_composite(solid_bg(size), fit_logo(size, 0.72))
    round_img.putalpha(circle)
    round_img.save(folder / "ic_launcher_round.png", optimize=True)

print("图标已生成：5 档密度 legacy + 自适应前景，底色 #f6efdb")
