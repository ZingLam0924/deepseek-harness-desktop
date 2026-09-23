# DSH 配置示例（MCP 工具清单 + 运行环境）

这套文件说明「一台 DSH 桌面端**装了哪些 MCP 工具**、跑在**什么版本和什么机器**上」。
**不含凭据、项目信息与会话记录。**

## 里面有什么

| 文件 | 说明 |
|---|---|
| `environment.md` | **运行环境与版本**：dsh 版本、操作系统与机型、各运行时版本 |
| `settings.yaml` | 界面引导与权限预设 |
| `cordis.patch.yml` | 4 个 MCP 服务器的挂载配置（路径用占位符，按自己机器改） |
| `profiles/web/package.json` | web profile 的依赖与 bundle 清单 |
| `profiles/headless/package.json` | headless profile 的依赖与 bundle 清单 |

## 怎么用

1. 先照 `environment.md` 把环境和运行时版本对一遍；
2. 把 `settings.yaml` 与 `cordis.patch.yml` 放到 `%USERPROFILE%\.dsh\`（macOS/Linux：`~/.dsh/`）；
3. 把 `cordis.patch.yml` 里的占位符换成自己机器的实际路径：

| 占位符 | 换成 |
|---|---|
| `<PYTHON_HOME>` | Python 安装目录（`scrapling-mcp.exe` 在其 `Scripts\` 下） |
| `<NPM_GLOBAL>` | npm 全局包目录（`npm root -g` 的输出） |
| `<WECHAT_DEVTOOLS>` | 微信开发者工具安装目录（其 `cli.bat`） |

4. `profiles/*/package.json` 放进 `~/.dsh/profiles/<profile>/` 后跑 `pnpm install`。

## 涉及的 MCP（均为公开包）

| 名称 | 用途 | 来源 |
|---|---|---|
| scrapling | 网页抓取 | PyPI `scrapling`（含 `scrapling-mcp`） |
| playwright | 浏览器自动化 | npm `@automatalabs/mcp-server-playwright` |
| weapp-dev | 微信小程序调试 | npm `@yfme/weapp-dev-mcp` |
| context7 | 开发文档检索 | npm `@upstash/context7-mcp` |