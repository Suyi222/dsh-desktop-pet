# dsh-desktop-pet

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 打造的桌面宠物：官方鲸鱼常驻网页角落，漂浮在一片圆形海域里——**海平面就是你的 API 余额**，同时实时反应 agent 的工作状态。

![demo](docs/demo.gif)

## 功能

- **实时状态** — 休息 / 思考 / 工作中 / 出错了(❗),状态气泡显示阶段、当前工具和已耗时,和 agent 完全同步。
- **余额即海平面** — 圆形海面高度 = `余额 / balanceScale`(默认 ¥100 = 满),波浪滚动 + 潮汐缓慢起伏,水面上印着余额数字;余额过低时鲸鱼会垂头丧气地抱怨。
- **可互动** — 点击摸鱼:多数是弹性跳跃,40% 概率触发转体跳水(蓄力 → 360° 转体入水 → 大水花 → 高反弹 → 小跳 → 小水花收尾);每个状态有随机台词(中/英),点击飘爱心,思考时冒气泡;可拖拽、可最小化成圆点。
- **零运行时依赖** — 产物预构建,所有 `@deepseek-ai/*` 服务由 Harness 自身提供,安装无需构建、无需构建授权。

## 安装

前置:一个 DeepSeek Harness 安装(推荐 web profile)。

```bash
# GitHub 直装(预构建产物,无需构建授权)
dsh plugin --profile web add github:FenyxHuang/dsh-desktop-pet

# 或本地 checkout
dsh plugin --profile web add link:/path/to/dsh-desktop-pet

# 或 tarball
pnpm pack
dsh plugin --profile web add ./dsh-desktop-pet-0.1.0.tgz
```

安装后重启 `dsh`(组合层在启动时合成)。鲸鱼出现在网页左下角(默认锚定左侧:右侧浮层面板——如 dsh-better-sidebar 的 Explorer,`z-index:50` 高于 `shell.overlay` 层的 `z-index:20`——会盖住右锚定的鲸鱼并吞掉它的点击;左锚定可避开该冲突,且鲸鱼完全可拖拽)。

### 配置

bundle 通过 `cordis.patch.yml` 挂载一行(host;浏览器半由包的 `dsh.client` 声明自动发现——为同一包写第二个 entry 会让 host 端执行两次,导致 `petStatus` 服务重复注册冲突):

| id | 包 | 配置 |
|---|---|---|
| `pet-status` | `dsh-desktop-pet` | `balanceScale: 100`(海面满时的 CNY 金额;海平面 = `balance / balanceScale`,上限 1) |

宿主行通过 Harness 标准凭证(`DEEPSEEK_API_KEY`)读取密钥,每 15 秒最多刷新一次 `https://api.deepseek.com/user/balance`。可在自己的 profile `cordis.patch.yml` 里覆盖:

```yaml
- update:
    - id: pet-status
      config:
        balanceScale: 500
        balanceRefetchMs: 60000
```

## 工作原理

一个 npm 包同时承载两半(对应官方拆分包的形态):

- **宿主半** (`lib/index.js`) — 一个 Cordis 服务(`PetStatusService`),把 `agent/status`、`tools/pre-execute`、`tools/result`、`agent/error` 事件折叠成按会话的快照,通过生成的 Typert Remote(`petStatus.snapshot`)提供出去。`lib/typert.*` 由 `@deepseek-ai/dsh-typert-generator` 生成并提交,消费者拿到的是预构建产物。
- **浏览器半** (`lib/client.js`) — module-loader bundle:自己挂载 Remote 贡献,每秒为当前会话轮询一次,并在 shell overlay 注册小部件。React、Cordis 和平台模块保持外部(由应用提供),其余全部内联。

包**不声明任何运行时依赖**:loader 从 dsh 安装目录本身解析 `@deepseek-ai/*` 名字——这正是官方插件契约。

## 开发

独立单包仓库(TypeScript + tsdown)。构建和测试需要位于 DeepSeek Harness checkout 内部(测试会把 `@deepseek-ai/*` 别名到其源码树):

```bash
# 在 harness checkout 内(如 <harness>/.dsh-build/dsh-desktop-pet)
pnpm install
pnpm run build          # tsc 两个面 + tsdown 宿主/浏览器 bundle
pnpm run test           # 34 通过;7 个 jsdom 组件测试需受支持 Node(^22.19 || >=24)
```

仅在 Remote 接口变化时需要重新生成 Typert 产物:可复制 harness 自身构建的对应产物并替换包名,或在 `<workspace>/packages/*` 布局下运行官方生成器(其发现逻辑要求该布局)。

## License

MIT — 衍生自 DeepSeek Harness 代码库(MIT,© 2026 DeepSeek)。鲸鱼为 DeepSeek 官方品牌素材,仅用于组件自身展示。
