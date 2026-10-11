# 桌面窗口版（DESKTOP）

把简听从「浏览器里的一个标签页」搬进一个原生窗口。应用本体（`index.html` + `css/` + `js/` + `samples/`）一行未改——两版共用同一份文件。

## 两个入口

| 入口 | 怎么起 | 形态 |
| --- | --- | --- |
| 桌面窗口（默认） | 双击 `start.bat` | WebView2 原生窗口：无标签页、无地址栏、无刷新键、无开发者工具、无浏览器右键菜单 |
| 浏览器（备选） | 双击 `start-browser.bat` | 系统默认浏览器打开 `http://127.0.0.1:8766/index.html` |

两个入口都只监听 `127.0.0.1`，并复用 `server.py` 里同一个 `NoCacheHandler`——静态服务行为不会分叉。

## 为什么是 WebView2

- Windows 10/11 自带 WebView2 运行时（Edge 内核），不必随应用分发一整个 Chromium。
- 与浏览器同一套引擎：ES Module、Web Audio、Canvas、IndexedDB 行为完全一致，所以「所见即所听即所导出」在窗口里同样成立。
- 窗口是 Win32 原生窗口：任务栏独立条目、自己的图标、自己的关闭行为。

## 文件

| 文件 | 作用 |
| --- | --- |
| `app.py` | 窗口版启动器：内建本地服务 → WebView2 窗口 → 菜单栏 → 单实例 → 窗口几何记忆 |
| `start.bat` | 双击入口（用 `pythonw` 起，不弹控制台窗口） |
| `start-browser.bat` | 浏览器版入口（即原 `start.bat` 的行为） |
| `tools/make_icon.py` | 生成应用图标，可重跑；图形取自 DESIGN.md 的 SIGNATURE |
| `assets/jianting.ico` | 窗口与任务栏图标（16/24/32/48/64/128/256 七档） |
| `assets/jianting.png`、`assets/jianting-32px-check.png` | 图标预览与小尺寸验收图 |
| `tools/build_exe.py` | 打包脚本：`python tools/build_exe.py` → `dist/Jianting.exe` |
| `dist/Jianting.exe` | 免装 Python 的单文件窗口版（19.7 MB） |

`server.py` 未改动，仍是浏览器版的服务器。

## 窗口行为

- **标题** `简听 JIANTING`；**图标** `assets/jianting.ico`。
- **开窗底色** `#f6efdb`（页边旧纸），消掉加载瞬间的白闪。
- **菜单栏**：`页面`（四页直达）/ `窗口`（副屏常驻相关）/ `工具`（初始化音频、运行引擎自检、全部停止）/ `帮助`（关于简听）。页面与工具菜单只是去点页面上本来就有的按钮，应用侧没有为桌面版新增任何 API。
- **单实例**：再次启动会前置已有窗口，不会开出第二个。
- **几何记忆**：记住上次的大小与位置；换显示器或分辨率后自动回居中。
- **最小尺寸** 760×560：实测到 760px 宽时整页无横向溢出，两个卷帘会跟着窗口重排（见下）。
- **刻意关掉的浏览器行为**：浏览器加速键（F5、Ctrl+R、Ctrl+F、Ctrl+P、Ctrl±）、开发者工具、浏览器右键菜单、悬停链接状态栏。
- **保留的桌面行为**：MIDI 导出走系统「另存为」；教材正文可选中（`::selection` 仍是朱红高亮）。

## 数据在哪

| 内容 | 位置 |
| --- | --- |
| 训练进度 / 阶段等级 / 答题流水 / 卷帘自动保存 | `%LOCALAPPDATA%\Jianting\WebView2\EBWebView\Default\IndexedDB\http_127.0.0.1_8766.indexeddb.leveldb` |
| 端口与窗口几何记忆 | `%LOCALAPPDATA%\Jianting\desktop.json` |
| 运行日志 | `%LOCALAPPDATA%\Jianting\jianting.log` |

窗口版与浏览器版用的是**不同的浏览器配置目录**，所以进度互不相通：在浏览器里练到第 3 阶段，打开窗口版会是干净的初始状态。想沿用浏览器里的进度，目前只能继续用 `start-browser.bat`。

## 端口

桌面窗口默认 8766。端口是 IndexedDB origin 的一部分，必须稳定，所以启动器把上次成功的端口记进 `desktop.json` 并优先复用；8766 被占用时依次退到 8767–8772。

## 副屏常驻（和 FL 分屏）

`窗口` 菜单：

- `始终置顶（副屏常驻）` / `取消置顶` —— FL 全屏在前台时工具窗口还能压在上面。状态写进 `desktop.json`，下次开窗照旧。
- `贴屏幕左半` / `贴屏幕右半` / `铺满工作区` —— 按当前显示器工作区（已扣任务栏）摆放，正好和 FL 分屏。
- `居中并恢复默认大小`。

坐标单位这件事有个坑值得记下来：pywebview 在 `webview.start()` 里才调 `SetProcessDPIAware()`，于是同一个进程的 Win32 工作区会在运行中途从「逻辑像素」变成「物理像素」，而 `resize/move` 只吃逻辑像素。缩放显示器上（150%）贴半屏会被放大 1.5 倍然后撞到屏幕边上。app.py 因此在最开头自己先钉死 DPI awareness，并把 `work_area()` 的返回值统一换算成逻辑像素。

## 免装 Python 的 exe

```
python tools/build_exe.py
```

产物 `dist/Jianting.exe`（PyInstaller onefile + windowed）。应用本体（`index.html` / `css` / `js` / `samples` / `assets`）打进 exe，运行时解包到临时目录，app.py 靠 `sys._MEIPASS` 找到它们；用户数据仍然写在 `%LOCALAPPDATA%\Jianting`，所以换不换 exe、删不删 exe，训练进度都不会丢。

换机器只要装了 WebView2 运行时（Win10/11 自带）就能直接跑，不需要 Python。`python app.py` 和 `start.bat` 仍然是开发时的路径。

### 两个版本

```
python tools/build_exe.py            → dist\Jianting.exe        单文件 19.7 MB
python tools/build_exe.py --onedir   → dist\Jianting\（文件夹）  39.9 MB，发的时候整个文件夹一起发
```

功能完全一样，只有启动方式不同。实测（三轮、缓存已热，双击到「页面就绪」）：

| 版本 | 三轮 |
| --- | --- |
| 单文件 | 1699 / 1601 / 1577 ms |
| 文件夹 | 1267 / 1312 / 1275 ms |

文件夹版快约 300 ms（约 19%），因为不必每次把内容解包到临时目录。第一次测的时候文件夹版反而更慢——那是首次读盘没进缓存，只看一轮会得出反向结论。

打包脚本会先探测产物是否被占用；应用开着时中止并提示先关窗口，而不是丢一个 `PermissionError`。

## 启动速度

启动日志自带各阶段耗时（`本地服务就绪（Python 侧启动 0.02s）`、`页面就绪（从进程启动算 1.00s）`），变慢了一看就知道卡在哪。三处曾经真的慢过：

**单实例检测不能用端口轮询。** 原实现是挨个探测 8 个候选端口，但这台机器上连一个**没打开的**回环端口要等满超时（实测 1036 ms），8 个就是白等 4 秒。更糟的是两个实例起得够近时各自都还在探测窗口里，谁都没发现谁——日志里真的出现过一次双开（8766 和 8767 各占一个）。现在用 Win32 命名互斥体（`CreateMutexW`）：O(1)、不碰网络、进程退出系统自动释放。Python 侧启动从 4 s 降到 0.02 s。

**采样要在页面加载时就预载。** 解码不需要用户手势，只有 `resume()` 需要。所以现在页面一加载就在后台把 17 个采样抓好解码好，上下文先停在 `suspended`，用户点击时只是恢复一个已经备好的引擎。实测预载 243 ms、点击解锁 87 ms、试听响应 83 ms；改前第一次试听要等完整的下载+解码才开始响。

**桌面窗口开窗即运行（2026-10-11）。** WebView2 默认执行浏览器的自动播放策略，AudioContext 必须等一次手势，所以状态栏曾经要把两件事分开说——「采样就绪 · 待解锁」，避免出现「采样就绪」却按不出声的矛盾画面。现在 `app.py` 在创建 WebView2 环境前设 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--autoplay-policy=no-user-gesture-required`（桌面窗口是用户自己打开的本地应用，无此顾虑），`engine.preload()` 里开窗即尝试 `resume()`：状态芯片开窗直接是「采样就绪」，状态栏「上下文: running」。浏览器版（`start-browser.bat`）不经过这个壳，自动恢复会被策略拦下，仍走「待解锁」回退——这是平台限制，不是缺陷。

**端口要恒定优先 8766。** 端口是 IndexedDB origin 的一部分。曾经为了「稳定 origin」记住上次成功的端口，结果上次被挤到 8767 之后每次都去 8767，用户在 8766 下积累的训练进度就看起来凭空消失。现在恒定从 8766 起试，真的被占用才退，并且打一条警告说明这是新 origin。

## 自检

```
python app.py --selftest
```

开窗 → 跑 JS 探针（标题 / 四页导航 / 39 种和弦 / 两个 Canvas / AudioContext / IndexedDB）→ 触发音频引擎初始化 → 确认 17/17 钢琴采样就绪 → 关窗退出。结果写进 `jianting.log`。

实测输出：

```
页面就绪：{"title":"简听 JIANTING · 和弦与练耳","nav":4,"chordChips":39,"rootButtons":12,
          "rollCanvas":true,"chordRollCanvas":true,"audioApi":true,"indexedDB":true,
          "engineState":"uninitialized"}
自检结果：PASS · 17/17 采样就绪
引擎明细：上下文: running ｜ 采样: 17/17 ｜ 活动声部: 0
```

## 依赖

```
python -m pip install pywebview
```

`pywebview` 在 Windows 上依赖 `pythonnet` 与系统 WebView2 运行时。启动器会先检查 WebView2，缺失时弹窗给出官方安装地址，而不是丢一个 traceback。

## 还没做的

- **打包成免装 Python 的 exe**：`pyinstaller app.py`（把 `index.html`、`css/`、`js/`、`samples/`、`assets/` 一起打进去）即可得到单文件绿色版。未做，因为还没确认是否要随包分发这 2 MB 采样。
- **从浏览器版迁移训练进度**：需要一次导出/导入，或直接搬运 leveldb，暂未实现。
