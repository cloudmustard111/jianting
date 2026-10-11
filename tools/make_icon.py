#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成简听 JIANTING 的应用图标。

图形直接取自 DESIGN.md 的 SIGNATURE —— FL 式钢琴卷帘：纸阶行底 + 拍线网格 +
「朱红块=根音、靛蓝块=和弦音」。颜色全部是设计 token 原值，不引入新色。

    python tools/make_icon.py

输出 assets/jianting.ico（16/24/32/48/64/128/256 多尺寸）与 assets/jianting.png（预览）。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'assets'

UNIT = 4                       # 在 1024 上作画（256 × 4），再降采样
MASTER = 256 * UNIT

# ---- DESIGN.md token 原值 ----
PAPER = '#f6efdb'              # 页边旧纸
ROLL_ROW_WHITE = '#f7f2e4'     # 卷帘白键行
ROLL_ROW_BLACK = '#e9e1cb'     # 卷帘黑键行
GRID_BEAT = '#ddd3ba'          # 拍线
HAIRLINE = '#d8cfb8'           # 界栏细线
CONTROL_LINE = '#a89c7e'       # 控件线（卡片描边）
KEY_FRAME = '#55503f'          # 键盘框：卡片的墨色外框，保证 16px 下有轮廓
RED = '#b5432a'                # 朱红：根音
INDIGO = '#2d5f8a'             # 靛蓝：和弦音
HANDLE = (250, 246, 236, 178)  # 反白纸影：音符块右缘把手

SIZES = (16, 24, 32, 48, 64, 128, 256)


def u(value: float) -> int:
    return round(value * UNIT)


def box(x0, y0, x1, y1):
    return [u(x0), u(y0), u(x1), u(y1)]


def draw_master() -> Image.Image:
    img = Image.new('RGBA', (MASTER, MASTER), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 纸卡片（外框用键盘框色，降采样到 16px 时才留得住轮廓）
    d.rounded_rectangle(box(7, 7, 249, 249), radius=u(34), fill=PAPER,
                        outline=KEY_FRAME, width=u(5))

    # 卷帘区：3 行
    rx0, rx1 = 36, 220
    ry0, ry1 = 46, 210
    row_h = (ry1 - ry0) / 3
    for i in range(3):
        top, bottom = ry0 + i * row_h, ry0 + (i + 1) * row_h
        d.rectangle(box(rx0, top, rx1, bottom),
                    fill=ROLL_ROW_WHITE if i % 2 == 0 else ROLL_ROW_BLACK)
        if i:
            d.line(box(rx0, top, rx1, top), fill=HAIRLINE, width=u(1.5))

    # 拍线网格 + 一条小节线
    step = (rx1 - rx0) / 4
    for i in range(1, 4):
        gx = rx0 + i * step
        width = u(3) if i == 2 else u(1.5)
        color = CONTROL_LINE if i == 2 else GRID_BEAT
        d.line(box(gx, ry0, gx, ry1), fill=color, width=width)
    d.rectangle(box(rx0, ry0, rx1, ry1), outline=HAIRLINE, width=u(1.5))

    # 音符块：中行朱红根音，上下两行靛蓝和弦音（构成音上行排列）
    def note(x0, x1, row, color):
        top = ry0 + row * row_h + 1.5
        bottom = ry0 + (row + 1) * row_h - 1.5
        d.rectangle(box(x0, top, x1, bottom), fill=color)
        handle = x1 - 4.5
        d.rectangle(box(handle, top, x1 - 1.5, bottom), fill=HANDLE)

    note(36, 126, 1, RED)      # 根音：从第 0 拍起
    note(98, 160, 0, INDIGO)   # 三音
    note(142, 220, 2, INDIGO)  # 五音

    return img


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    master = draw_master()
    base = master.resize((256, 256), Image.LANCZOS)

    ico = OUT_DIR / 'jianting.ico'
    base.save(ico, format='ICO', sizes=[(s, s) for s in SIZES])

    preview = OUT_DIR / 'jianting.png'
    base.save(preview)

    # 32px 下的真实观感单独导一张放大的，方便肉眼验收
    base.resize((32, 32), Image.LANCZOS).resize((256, 256), Image.NEAREST).save(
        OUT_DIR / 'jianting-32px-check.png'
    )

    print(f'icon  -> {ico}  ({ico.stat().st_size} bytes)')
    print(f'preview -> {preview}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
