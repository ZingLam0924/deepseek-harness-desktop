# deepseek harness 桌面版（可分发版）

DeepSeek Harness Web 界面的桌面应用，**后端内嵌、自包含**：安装后双击即用，
无需在目标机器上安装 Node、克隆仓库或配置 dsh 环境。

> 注意：本应用**不含**任何 API Key。首次运行会引导用户填写自己的
> DeepSeek API Key（只保存在用户本机 `~/.dsh/.credentials.yaml`），
> 不打包、不上传。默认 persona 为标准 coding agent。

> **项目来源**：本项目是 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
> （MIT License, Copyright (c) 2026 DeepSeek）的桌面封装——内嵌其
> `0.1.0-rc.6` 版本，未修改其源码。完整许可证见
> [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)。

## 使用

```sh
pnpm install
pnpm run bundle     # 生成自包含后端 build/dsh-bundle（约 500+ MB）
pnpm run build      # bundle + 打 nsis 安装包 → release/deepseek-harness-Setup-<version>.exe
pnpm run build:portable  # bundle + portable 单文件版
pnpm start          # 开发运行（需要先 build 过 bundle；--dev 打开 DevTools）
```

## 安装包做了什么

1. 安装到用户目录（可选安装位置），创建桌面/开始菜单快捷方式
2. 首次启动：把内嵌的 `dsh-bundle`（node.exe + dsh 依赖树 + 预初始化 web profile）
   复制到 `%LOCALAPPDATA%\deepseek-harness\bundle`
3. 若未检测到 API Key，弹出首次配置引导（从剪贴板读取 Key 写入 `~/.dsh/.credentials.yaml`）
4. 用捆绑的 node.exe 启动 `dsh web`，窗口加载 `http://127.0.0.1:3080`

## 捆绑结构（build/dsh-bundle）

```
node.exe              ← 便携 Node 运行时（约 90MB）
node_modules/         ← @deepseek-ai/dsh 真实依赖树（npm 安装，无软链）
dsh-home/profiles/web ← 预初始化的 web profile（默认 persona）
bundle.json           ← 版本信息（用于增量更新判断）
```

## 环境变量（仅调试）

| 变量 | 默认值 | 含义 |
|---|---|---|
| `DTEACHER_BACKEND_PORT` | `3080` | 内嵌后端监听端口 |
| `DTEACHER_BACKEND_URL` | `http://127.0.0.1:3080` | 窗口加载地址 |
| `DSH_BUNDLE_NODE` | 当前 node | 捆绑用 node.exe 来源 |
| `DSH_BUNDLE_NPM_CLI` | 本机 npm-cli.js | 捆绑安装用 npm CLI |

## 说明

- 内嵌后端由本壳拉起的进程运行，关闭窗口随壳退出；若用户另有 dsh 实例占用
  3080，壳会直接复用（不重复启动）。
- API Key 只存在于用户本机，应用升级不会覆盖 `~/.dsh/.credentials.yaml`。
