# 安卓版（APK）

把简听从「Windows 桌面窗口」搬进 Android。与桌面版同一个思路：应用本体（`index.html` + `css/` + `js/` + `samples/` + `assets/`）一行不改地装进原生壳——壳是 **Capacitor 8** 生成的标准 Android WebView 工程，WebView 内置的本地服务替代了 `server.py`，页面跑在 `https://localhost`（Capacitor 自定义 scheme），IndexedDB 在这个 origin 上持久化。

三个入口从此共用同一份源：

| 入口 | 壳 | 服务 |
| --- | --- | --- |
| 桌面窗口（默认） | `app.py` + WebView2 | 内建本地服务（127.0.0.1:8766） |
| 浏览器（备选） | 系统浏览器 | `server.py`（127.0.0.1:8766） |
| 安卓 APK | Capacitor WebView | Capacitor 内置 scheme 服务（https://localhost） |

## 目录与产物

| 内容 | 位置 |
| --- | --- |
| Capacitor 配置 | `capacitor.config.json`（appId `com.jianting.app`） |
| web 资产产物 | `web/`（`tools/pack_web.py` 生成，**永远是产物，不要手改**） |
| Android 工程 | `android/`（`npx cap add android` 生成 + 手写适配） |
| 产物 APK | `android/app/build/outputs/apk/debug/app-debug.apk` |

## 常用命令

```
npm run sync        # 应用本体改动后：pack_web → 拷进 android 资产
npm run apk         # sync + 出 debug APK
python tools/make_apk_icons.py   # 从 assets/jianting.png 重新生成启动图标
```

`android/local.properties` 记录本机 SDK 路径（`%LOCALAPPDATA%\Android\Sdk`），已装平台 android-36、build-tools 36.0.0；Capacitor 8 默认 compileSdk/targetSdk 36、minSdk 24，正好吻合。

## 本机构建环境（第一次构建踩过的坑，复现时照这里查）

1. **JDK 版本**：机器默认 JDK 25 跑不了 Gradle 8.14.3（`Unsupported class file major version 69`）。`android/gradle.properties` 的 `org.gradle.java.home` 指向机器原有的 Temurin 21：`C:\Users\30249\.jdks\jdk-21.0.12.1+1`。（2026-10-11 整理：曾因跨工作区记忆不通重复下载过一份 JDK 21 到 %LOCALAPPDATA%，已删除；装新工具前先查机器级工具链记忆。）
2. **Maven 仓库**：`dl.google.com` 直连超时。阿里云镜像已配在两处：`android/build.gradle`（根项目）+ 全局 init 脚本 `~/.gradle/init.d/aliyun-mirror.gradle`（init 脚本先于一切项目脚本，把 node_modules 里 Capacitor 子模块自带的 `google()` 仓库也压到镜像后面，npm 重装无需重改）。
3. **sdk.dir 转义**：`local.properties` 里的 Windows 反斜杠会被 properties 转义规则吞掉（`\U`→`U`），报「文件名、目录名或卷标语法不正确」。必须写正斜杠：`sdk.dir=C:/Users/30249/AppData/Local/Android/Sdk`。
4. **build-tools 版本**：本机只有 36.0.0，AGP 8.13 默认要 35.0.0。根 `build.gradle` 末尾的 `subprojects` 块对所有 AGP 模块统一注入 `buildToolsVersion '36.0.0'`，装了 35 之后这段可以直接删。

## 壳上做了什么（都是桌面版没有的）

- **MIDI 导出落盘**：WebView 里 `a[download]` 的 blob 下载不通。`export.js` 检测到 `window.JiantingSave` 时把 SMF 字节 base64 递给壳，`MainActivity$SaveBridge` 写进**系统 Downloads**（API 29+ 走 MediaStore，无需权限；更旧版本写应用私有目录并 Toast 提示路径）。桌面/浏览器不注册这个对象，走的仍是原来的 `a[download]`。
- **亮屏不熄**：练耳与卷帘是持续操作场景，`FLAG_KEEP_SCREEN_ON`。
- **启动图标**：`tools/make_apk_icons.py` 从 `assets/jianting.png` 生成 5 档密度 legacy 图标 + 自适应前景，底色 `#f6efdb`（旧纸页边）。
- **应用名**：`简听 JIANTING`。

## 应用本体只动了一处

`js/midi/export.js` 的 `downloadSMF` 开头加了 6 行平台钩子（`window.JiantingSave` 存在才走，桌面/浏览器零影响）。这是 APK 与 web 唯一的接缝——原则与桌面版一致：壳只去点应用本来就会做的事，不新增平行实现。

## 数据在哪

APK 的 IndexedDB 挂在 `https://localhost` origin 上，数据随应用卸载而删除；与桌面版（`%LOCALAPPDATA%\Jianting`）、浏览器版互不相通。三边进度迁移是明确的暂缓项。

## 已知限制 / 下一步

- **真机未实测**：构建时没有连接安卓设备（`adb devices` 为空）。装机方式：USB 连接后 `adb install dist/Jianting-debug.apk`，或把 APK 拷到手机直接点开（debug 签名允许直接安装）。
- **手机竖屏没有专门排版**：应用按桌面宽度（≥760px）设计，竖屏下内容会缩得很小。适合先横屏使用；竖屏版式是下一步的活。
- 采样（2 MB）打进 APK；体积可接受（APK 共 5.4 MB）。
- 未做：签名 release 包（当前是 debug 签名）、从桌面版/浏览器版迁移进度、返回键手势、深色状态栏配色。
