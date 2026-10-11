#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把简听打包成免装 Python 的窗口版。

    python tools/build_exe.py            → dist/Jianting.exe（单文件）
    python tools/build_exe.py --onedir   → dist/Jianting/Jianting.exe（文件夹版）

两种的区别只有一处：单文件版每次启动都要把内容解包到临时目录（约 0.7 秒），
文件夹版不解包、启动更快，代价是发的时候要发整个文件夹。功能完全一样。

应用本体（index.html / css / js / samples / assets）被打进 exe，运行时解包到临时目录，
app.py 靠 `sys._MEIPASS` 找到它们；用户数据照旧写在 `%LOCALAPPDATA%\\Jianting`，
所以换不换 exe、删不删 exe，训练进度都不会丢。
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAME = 'Jianting'
DIST = ROOT / 'dist'
WORK = ROOT / 'build'
ONEDIR = '--onedir' in sys.argv[1:]

# 应用本体：窗口版按原样服务这些文件，少一个就白屏或少零件
PAYLOAD = ('index.html', 'css', 'js', 'samples', 'assets')


def exe_locked(path: Path) -> bool:
    """产物正被运行中的实例占用时，PyInstaller 会以 PermissionError 失败。
    先自己探一次，把「你忘了关窗口」变成一句人话，而不是一堆 traceback。"""
    if not path.exists():
        return False
    try:
        with path.open('r+b'):
            return False
    except OSError:
        return True


def main() -> int:
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print('缺少 PyInstaller，请先运行：python -m pip install pyinstaller')
        return 1

    icon = ROOT / 'assets' / 'jianting.ico'
    exe = (DIST / NAME / f'{NAME}.exe') if ONEDIR else (DIST / f'{NAME}.exe')
    if exe_locked(exe):
        print(f'打包中止：{exe} 正被占用。\n请先关掉正在运行的简听窗口，再重新运行本脚本。')
        return 1

    args = [
        sys.executable, '-m', 'PyInstaller',
        '--noconfirm', '--clean',
        '--onedir' if ONEDIR else '--onefile',
        '--windowed',                      # 不弹控制台
        '--name', NAME,
        '--distpath', str(DIST),
        '--workpath', str(WORK / 'pyinstaller'),
        '--specpath', str(WORK),
        # pywebview 的平台后端是动态导入的，静态分析看不见，必须显式钉住
        '--hidden-import', 'webview.platforms.winforms',
        '--hidden-import', 'clr',
        '--hidden-import', 'clr_loader',
        '--collect-submodules', 'webview',
    ]
    if icon.is_file():
        args += ['--icon', str(icon)]

    for item in PAYLOAD:
        src = ROOT / item
        if not src.exists():
            print(f'缺少打包内容：{src}')
            return 1
        # 目录保持原目录名，单文件落到包根（index.html 必须在根）
        dest = item if src.is_dir() else '.'
        args += ['--add-data', f'{src}{os.pathsep}{dest}']

    args.append(str(ROOT / 'app.py'))

    print(f'PyInstaller 打包中（{"文件夹版" if ONEDIR else "单文件版"}），第一次会比较慢 …')
    result = subprocess.run(args)
    if result.returncode != 0:
        print('打包失败。')
        return result.returncode

    if not exe.is_file():
        print(f'打包结束但没找到 {exe}')
        return 1
    if ONEDIR:
        total = sum(f.stat().st_size for f in exe.parent.rglob('*') if f.is_file())
        print(f'\n完成：{exe.parent}\\（整个文件夹 {total / 1048576:.1f} MB，发的时候一起发）')
    else:
        print(f'\n完成：{exe}  ({exe.stat().st_size / 1048576:.1f} MB)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
