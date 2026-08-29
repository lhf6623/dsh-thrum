# Tab2 『AI 思考过程陪伴』A+B 视觉规格与验收契约（t1）

> 作者：designer（requirements） · 供 client-engineer 照做、verifier 核对、reviewer 评审。
> 目标：把 POC 的「脱离式 8px 小光点」升级为与输入框/overlay 一体的『生命感光带』，
> 并用 `assistant/chunk` 内容增量驱动『逐 token 流动』。纯客户端视觉升级，**不改 host**。

---

## 0. 背景与既有基线（不改的部分）

POC 已交付（本轮在其上做 A+B，**不推翻**）：

- `src/client/lib/fx/motion.ts`：AI 生命周期状态机（idle→thinking→generating→tool→complete）；
  `firstTokenMs` 归一化（turnStartAt<=0 或 firstTokenAt 不在其后则 null，上限 30min）；
  `lastPhase` 守卫（仅 phase 变化才重启连续动画）；一次性亮闪节流（FLASH_THROTTLE_MS=160ms）；
  `reducedMotion()` 工具函数；`feedAiPresence()` 喂帧；`subscribeConfig` 实时响应。
- 配置开关：`aiFeedback: boolean`（默认 true，单一真源 `src/shared/config.ts` + ThrumCard『AI 陪伴』分组 + i18n zh/en）。
- `reduced-motion`：降级为静态微光点。
- **不破坏**：打字火焰（flame）、输入抖动（shake）、回答提示音（audio）、整页抖动（pageShake）、键盘/鼠标可视化（Overlay）。这些模块**不得**被本期触碰。

本契约的验收前提：上述既有行为保持成立（verifier/reviewer 按 POC 结论+本期回归共同核验）。

---

## 1. A：生命感光带 —— 与输入框/overlay 一体

### 1.1 定位（锚点）

- 光带**紧贴 composer 卡片**：锚到 `[data-composer-card]`（与键盘 Overlay 同一锚点，键盘尚有 `[data-composer-seat]` fallback）。
- 从该卡片的 `getBoundingClientRect()` 取 `top/left/width/height`，把光带画成**包裹卡片外缘 8px** 的圆角矩形描边 + 外发光（halo）。
  - 光带外包盒：`left = rect.left - GAP`，`top = rect.top - GAP`，`width = rect.width + 2*GAP`，`height = rect.height + 2*GAP`，其中 `GAP = 8px`。
  - 描边 `border-radius: 14px`，`border: 2px solid var(--band-stroke)`；外发光用 `box-shadow: 0 0 Xpx var(--band-glow)`（X 见四态）。
- **跟随**：与键盘 Overlay 相同的重测触发（视口缩放 / 任意滚动 capture / ResizeObserver on card+body+documentElement / MutationObserver on frame 的 style/class/折叠态/子节点），rAF 合并、位置实际变化才更新。
- **最小宽度 & 兜底**：卡片宽度 < 240px 时仍贴卡渲染（width 取 card+2*GAP），但整体夹在视口内（clamp left≥4px 且 left+width≤innerWidth-4px）；卡片不可测（display:none / 0 矩形 / 找不到）时回退到「视口底部居中（bottom=12px, left=50%）」锚点，键盘仍显示而非消失（沿用 POC 语义）。
- **层级与命中**：`pointer-events: none`（完全不拦截点击）；z-index 用 `thrum-z-30`（低于键盘 z-40、火焰画布 z-45），因几何上不重叠，不与键盘/火焰抢层级。光带本身**不渲染任何文字/图标/百分比**。

### 1.2 尺寸

- 外包盒由 1.1 推导；最小宽 240px；描边 2px；圆角 14px；halo 间隙 8px。
- 光带高度跟随卡片（含行高自适应），不设定固定高：它在卡片外一圈，不是一个独立条。

### 1.3 颜色体系（明暗主题）

采用**固定 AI 品牌蓝**（POC 已注释：`--dsw-alias-brand-primary` 在部分主题下解析为深色导致光点显黑，故不依赖该变量），仅按主题调亮度/透明度。主题判定：`document.body.dataset.dsDarkTheme`（即 Uno `dsh-dark:` 变体依赖的 `body[data-ds-dark-theme]`）；缺省时按 `prefers-color-scheme: dark` 兜底；检测到主题变化（MutationObserver on body 的 `data-ds-*` 属性）即重渲染改色。

| 角色 | 浅色（无 dark 属性） | 深色（有 dark 属性） |
| --- | --- | --- |
| 描边 stroke | `rgba(74,108,247,0.90)` | `rgba(130,158,255,0.95)` |
| 外发光 glow | `rgba(74,108,247,0.30)` | `rgba(90,120,255,0.38)` |
| 流动彗星头 comet | `#7aa0ff` | `#aec2ff` |
| 彗星尾余辉 tail | `rgba(122,160,255,0)`→渐隐 | `rgba(174,194,255,0)`→渐隐 |
| 工具闪光 tool | `#38bdf8` | `#5cd0ff` |
| 完成回落 complete | `rgba(74,108,247,0.55)` | `rgba(130,158,255,0.60)` |

**明暗可读性要求**：深浅两主题下描边与发光都应清晰但克制（深色主题提亮、浅色主题压 alpha），reviewer 需分别截图核对。

### 1.4 四态动效（时长与曲线）

> 统一原则：光带只有**一个**移动高亮（彗星），不喷粒子、不叠加多次闪、无声音、不抖页面；alpha 有上限（见 §3）。

| 阶段 | 行为 | 关键帧 / 参数 | 时长 | 曲线 |
| --- | --- | --- | --- | --- |
| **thinking** 柔光呼吸 | 描边+外发光缓慢柔呼吸，无位移、无旋转 | 发光 alpha 0.18↔0.36；blur 10px↔16px；scale 不动 | 2400ms | `ease-in-out`，`direction: alternate`，`iterations: Infinity` |
| **generating** 流动光带 | 一个亮弧（彗星）沿圆角矩形边缘**匀速环游**；整体发光随 token 吞吐微调 | 亮弧占周长约 22%（≈55°）；弧头 `--band-comet`、弧尾渐隐；base glow 0.30→0.40 | 单圈 900ms–2250ms（见 §2 令牌驱动） | `linear`（匀速连续）；token 变化只改 `--band-angle/--band-spd/--band-intensity`，**不 cancel+restart** |
| **tool** 蓝色闪光 | 一次亮蓝弧闪（工具调用瞬间）+ 工具执行期稳态冷蓝发光 | 闪光：单次亮蓝弧 bloom（弧头 `--band-tool`）；稳态：描边 alpha 0.32 冷蓝 | 单次 380ms；稳态持续到 tool/result | `ease-out`（一次性）；稳态 `ease-in-out` |
| **complete** 轻落回 | 整体先短暂增亮，再随「向下轻落」的压缩感回落到透明，再归 idle | 增亮 alpha 0.9 200ms → 回落 700ms（scaleY 1→0.72 + 透明度 1→0） | 总 900ms | 增亮 `ease-out`；回落 `ease-in-out` |

**转场**：
- idle→任意非 idle：光带 380ms `ease-out` 淡入。
- complete 回落完成后再进 idle（保留 POC 的 settle 语义，时间缩短到 900ms）。
- phase 切换（thinking↔generating↔tool↔complete）不闪烁：仅当 phase 真正变化才 (re)启动主循环/回落到该状态的基态；每次 token 更新只改变量，绝不重建动画（延续 lastPhase 守卫）。

### 1.5 建议构造（实现可自选，契约只看行为）

- 结构：一个 `position: fixed; pointer-events: none` 的包裹 div（定位见 1.1）；内部一个「边框环」div 负责描边 + 外发光 + 流动。
- 流动彗星：用**单个元素 + conic-gradient 环 + mask**实现（或 SVG `stroke-dashoffset` 演进的等价做法）。把亮弧画在圆角矩形描边上，用 CSS 变量驱动：
  - `--band-angle`（当前角度，rAF 每帧推进 `+= speed*dt`）
  - `--band-spd`（deg/s，token 吞吐决定）
  - `--band-intensity`（base glow 强度）
  - paint：`background: conic-gradient(from var(--band-angle), <tail> 0%, <comet> 12%, <comet-head> 22%, <tail> 34%, var(--band-stroke) 100%)`，并用 mask 只保留 2px 描边环。
  - 思考/工具/完成阶段：暂停角度推进（或关闭 mask 渐变），改动画 alpha/blur/scaleY（WAAPI）。
- 所有连续动画用 WAAPI（与 POC 一致），token 驱动走**变量更新**而非重建。

---

## 2. B：逐 token 流动 —— 驱动方式（读 chunk 内容/节奏）

### 2.1 内容增量来源

- 数据源：客户端 `EventSource.onmessage` 已收到的 `{type:'assistant/chunk', data}` 帧（host 已转发，**无需改 host**）。当前 POC 忽略 `data`，本期必须**读取**它。
- 抽增量 `extractIncrement(data): number`（健壮、绝不为 0）：
  1. 在 `data` 里找字符串字段（候选键：`content` / `text` / `delta` / `message`，或嵌套 `data.data.*` 递归一层）；命中则取该串长度作为增量权重（`chars/4` 视为 1 token 当量，至少 1）。
  2. 没有任何字符串字段时，回退 `+1`（每个 chunk 视为 1 个 token 增量）。
  - 由于 host 只转发 `{type, data}`、`data` 形状不做保证，**契约要求**：无论 `data` 有无内容，`extractIncrement` ≥ 1，且绝不抛错（内容缺失不阻塞，仍按节奏驱动）。
- **语义**：流式输出越快/越多 → 光带流动越快越亮；停顿 → 流动放缓、发光回落到「等待」的稳态 generating glow（不做硬停）。

### 2.2 令牌吞吐估计 + 流速/强度映射

- 滚动窗口（最近 400ms）内累计增量 `sumInc`；`tps = sumInc / 0.4`（token/ms 换算）。
- 映射（有 clamp，避免极端值）：
  - `flowSpeed(deg/s) = clamp(160 + tps * 240, 160, 420)` → 单圈 360/speed ≈ **0.86s–2.25s**。
  - `flowIntensity (base glow alpha) = clamp(0.30 + tps * 0.9, 0.30, 0.40)`。
- token 永远只**调节连续动画的变量**（角度/速度/强度），不重置、不重建动画。

### 2.3 节流 / 合并（高频 chunk 的平滑化）

- **rAF 对齐合并**：把每个 `assistant/chunk` 的 `{increment, ts}` 先入队，**每帧（或 ≥40ms 窗口）冲刷一次**，把窗口内增量求和后一次性更新 `tps`/`--band-spd`/`--band-intensity`/推进 `--band-angle`。这样 60Hz 以上的高频 chunk 全部合并为连续流动。
- **绝不逐事件重建**：延续 POC 的「仅 phase 变化才 startMain」；token 更新仅改 CSS 变量，不改动画实例。
- 停顿处理：`>600ms` 无新增量 → 把 `tps` 平滑衰减到 0（让流动自然放缓），再回到稳态 generating glow；不做硬停。
- 一次性 flash（非 token 流）独立节流：工具闪光最小间隔 500ms；完成回落一次性。
- **节流阈值（最终值）**：token 合并窗口 40ms（rAF 对齐）；工具闪 500ms；变量更新 ≤ 每帧 1 次。

---

## 3. 低打扰 / 可关 / reduced-motion 行为标准

- **可关（aiFeedback=false）**：立即隐藏整条光带（opacity 0 + cancel 全部动画），`subscribeConfig` 实时响应；关闭无残留。
- **reduced-motion（prefers-reduced-motion: reduce）**：降级为**静态细描边**——只保留一层薄薄、单一、稳定微光的 2px 描边（alpha ~0.25，blur 恒定），**无呼吸、无环游、无闪光、无 scaleY 回落**；仍用静态颜色/alpha 区分当前阶段（thinking/generating/tool/complete 各给一个静态微差别），但**零运动**。复用 `reducedMotion()`。
- **低打扰硬约束（验收硬指标）**：
  - 最大描边 alpha ≤ 0.95；最大外发光 alpha ≤ 0.40；最大 blur ≤ 16px（工具闪除外 ≤20px）。**绝不超限**。
  - 光带内无文字、无百分比、无图标、无动画帧率或「加载中」语义。
  - `pointer-events: none`，不拦截任何点击/输入；几何上不覆盖输入框正文与操作按钮（只在其外缘 halo）。
  - 同时只有 **1 个**移动高亮（彗星）；不喷粒子、不叠加多次闪、**不发声**（声音维持既有 answer-done/`sound` 配置）、**不抖页面**（抖动维持既有 pageShake，独立于光带）。
  - 流畅性：generating 全程 ≥60fps，且不出现 cancel/animate 抖动（连续动画实例在 generating 期间**不重建**）。
- **解耦**：光带只读 `getConfig/subscribeConfig`、`reducedMotion()`、生命周期事件；**不得** import/改动 flame/shake/audio/键盘/Overlay 或触发其动画。

---

## 4. 『陪伴感 vs 干扰』验收点（reviewer / 人工实测）

### 4.1 有陪伴感（Companionship ✓）

1. 状态切换**及时可读**：turn/start→呼吸、首个 chunk→流动、tool/call→蓝闪、turn/end→回落，均在 ~100ms 内反映到光带。
2. **贴输入框**：光带跟随输入框移动/缩放/内容增长，稳稳抱住 composer，而非独立漂浮点。
3. **流动与产出同拍**：回答打得快 → 流动快，停顿/思考 → 放缓发光；是「AI 正在这里陪你写」的体感，不是加载条。
4. 全程**克制**：薄描边 + 柔和发光，存在感是「陪伴」而不是「通知」。

### 4.2 不是干扰（Not distraction ✓）

5. 连续使用 2–3 分钟后，目光不受光带强拉；无闪烁、无「跳变-卡顿」式流动。
6. 状态切换不闪眼（无过亮 bloom、无高频闪）。
7. 光带**永不**让你产生「这是什么/要不要处理」的疑问，也不打断输入（不拦截点击、不遮内容、不发声、不抖页）。
8. **关闭即静默**：aiFeedback 关 → 立即消失、零残留；reduced-motion → 静态薄描边、零运动。

> 人工实测清单（verifier 也复核）：
> (a) 真实会话中 thinking→generating→(tool)→complete→idle 转场是否按本契约；
> (b) generating 流动是否随 token 吞吐平滑变速（拉一段快输出 + 一段停顿对比）；
> (c) 浅色/深色两主题下描边/发光/彗星是否清晰且克制（截图）；
> (d) aiFeedback 关闭即时隐藏、reduced-motion 静态描边；
> (e) 键盘/火焰/抖动/音效/answer-done 均未被破坏。

---

## 5. 验收契约（t1 判定）

1. **定位/尺寸**：光带贴 `[data-composer-card]` 外缘 8px 圆角描边（min 宽 240px、clamp 视口、兜底视口底部居中），与输入框同步跟随，pointer-events:none。
2. **颜色体系**：AI 品牌蓝 + 明暗主题感知（`data-ds-dark-theme` / `prefers-color-scheme` 兜底、主题变更重渲染）；浅/深两主题截图清晰可读。
3. **四态映射**：思考=2400ms ease-in-out 柔呼吸；生成=单亮弧环游（单圈 0.9–2.25s，token 调速）；工具=单次 380ms 蓝闪(间隔≥500ms)+冷蓝稳态；完成=200ms 增亮+700ms 回落(scaleY 1→0.72、ease-in-out)后清空。
4. **逐 token 流动（B）**：`assistant/chunk` 内容增量经 `extractIncrement`（字符串长度加权，缺省 +1）驱动，rAF/40ms 合并，token 只在连续动画变量上生效（不重建），吞吐映射流速/强度并 clamp。
5. **可关 / 降级**：aiFeedback=false 立即隐藏；reduced-motion 静态细描边（零运动、仍以静态色区分阶段）；无文字/图标/声音/抖动/粒子，pointer-events:none。
6. **不破坏**：flame/shake/audio/keyboard/answer-done 全部保持；光带模块与它们零耦合；typecheck+build 通过。
7. **契约落点**：以上均写进本规格，作为 t2/t3 的实现依据与 t5 评审基准。
