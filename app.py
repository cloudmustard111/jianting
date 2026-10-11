#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""简听 JIANTING — 桌面窗口版启动器。

把 chordlab 从「浏览器里的一个标签页」变成「一个真正的窗口」：

  1. 在 127.0.0.1 上起一个只服务本目录的静态服务器（复用 server.py 的 no-cache 处理器，
     桌面版与浏览器版行为不分叉）；
  2. 用系统自带的 WebView2 内核（Edge 运行时，Win10/11 预装）把 index.html 渲染进一个
     原生 Win32 窗口 —— 没有标签页、地址栏、刷新键、开发者工具、浏览器右键菜单；
  3. 训练进度 / 卷帘自动保存落在 %LOCALAPPDATA%\\Jianting\\WebView2 下的独立用户目录，
     不随浏览器配置走，清浏览器缓存也不会丢。

用法：
    双击 start.bat            → 无控制台窗口启动
    python app.py             → 同上，但保留控制台输出
    python app.py --selftest  → 冒烟自检：开窗、跑 JS 探针、加载 17 个钢琴采样，结果写日志后自动退出

日志：%LOCALAPPDATA%\\Jianting\\jianting.log
"""
from __future__ import annotations

import ctypes
import json
import logging
import os
import sys
import threading
import time
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

try:
    import webview
    from webview.menu import Menu, MenuAction, MenuSeparator
except ImportError:  # 依赖缺失时走 fatal() 给出人话提示，而不是 traceback
    webview = None

# --------------------------------------------------------------------------- 常量

# 源码运行 = 项目目录；PyInstaller 打包后 = 解包出来的临时目录
SOURCE_DIR = Path(__file__).resolve().parent
FROZEN = bool(getattr(sys, 'frozen', False))
ROOT = Path(getattr(sys, '_MEIPASS', SOURCE_DIR)) if FROZEN else SOURCE_DIR

APP_TITLE = '简听 JIANTING'
APP_TAGLINE = '简谱级数 · 和弦 · 练耳'

INDEX_FILE = ROOT / 'index.html'
ICON_FILE = ROOT / 'assets' / 'jianting.ico'

PING_PATH = '/__jianting_ping'
PING_TOKEN = 'jianting-desktop-v1'
# 稳定端口 = 稳定 origin = 稳定 IndexedDB。优先复用上次成功的端口。
PORT_PREFERENCE = (8766, 8767, 8768, 8769, 8770, 8771, 8772)

DEFAULT_SIZE = (1280, 900)
MIN_SIZE = (760, 560)      # 副屏常驻时要能贴半屏，窗口不能有一副「必须全屏」的架子
PAPER = '#f6efdb'          # DESIGN.md 的「页边旧纸」，用作开窗底色，消掉白色闪屏

WEBVIEW2_GUID = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
SW_RESTORE = 9


def _enable_dpi_awareness() -> None:
    """自己先把进程设成 DPI aware。

    pywebview 在 webview.start() 里才调 SetProcessDPIAware，于是同一个进程里
    Win32 会在运行中途换单位：切换前 SystemParametersInfo 回的是逻辑像素，
    切换后回物理像素。窗口命令（resize/move）只吃逻辑像素，若不先钉死，
    「贴半屏」会在缩放显示器上被放大 1.5 倍然后撞到屏幕边上。
    """
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)  # SYSTEM_DPI_AWARE，与 pywebview 一致
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


_enable_dpi_awareness()


def dpi_scale() -> float:
    """物理像素 ÷ 逻辑像素。"""
    try:
        dpi = ctypes.windll.user32.GetDpiForSystem()
        if dpi > 0:
            return dpi / 96.0
    except Exception:
        pass
    return 1.0


def _local_appdata() -> Path:
    base = os.environ.get('LOCALAPPDATA') or os.path.expanduser('~')
    return Path(base) / 'Jianting'


DATA_DIR = _local_appdata()
STATE_FILE = DATA_DIR / 'desktop.json'
WEBVIEW_DATA_DIR = DATA_DIR / 'WebView2'
LOG_FILE = DATA_DIR / 'jianting.log'

log = logging.getLogger('jianting')

RUNTIME: dict[str, object] = {'window': None, 'httpd': None, 'port': None}


# --------------------------------------------------------------------------- 日志 / 报错

def setup_logging(verbose: bool) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        if LOG_FILE.exists() and LOG_FILE.stat().st_size > 1_000_000:
            LOG_FILE.unlink()
    except OSError:
        pass

    handlers: list[logging.Handler] = [logging.FileHandler(LOG_FILE, encoding='utf-8')]
    if verbose:
        handlers.append(logging.StreamHandler(sys.stderr))

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname)-7s %(message)s',
        datefmt='%H:%M:%S',
        handlers=handlers,
        force=True,
    )


def fatal(message: str) -> None:
    """窗口还没起来就失败时，用户看不到控制台（start.bat 走 pythonw），只能弹窗。"""
    log.error(message)
    try:
        ctypes.windll.user32.MessageBoxW(None, message, APP_TITLE, 0x10)
    except Exception:
        pass


# --------------------------------------------------------------------------- 状态文件

def load_state() -> dict:
    try:
        data = json.loads(STATE_FILE.read_text('utf-8'))
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception:
        log.exception('读取 %s 失败，按默认值启动', STATE_FILE)
        return {}


def save_state(patch: dict) -> None:
    state = load_state()
    state.update(patch)
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), 'utf-8')
    except OSError:
        log.exception('写入 %s 失败', STATE_FILE)


# --------------------------------------------------------------------------- 本地服务

sys.path.insert(0, str(ROOT))
sys.dont_write_bytecode = True  # 不往项目目录里留 __pycache__
from server import NoCacheHandler  # noqa: E402  复用浏览器版处理器，两版静态服务不漂移


class AppHandler(NoCacheHandler):
    """本目录静态服务 + 一个单实例探测端点。"""

    def do_GET(self):  # noqa: N802 —— http.server 的命名约定
        if self.path.split('?', 1)[0] == PING_PATH:
            body = PING_TOKEN.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True
    # HTTPServer 默认 allow_reuse_address=1，在 Windows 上会让第二个实例也能绑同一端口，
    # 单实例检测会失灵；显式关掉。
    allow_reuse_address = False

    def handle_error(self, request, client_address):
        log.debug('连接中断：%s', client_address)


def is_our_server(port: int, timeout: float = 0.6) -> bool:
    url = f'http://127.0.0.1:{port}{PING_PATH}'
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.read().decode('utf-8', 'replace') == PING_TOKEN
    except Exception:
        return False


ERROR_ALREADY_EXISTS = 183
_instance_handle = None


def acquire_single_instance():
    """用 Win32 命名互斥体判重，O(1) 且不碰网络。

    原本靠轮询端口探测有没有实例：可这台机器上连一个**没开的**回环端口要等满超时
    （实测 1.0 秒），8 个候选端口就是白等 4 秒；更糟的是两个实例起得够近时，
    各自都还在探测窗口里，谁都没发现谁——真的双开过（8766 和 8767 各占一个）。
    互斥体由进程持有，进程一退系统就释放，不会留残留。
    返回 True=拿到、False=已有实例、None=判不了（退回端口探测）。
    """
    global _instance_handle
    try:
        kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel32.CreateMutexW.restype = ctypes.c_void_p
        kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p]
        handle = kernel32.CreateMutexW(None, 0, 'Local\\JiantingDesktopInstance')
        if not handle:
            return None
        if ctypes.get_last_error() == ERROR_ALREADY_EXISTS:
            kernel32.CloseHandle(ctypes.c_void_p(handle))
            return False
        _instance_handle = handle   # 持有到进程结束
        return True
    except Exception:
        log.exception('单实例互斥体创建失败，退回端口探测')
        return None


def find_running_instance() -> int | None:
    """兜底路径：互斥体判不了时才走这里，所以只探最可能的两个口。"""
    order: list[int] = []
    saved = load_state().get('port')
    if isinstance(saved, int):
        order.append(saved)
    order.extend(p for p in PORT_PREFERENCE[:2] if p not in order)

    for port in order:
        if is_our_server(port, timeout=0.25):
            return port
    return None


def start_server(preferred) -> tuple[LocalServer, int]:
    order: list[int] = []
    if isinstance(preferred, int):
        order.append(preferred)
    order.extend(p for p in PORT_PREFERENCE if p not in order)

    failures: list[str] = []
    for port in order:
        try:
            httpd = LocalServer(('127.0.0.1', port), partial(AppHandler, directory=str(ROOT)))
        except OSError as exc:
            failures.append(f'{port}（{exc.strerror or exc}）')
            continue
        threading.Thread(
            target=httpd.serve_forever, kwargs={'poll_interval': 0.2}, daemon=True
        ).start()
        return httpd, port

    raise OSError('端口 ' + '、'.join(map(str, order)) + ' 全部被占用：' + '；'.join(failures))


# --------------------------------------------------------------------------- 窗口几何

class _RECT(ctypes.Structure):
    _fields_ = [
        ('left', ctypes.c_long),
        ('top', ctypes.c_long),
        ('right', ctypes.c_long),
        ('bottom', ctypes.c_long),
    ]


def work_area() -> tuple[int, int, int, int] | None:
    """桌面工作区（已扣除任务栏），SPI_GETWORKAREA = 0x0030。

    返回值统一换算成 pywebview 的「逻辑像素」，与 window.resize/move 同一套单位。
    """
    try:
        rect = _RECT()
        if ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0):
            s = dpi_scale()
            return (
                round(rect.left / s),
                round(rect.top / s),
                round(rect.right / s),
                round(rect.bottom / s),
            )
    except Exception:
        log.exception('读取桌面工作区失败')
    return None


def window_geometry(saved) -> tuple[int, int, int, int]:
    """返回 (width, height, x, y)：首次居中、之后复用上次的位置，换显示器时自动回居中。"""
    area = work_area()
    if area:
        left, top, right, bottom = area
        avail_w, avail_h = right - left, bottom - top
    else:
        left = top = 0
        avail_w, avail_h = DEFAULT_SIZE

    width = max(MIN_SIZE[0], min(DEFAULT_SIZE[0], avail_w - 80))
    height = max(MIN_SIZE[1], min(DEFAULT_SIZE[1], avail_h - 60))
    x = left + max(0, (avail_w - width) // 2)
    y = top + max(0, (avail_h - height) // 2)

    if not isinstance(saved, dict):
        return width, height, x, y

    try:
        sw = max(MIN_SIZE[0], int(saved['width']))
        sh = max(MIN_SIZE[1], int(saved['height']))
        sx, sy = int(saved['x']), int(saved['y'])
    except (KeyError, TypeError, ValueError):
        return width, height, x, y

    # 位置必须仍与本屏有交集，否则按居中处理（拔掉外接屏后的常见情况）
    if area and not (sx + 120 > left and sx < right and sy + 60 > top and sy < bottom):
        return sw, sh, x, y
    return sw, sh, sx, sy


# --------------------------------------------------------------------------- WebView2 检测

def has_webview2_runtime() -> bool:
    try:
        import winreg
    except ImportError:
        return True

    keys = [
        (winreg.HKEY_LOCAL_MACHINE, rf'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_GUID}'),
        (winreg.HKEY_LOCAL_MACHINE, rf'SOFTWARE\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_GUID}'),
        (winreg.HKEY_CURRENT_USER, rf'SOFTWARE\Microsoft\EdgeUpdate\Clients\{WEBVIEW2_GUID}'),
    ]
    for hive, path in keys:
        try:
            with winreg.OpenKey(hive, path) as key:
                if winreg.QueryValueEx(key, 'pv')[0]:
                    return True
        except OSError:
            continue
    return False


# --------------------------------------------------------------------------- 应用侧接线

def eval_js(script: str):
    win = RUNTIME.get('window')
    if win is None:
        return None
    try:
        return win.evaluate_js(script)
    except Exception:
        log.exception('evaluate_js 失败：%s', script[:90])
        return None


def _click(selector: str, scroll: bool = False):
    """菜单项 → 页面上既有控件的点击，不新增应用侧 API，只复用 main.js 已接好的线。"""
    body = f'const el = document.querySelector({json.dumps(selector)}); if (!el) return "missing"; el.click();'
    if scroll:
        body += ' el.scrollIntoView({block: "center"});'
    script = f'(() => {{ {body} return "ok"; }})()'

    def action():
        log.info('菜单 → %s : %s', selector, eval_js(script))
    return action


def show_about():
    win = RUNTIME.get('window')
    if win is None:
        return
    message = (
        f'{APP_TITLE}\n{APP_TAGLINE}\n\n'
        '桌面窗口版 · WebView2 原生窗口，不经过浏览器\n'
        f'本地服务：127.0.0.1:{RUNTIME.get("port")}\n'
        f'用户数据：{WEBVIEW_DATA_DIR}\n'
        f'运行日志：{LOG_FILE}'
    )
    try:
        win.create_confirmation_dialog(APP_TITLE, message)
    except Exception:
        log.exception('关于对话框打开失败')


def _window():
    return RUNTIME.get('window')


def set_on_top(enabled: bool):
    """副屏常驻的命门：FL 全屏在前台时，工具窗口还能压在上面。"""
    def action():
        win = _window()
        if win is None:
            return
        try:
            win.on_top = enabled
            save_state({'on_top': enabled})
            log.info('置顶 = %s', enabled)
        except Exception:
            log.exception('切换置顶失败')
    return action


def snap_to(where: str):
    """把窗口摆进工作区：左半 / 右半 / 铺满 —— 编曲时和 FL 分屏。"""
    def action():
        win = _window()
        area = work_area()
        if win is None or area is None:
            return
        left, top, right, bottom = area
        avail_w, avail_h = right - left, bottom - top
        try:
            if where == 'left':
                win.resize(avail_w // 2, avail_h)
                win.move(left, top)
            elif where == 'right':
                win.resize(avail_w - avail_w // 2, avail_h)
                win.move(left + avail_w // 2, top)
            else:  # fill
                win.resize(avail_w, avail_h)
                win.move(left, top)
            log.info('窗口贴靠 = %s（工作区 %sx%s）', where, avail_w, avail_h)
        except Exception:
            log.exception('窗口贴靠失败')
    return action


def center_window():
    def action():
        win = _window()
        area = work_area()
        if win is None or area is None:
            return
        left, top, right, bottom = area
        avail_w, avail_h = right - left, bottom - top
        width = max(MIN_SIZE[0], min(DEFAULT_SIZE[0], avail_w - 80))
        height = max(MIN_SIZE[1], min(DEFAULT_SIZE[1], avail_h - 60))
        try:
            win.resize(width, height)
            win.move(left + max(0, (avail_w - width) // 2), top + max(0, (avail_h - height) // 2))
        except Exception:
            log.exception('窗口居中失败')
    return action


def build_menus() -> list:
    return [
        Menu('页面', [
            MenuAction('查询手册', _click('#main-nav a[data-page="query"]')),
            MenuAction('听辨训练', _click('#main-nav a[data-page="train"]')),
            MenuAction('进行 / MIDI', _click('#main-nav a[data-page="prog"]')),
            MenuAction('卷帘编辑', _click('#main-nav a[data-page="roll"]')),
        ]),
        Menu('窗口', [
            MenuAction('始终置顶（副屏常驻）', set_on_top(True)),
            MenuAction('取消置顶', set_on_top(False)),
            MenuSeparator(),
            MenuAction('贴屏幕左半', snap_to('left')),
            MenuAction('贴屏幕右半', snap_to('right')),
            MenuAction('铺满工作区', snap_to('fill')),
            MenuSeparator(),
            MenuAction('居中并恢复默认大小', center_window()),
        ]),
        Menu('工具', [
            MenuAction('初始化音频引擎', _click('#btn-init')),
            MenuAction('运行引擎自检', _click('#btn-selftest', scroll=True)),
            MenuSeparator(),
            MenuAction('全部停止', _click('#btn-stop-all')),
        ]),
        Menu('帮助', [
            MenuAction('关于简听', show_about),
        ]),
    ]


def focus_existing_window() -> None:
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.FindWindowW(None, APP_TITLE)
        if hwnd:
            user32.ShowWindow(hwnd, SW_RESTORE)
            user32.SetForegroundWindow(hwnd)
    except Exception:
        log.exception('前置已有窗口失败')


# --------------------------------------------------------------------------- 自检

PROBE_JS = """(() => {
  const q = (s) => document.querySelector(s);
  return JSON.stringify({
    title: document.title,
    nav: document.querySelectorAll('#main-nav .nav-item').length,
    chordChips: document.querySelectorAll('#type-groups .chip').length,
    rootButtons: document.querySelectorAll('#root-selector button').length,
    rollCanvas: !!q('#roll-canvas'),
    chordRollCanvas: !!q('#chord-roll-canvas'),
    audioApi: typeof (window.AudioContext || window.webkitAudioContext) === 'function',
    indexedDB: typeof indexedDB === 'object',
    engineState: q('#engine-status') ? q('#engine-status').dataset.state : null,
  });
})()"""

CLICK_INIT_JS = '(() => { const b = document.querySelector("#btn-init"); if (b) b.click(); return "ok"; })()'
ENGINE_DETAIL_JS = (
    '(() => { const e = document.querySelector("#engine-detail"); return e ? e.textContent : ""; })()'
)


def _selftest_flow() -> None:
    time.sleep(0.6)
    log.info('自检：点击「初始化音频」，触发采样加载')
    eval_js(CLICK_INIT_JS)

    detail = ''
    deadline = time.time() + 30
    while time.time() < deadline:
        time.sleep(0.5)
        detail = eval_js(ENGINE_DETAIL_JS) or ''
        if '17/17' in detail:
            break
        state = eval_js('(() => document.querySelector("#engine-status").dataset.state)()')
        if state in ('synth', 'partial'):
            break

    verdict = 'PASS · 17/17 采样就绪' if '17/17' in detail else 'FAIL / 降级运行'
    log.info('自检结果：%s', verdict)
    log.info('引擎明细：%s', detail)

    win = RUNTIME.get('window')
    if win is not None:
        time.sleep(0.4)
        try:
            win.destroy()
        except Exception:
            log.exception('自检收尾关窗失败')


# --------------------------------------------------------------------------- 入口

def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    selftest = '--selftest' in args
    setup_logging(verbose=selftest or '--verbose' in args or sys.stderr is not None)

    # WebView2 与普通浏览器一样默认执行自动播放策略：AudioContext 必须等一次用户手势。
    # 桌面窗口是用户自己打开的本地应用，没有这个顾虑——解除限制后引擎在开窗时就
    # 自动恢复上下文（js/audio/engine.js 的 preload 里会尝试 resume），
    # 状态芯片直接显示「采样就绪」而不是「· 待解锁」。必须在创建 WebView2
    # 环境之前生效，所以放在 main 最前面；浏览器版入口（server.py）不受影响。
    os.environ.setdefault(
        'WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', '--autoplay-policy=no-user-gesture-required')

    t_start = time.monotonic()
    log.info('%s 启动（pid=%s，root=%s）', APP_TITLE, os.getpid(), ROOT)

    if not INDEX_FILE.is_file():
        fatal(f'找不到 index.html：\n{INDEX_FILE}')
        return 1
    if webview is None:
        fatal('缺少依赖 pywebview。\n\n请先运行：\n\n    python -m pip install pywebview')
        return 1
    if not has_webview2_runtime():
        fatal(
            '系统缺少 WebView2 运行时，桌面窗口无法渲染。\n\n'
            '请安装 Microsoft Edge WebView2 Runtime（免费，微软官方）：\n'
            'https://developer.microsoft.com/microsoft-edge/webview2/'
        )
        return 1

    owned = acquire_single_instance()
    if owned is False:
        log.info('已有窗口实例在运行，改为前置它')
        focus_existing_window()
        return 0
    if owned is None:
        running = find_running_instance()
        if running is not None:
            log.info('已有窗口实例在 127.0.0.1:%s，改为前置该窗口', running)
            focus_existing_window()
            return 0

    state = load_state()
    try:
        # 恒定从 8766 起试。端口是 IndexedDB origin 的一部分，
        # 「记住上次成功的端口」会让 origin 漂移：上次被挤到 8767 后，之后每次都去 8767，
        # 用户在 8766 下积累的训练进度就看起来凭空消失了。
        httpd, port = start_server(PORT_PREFERENCE[0])
    except OSError as exc:
        fatal(f'{APP_TITLE} 启动失败：{exc}')
        return 1

    RUNTIME['httpd'] = httpd
    RUNTIME['port'] = port
    save_state({'port': port})
    if port != PORT_PREFERENCE[0]:
        log.warning('8766 被占用，本次落在 %s —— 这是一个新的 origin，'
                    '此前在 8766 下的训练进度不会出现在这里。', port)
    t_ready = time.monotonic()
    log.info('本地服务就绪：http://127.0.0.1:%s/（Python 侧启动 %.2fs）', port, t_ready - t_start)

    # MIDI 导出走系统「另存为」；pywebview 默认会拦掉所有下载
    webview.settings['ALLOW_DOWNLOADS'] = True

    # 开发用：JIANTING_CDP_PORT=9222 打开 WebView2 远程调试，供 CDP 自动化验收
    cdp_port = os.environ.get('JIANTING_CDP_PORT')
    if cdp_port and cdp_port.isdigit():
        webview.settings['REMOTE_DEBUGGING_PORT'] = int(cdp_port)
        log.info('CDP 调试端口 = %s', cdp_port)

    width, height, x, y = window_geometry(state.get('geometry'))
    url = f'http://127.0.0.1:{port}/index.html'
    on_top = bool(state.get('on_top', False))

    window = webview.create_window(
        APP_TITLE,
        url,
        width=width,
        height=height,
        x=x,
        y=y,
        on_top=on_top,
        min_size=MIN_SIZE,
        background_color=PAPER,
        text_select=True,   # 教材正文要能选中（::selection 走朱红高亮）
        zoomable=False,     # 桌面窗口不提供 Ctrl± 缩放
        menu=build_menus(),
        confirm_close=False,
    )
    RUNTIME['window'] = window

    def on_loaded():
        log.info('页面就绪（从进程启动算 %.2fs）：%s', time.monotonic() - t_start, eval_js(PROBE_JS))
        if selftest:
            threading.Thread(target=_selftest_flow, daemon=True).start()

    def on_closing():
        try:
            geometry = {
                'width': int(window.width),
                'height': int(window.height),
                'x': int(window.x),
                'y': int(window.y),
            }
            if geometry['x'] > -10000 and geometry['y'] > -10000:
                save_state({'geometry': geometry})
        except Exception:
            log.exception('保存窗口位置失败')

    window.events.loaded += on_loaded
    window.events.closing += on_closing

    log.info('打开窗口 %sx%s @ (%s, %s)', width, height, x, y)
    try:
        webview.start(
            debug=False,          # 一并关掉开发者工具 / 浏览器右键菜单 / F5 等浏览器加速键
            private_mode=False,   # IndexedDB 必须落盘，否则训练进度与卷帘自动保存会丢
            storage_path=str(WEBVIEW_DATA_DIR),
            icon=str(ICON_FILE) if ICON_FILE.is_file() else None,
        )
    finally:
        try:
            httpd.shutdown()
        except Exception:
            log.exception('关闭本地服务失败')

    log.info('已退出')
    return 0


if __name__ == '__main__':
    sys.exit(main())
