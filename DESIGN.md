---
name: 简听 JIANTING
description: 简谱歌本与中文音乐教材印刷传统里的和弦查询与练耳工具——纸面、墨线、朱红批注
colors:
  paper: "#f6efdb"
  panel: "#fcf8ea"
  paper-deep: "#efe6cc"
  paper-lift: "rgba(250, 246, 236, 0.7)"
  ink: "#22211d"
  ink-soft: "#6b675c"
  hairline: "#d8cfb8"
  hairline-strong: "#a89c7e"
  red: "#b5432a"
  red-deep: "#8f3220"
  indigo: "#2d5f8a"
  green: "#2f5d3a"
  roll-row-white: "#f7f2e4"
  roll-row-black: "#e9e1cb"
  roll-octave: "#c9bfa4"
  roll-grid-beat: "#ddd3ba"
  roll-ruler: "#efe8d5"
  roll-key-black: "#3a362c"
  roll-key-white: "#fbf7ec"
  roll-key-frame: "#55503f"
typography:
  display:
    fontFamily: "SimSun, 'Songti SC', 'Noto Serif SC', serif"
    fontSize: "44px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.05em"
  masthead-en:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "20px"
    fontWeight: 400
    letterSpacing: "0.22em"
  headline:
    fontFamily: "SimSun, 'Songti SC', 'Noto Serif SC', serif"
    fontSize: "22px"
    fontWeight: 400
    letterSpacing: "0.03em"
  degree-display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "52px"
    fontWeight: 400
    lineHeight: 1
  title:
    fontFamily: "'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
  body:
    fontFamily: "'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  kai-note:
    fontFamily: "KaiTi, 'Kaiti SC', STKaiti, serif"
    fontSize: "13px"
    fontWeight: 400
  numeral:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "14px"
    fontWeight: 400
rounded:
  none: "0"
  hair: "2px"
  thumb: "5px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "20px"
  3xl: "22px"
  4xl: "24px"
  5xl: "28px"
components:
  nav-tab:
    backgroundColor: "{colors.paper-deep}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.none}"
    padding: "6px 18px 5px"
  nav-tab-active:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.red}"
    padding: "6px 18px 8px"
  key-btn:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "3px 6px"
  key-btn-active:
    backgroundColor: "{colors.red}"
    textColor: "{colors.paper}"
  root-btn:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "6px 0"
  root-btn-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "6px 10px"
  chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "8px 14px"
  button-primary:
    backgroundColor: "{colors.red}"
    textColor: "{colors.paper}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.red-deep}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.red}"
  badge:
    backgroundColor: "transparent"
    textColor: "{colors.indigo}"
    padding: "2px 10px"
  input-search:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "5px 10px"
    width: "240px"
---

# Design System: 简听 JIANTING

## Overview

**Creative North Star: "一部被天天批注的和弦参考书"**

这句副题就印在刊头上（`.tagline`），是整个视觉系统的世界承诺：这个工具读起来应当像一本被认真使用、每天用朱红笔批注的中文音乐教材，而不是一个深色 DAW 或通用后台。用户在方向选择中已确认这一材质承诺（PRODUCT.md 品牌承诺）：教材内页纸面承载全页，深墨为墨，朱红为批注与主行动，靛蓝为次要信息；分隔靠 1px 墨线，无渐变、无玻璃、无阴影。界面语言是用户天天在读的简谱语法——数字即音，调性一切换全页级数重算。

系统是**工具优先的印刷品**：密度偏实（14px 正文、6px 间距的密集芯片行），层级只靠字号、纸色分层与线的重量表达；状态切换即时如印刷（全站没有一条 `transition`），唯一的动画是调性切换后级数记号的统一翻动。中西文混排频繁（C/♯/♭/MIDI 数字），四套字体声部各司其职以保证排版不粗糙——这是用户明确要求的底线。

**Key Characteristics:**
- 纸面三层（页边旧纸 / 内页白 / 沉纸）承担一切深度与状态，零 box-shadow、零渐变。
- 朱红稀缺：只落在「被批注的东西」上——级数记号、书签线、根音块、主行动、错题红批。
- 四声部字体：宋体刊头（只 400 重量）、黑体界面、楷体批注、Georgia 数字。
- 直角印刷品：圆角一律 0，控件是 1px 描边方框，选中即墨底反白。
- 签名交互「级数随调」：一切简谱级数记号由 `jianpuDegree(rootPc, keyPc)` 单点计算，调性切换全页重算并统一翻动。
- Canvas 卷帘与 DOM 共用同一套纸面配色与朱红/靛蓝音块语义。

## Colors

纸与墨的中性世界，朱红一枚强调色——像一本教材的内页，颜色只出现在批改痕迹上。

### Primary
- **朱红** (#b5432a)：批注与主行动色。用在：简谱级数记号（芯片角标、详情大级数）、目录签书签线、当前页签文字、主按钮（`button.primary`）、卷帘根音块与播放头、错题/危险/降级状态、选区高亮（`::selection`）。深朱 #8f3220 是它唯一的 hover 加深变体。

### Secondary
- **靛蓝** (#2d5f8a)：次要信息色。用在：音程公式、罗马数字与进行步、徽章（badge）、加载中状态、焦点环（`:focus-visible`）、卷帘和弦音块。

### Tertiary
- **石绿** (#2f5d3a)：通过与生机色。用在：引擎「采样就绪」状态、训练答对、情绪归属文字。

### Neutral
- **页边旧纸** (#f6efdb)：`body` 底色，也是卷帘容器底、输入框底、墨底/朱红底上的反白文字色（`color: var(--paper)`）。
- **内页白** (#fcf8ea)：面板（`.panel`）与当前页签底，比页边亮半档，像翻开后的内页。
- **沉纸** (#efe6cc)：hover 沉入底、未选页签、构成音块底、行内 `code` 底。
- **反白纸影** (rgba(250, 246, 236, 0.7)，亦用 .55/.75)：墨底与朱红块上的次级文字、卷帘音符右缘把手——方向契约中的暖白 #faf6ec 在构建中以半透明纸影存在。
- **深墨** (#22211d)：正文与标题文字、节分隔墨线、选中态底色（根音钮/芯片/进行步的「墨底反白」）。
- **淡墨** (#6b675c)：次级文字、说明、计数、小键盘八度标。
- **界栏细线** (#d8cfb8)：组内分隔线（组题下边、构成音块描边、进行列表分隔）。
- **控件线** (#a89c7e)：可点控件描边、小节粗线、滚动条把柄——线的中间重量。

### 卷帘纸阶（Canvas，js/roll.js）
- **卷帘白键行** (#f7f2e4) / **卷帘黑键行** (#e9e1cb)：音高行底，黑键行深半档。
- **八度线** (#c9bfa4)：每个 C 上方的行分隔。
- **拍线** (#ddd3ba) / 小节线（复用控件线 #a89c7e）：竖向网格，细/粗两级。
- **标尺纸** (#efe8d5)：小节标尺底，标尺文字用淡墨 #6b675c。
- **墨键** (#3a362c) / **白键** (#fbf7ec) / **键盘框** (#55503f)：左侧键盘列三件套。

### Named Rules
**朱红批注律。** 朱红只落在「被批注的东西」上——级数记号、书签线、根音块、主行动、错题；永不大面积铺底。一块屏幕读下来，朱红应当像批改痕迹，稀少而准确。

**纸分三层律。** 页边旧纸 / 内页白 / 沉纸三层纸色承担一切深度、悬停与状态沉浮；同屏不引入第四种底色。

**墨上纸律。** 深色块（墨底、朱红底）上的文字永远是纸色反白——主文字用 `var(--paper)`，次级文字用 rgba(250,246,236,.7–.75)，从不用纯白 #fff。

## Typography

**Display Font:** SimSun / Songti SC / Noto Serif SC（系统宋体栈，无 webfont——本地优先）
**Body Font:** Microsoft YaHei / PingFang SC / system-ui（系统黑体栈）
**批注 Font:** KaiTi / Kaiti SC / STKaiti（楷体）
**数字 Font:** Georgia / Times New Roman

**Character:** 四声部来自中文教材的排版分工——宋体撑刊头与节题的「印刷权威」，黑体做界面的一切操作文字，楷体是老师批注的手写声部（副题、状态语、红批），Georgia 承担全部音名、级数与数字（简谱记号天生属于衬线数字）。中西文各归其位，混排不粗糙。

### Hierarchy
- **Display / 刊头**（宋体 400，44px，lh 1，字距 0.05em）：刊头「简听」二字，永不加粗；旁挂 Georgia 字驻「JIANTING」（20px，字距 0.22em，朱红）。
- **Headline / 节题**（宋体 400，22px，字距 0.03em）：各面板 h2，下衬 1px 墨线。
- **Degree Display / 级数锚**（Georgia 400，52px，lh 1，朱红）：详情面板左侧大级数，整页的视觉锚。
- **Title / 和弦符号**（黑体 700，30px）：详情面板和弦记号。
- **Body**（黑体 400，14px）：正文与控件文字；说明文字 13px / lh 1.7。
- **Label**（黑体 12px）：计数、组题（字距 0.05em、下衬细线）、状态条。
- **Kai Note / 批注**（楷体 400，12–15px）：副题 15px、调性标签 14px、红批与统计 13px、状态条 12px。
- **Numeral / 数字**（Georgia，10–17px）：芯片记号 14px、级数角标 10px、键位副标 11px、构成音 15px、进行步罗马数字 17px——同一声部走完整个尺寸坡道。

### Named Rules
**四声部律。** 宋体=刊头与节题；黑体=界面标签与正文；楷体=批注与状态语；Georgia=一切音名、级数、MIDI 数字。一个声部一个用途，不混用。

**宋体不假粗律。** 宋体展示声部只以 400 重量出现（刊头 44px、节题 22px），层级靠字号与 1px 墨线，不靠加粗。

## Layout

单列文档流，像一页摊开的教材：`main` 最大 1120px 居中（左右 16px），`body` 底部留 56px 呼吸。刊头通栏（上距 22px、左右 28px）：标题行 baseline 对齐、flex-wrap；导航 `margin-left: auto` 靠右与刊头同行；调性切换器与引擎状态条在第二行（`masthead-row`，行距 10px 0 12px）。

面板节奏：`.panel` 上距 22px、内边距 20px 24px；详情 `.detail` 内边距 16px 20px；小区块前距 18px（`.sub-title`），组距 12px（`.chips-group`），行内组间距 6px（芯片行、根音行），按钮行距 10px。

卷帘几何（`CONFIG.roll`）：键盘列 56px、音高行高 16px（查询页预览 12px）、标尺高 22px、音符右缘把手判定 6px；容器 `max-height` 470/480px、`overflow-y: auto`，画布最小宽 640px。

**适配规则：** 全站零 media query——自适应完全交给 flex-wrap（标题行、根音行、芯片行、按钮行、进行步全部可换行）。窄屏时刊头自然折为多行、芯片重排；卷帘容器内画布保持 640px 最小宽横向滚动。没有发明断点值，这是构建的实际行为。

## Elevation & Depth

这是一个**零阴影世界**：全站没有任何 `box-shadow`，也没有渐变与 `backdrop-filter`。深度由四种纸面手段表达：纸色分层（页边→内页→沉纸）、1px 墨线（节分隔与主容器）、教材双线（刊头底部 1px 细线 + 3px 粗线错位 2px，全站唯一的双线仪式）、虚线批注框（旁注语义）。悬停不浮起不加影——控件「沉入纸底」（背景变沉纸）或「描边变墨」，像手指按在纸上。焦点是唯一外加的环：`:focus-visible` 2px 靛蓝 outline，offset 2px。Canvas 卷帘内深度同样靠纸阶（黑键行深、八度线、拍/小节线粗细），播放头是一条 2px 朱红竖线。

### Shadow Vocabulary
无。本节故意为空——纸面无影是世界材质承诺（用户选定，cream-palette 疑虑已经终审裁断驳回）。

### Named Rules
**纸面无影律。** 零 box-shadow、零渐变、零玻璃；深度只用纸色分层 + 线。未来任何新界面不得引入阴影来「提层次」。

## Shapes

直角印刷品：所有控件与容器 `border-radius: 0`。控件是 1px 描边方框；选中态用「墨底反白」而非描边加粗；层级用线的重量表达——界栏细线（组内）、控件线（可点描边）、墨线（节分隔/主容器/选中底）。虚线框是批注语义（引擎状态条、自检人工验证注），与实线控件区分「这不是按钮，是旁注」。卷帘音符右缘的 2px 半透明纸条（rgba(250,246,236,.55)）是唯一「可抓取」的把手暗示。仅有的圆角例外：滚动条把柄 5px（浏览器表面属于设计，见 `::selection` 与滚动条定制）与行内 `code` 2px。

## Components

### 教材目录签（主导航）
未选页沉入纸底，当前页签片升起「接住」正文——像教材侧边的目录签。
- **Shape:** 直角，1px 控件线描边，无边框底（`border-bottom: none`），padding 6px 18px 5px，14px 黑体、字距 0.04em。
- **Default:** 沉纸底、淡墨字；hover 字变墨。
- **Active:** 内页白底接住正文、墨描边、朱红字、加粗、`padding-bottom` 5→8px（签片升起），下沿内侧压一条 2px 朱红书签线（左 10px 右 10px 下 4px）。
- **Disabled:** opacity .45、禁止光标。

### 调性切换器（签名交互）
12 枚 Georgia 音名钮（C–B，含 ♯ 记号），前缀楷体「调」字标签；当前调为朱红底纸色字，hover 描边变墨。
切换的后果是全页级的：根音钮副标、每枚芯片右上角的级数角标、详情面板 52px 大级数、进行页「罗马数字 · 简谱级数」并置，全部经 `jianpuDegree(rootPc, keyPc)` 重算，并统一播放 `jp-turn` 翻动——**全站唯一动画**（0.35s ease-out，自 -4px 上方淡入落定）。级数记号的数据层在 `js/theory/chords.js`（升号上挂 ♯、降号下挂 ♭ 的习惯法）。

### 根音钮 / 阶段钮
双行结构：Georgia 音名 14px + 下方 11px 淡墨简谱级数副标。最小宽 52px、透明底、1px 控件线；hover 沉纸底 + 描边变墨；active 墨底反白纸字（副标变 rgba(250,246,236,.75)）加粗。听辨训练页的阶段钮复用同一形态（和弦轨 `第 n 阶段 (n 种)`；音程轨只有两段，标签带上轨道语义 `第 1 阶段 · 关系 (3 种)`）。训练页的「训练内容」切换复用 `.seg` 分段控件，与查询页「浏览方式」同形。

### 和弦芯片
竖排三段的小方框：Georgia 和弦记号 14px / 黑体中文名 11px / 右上角 10px 朱红**级数角标**（top 3px right 4px）。透明底 1px 控件线，padding 6px 10px，左对齐；hover 墨描边 + 沉纸底；active 墨底（记号反白、角标反白纸色）。芯片按 7 个结构组或 7 个情绪组排布，组题 12px 淡墨、字距 0.05em、下衬细线。听辨训练页的选项按钮复用芯片形态（`.tr-opt`，padding 10px 14px）。

### 按钮
- **Shape:** 直角，1px 描边，padding 8px 14px，14px 黑体；**无 transition，状态即时切换**。
- **Default:** 透明底、墨字、墨描边；hover 沉纸底。
- **Primary:** 朱红底、纸色字、朱红描边；hover 深朱 #8f3220。
- **Danger:** 透明底、朱红描边朱红字；hover 朱红 8% 透明底（rgba(181,67,42,.08)）。

### 详情面板（签名组件）
选中即展开的「条目页」：纸底（`--paper`，比面板更深一层的当前感）、1px 墨描边、padding 16px 20px。
- **级数锚:** Georgia 52px 朱红大级数，右侧以 1px 控件线与符号区分隔。
- **符号行:** 30px 黑体加粗和弦记号 + 14px 淡墨全名。
- **红批:** 楷体 13px 朱红——和弦色彩描述（老师批注声部）。
- **公式行:** Georgia 13px 靛蓝——「音程公式 ｜ 听辨阶段」。
- **情绪行:** 13px 石绿。
- **构成音块:** 沉纸底、1px 细线方音块，Georgia 15px 音名 + 11px 淡墨音级角色；根音块变体：朱红 10% 底 + 朱红描边 + 朱红角色字。

### 进行步
三行小方块：Georgia 罗马数字 17px 靛蓝 / 12px「级名 · 简谱 x」/ 10px 淡墨音名串。1px 控件线、最小宽 76px；播放高亮=墨底反白（由音频时间轴 `setTimeout` 驱动，非 rAF）。左侧进行列表是通栏无边框条目，下衬细线；当前条目标题朱红并前置楷体「当前 · 」。

### 状态批注条（engine-status）
楷体 12px、1px 虚线框——状态即批注颜色：加载中靛蓝、就绪石绿、降级/合成音朱红、未初始化淡墨。徽章（badge）是它的实线表亲：靛蓝描边、Georgia 12px、透明底。自检结果行复用同一语义（pass 石绿 7% 底 / fail 朱红 8% 底）。

### 转位控件（详情面板）
`.seg` 分段控件的第三个用法（另两个是查询页「浏览方式」与训练页「训练内容」）：原位 / 第一 / 第二 / 第三转位。转位数按和弦音数收窄——三和弦只有三个钮，切到只有两个音的强力和弦会收到两个；切换即换声位并试听。
公式行把**根音与低音分开写**（`根音：C4 ｜ 低音：E3（第一转位）＝ 转位`）。构成音的 `.note-item` 逐音标注 `根音`/`低音`：朱红=根音（`.is-root`）、靛蓝=低音（`.is-bass:not(.is-root)`）；原位时低音就是根音，朱红优先，不叠第二套颜色。卷帘的朱红块按**音级**判定根音（`m % 12 === voicing.rootPc`），否则转位后根音跑到上面会一个块都点不亮。

### 节奏网格（训练页「节奏」轨）
一小节 = 16 个十六分格，`.rh-cell` 高 46px、flex 等分、1px 细线分隔；每 4 格一拍，拍首用 2px 控件线（与卷帘的小节线同一语义）。点亮的格 = 墨底（选中态用墨底反白，与世界一致，不加圆点）；判卷后目标起音在对应格子下缘留 3px 朱红下划线。整条网格外层 1px 墨线框。

### 简谱记号（DOM，训练页「简谱」轨）
数字即音级，全部落在 Georgia 数字声部——简谱记号天生属于衬线数字。每个记号是一列：上八度点 / 数字行 / 下八度点 / 减时线；数字行里数字后面可以挂一个附点或一条延音横线（两者与减时线互斥，所以不必绝对定位）。尺寸：数字 22px，八度点 14px 行高 10px，减时线 1px 墨线（八分一条、十六分两条，间距 2px）。记号之间 16px。
- 只用一个墨色：记号本身是黑字。**朱红只用来标「与正确答案不同的那一拍」**——这与世界里朱红=批注的语义一致，不用描边或加粗来表达差异。
- 选项是整行简谱，进不了芯片行：选项容器在简谱轨切换为纵向单列（`.tr-options.is-jianpu`），每个选项左边一个 Georgia 编号 A/B/C/D，右边整行记号；判卷后就地留绿框（正确）或朱红框（选错）。
- 题干必须随时写着 `1 = ?`：简谱的数字是相对音级，不写明主音这道题就没有意义；换调性时题干与卷帘一起变，数字串不变。

### 卷帘（Canvas 签名组件）
FL 式钢琴卷帘以纸面重绘：纸阶行底 + 细/粗两级拍线 + 左侧墨键/白键键盘列（外框 #55503f）。音符块语义与 DOM 一致——**朱红块=根音，靛蓝块=和弦音**，右缘 2px 半透明纸把手；播放头 2px 朱红竖线。音频轨共五个实例：编辑器（行高 16px、C2–C6 共 49 行）、查询页只读预览（12px、C3–C6、单小节）、训练页音程题只读（10px、C3–C5，「键盘同步显示两音距离」）、训练页简谱题只读（7px、C2–C6，主音级数 1 着朱红、其余靛蓝）、训练页旋律重建（12px、C3–C5、吸附半拍，训练页唯一可编辑的一个）。光标即操作暗示：编辑器与重建 crosshair、只读预览 pointer。

**幽灵块（`setGhost`）**是卷帘的第五种块：只描 1px 控件线 `#a89c7e`、不填色，压在真实音符下面，用来显示目标旋律。它是三维 diff 的视觉那一半——手画的实心块与目标的空心框对不齐，就是差拍或差音高；逐音的「音高 / 起点 / 时值」明细在下方以朱红列出。

### 输入
- **文本搜索:** 纸底、1px 控件线、13px、宽 240px；focus 描边变墨（无 glow、无阴影）。
- **数字/下拉:** 同款小输入（padding 4px 6px，数字用 Georgia）。
- **全局:** `:focus-visible` 2px 靛蓝 outline、offset 2px。

## Do's and Don'ts

### Do:
- **Do** 用三层纸色表达深度与状态（页边 #f6efdb / 内页 #fcf8ea / 沉纸 #efe6cc）；hover 优先「沉入纸底」或「描边变墨」，不引入新颜色。
- **Do** 音名、简谱级数、MIDI 数字一律 Georgia；级数记号统一经 `jianpuDegree(rootPc, keyPc)` 计算，调性切换全页重算并播 `jp-turn`（0.35s ease-out）。
- **Do** 状态用印刷记号语言：实线框=可点控件、墨底=选中、虚线框=旁注批注、朱红=当前/主行动/错题、靛蓝=次要信息、石绿=通过/就绪。
- **Do** 分隔靠线不靠空白段差：节标题（h2）下衬 1px 墨线，组题下衬 1px 细线，列表条目间 1px 细线。

### Don't:
- **Don't** 不用 box-shadow、渐变、玻璃拟态——纸面配色与材质是世界承诺（PRODUCT.md 品牌承诺，终审已裁断确认），不得回退为深色 DAW 模仿或通用后台风。
- **Don't** 不用圆角卡片与胶囊控件（radius 0；滚动条把柄 5px 与行内 code 2px 是仅有例外）。
- **Don't** 宋体展示字不过 400 重量；不加载 webfont（宋/黑/楷/Georgia 全部系统字体栈，本地优先）。
- **Don't** 声部不串：楷体不作正文与按钮字，黑体不作红批，Georgia 不排中文正文。
- **Don't** 不用纯白 #fff、不用深色底页面——深色块上的文字用纸色反白（rgba(250,246,236,.7–.75)）。
- **Don't** 不引入 transition 渐变状态——状态即时切换如印刷；动画只保留 `jp-turn` 一处。
