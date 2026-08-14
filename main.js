/**
 * deepseek harness desktop — Electron 主进程（可分发版）。
 *
 * 与第一版（依赖本机 dsh 仓库）不同，本版捆绑自包含后端（单个 tar.gz 归档，
 * 避免 electron-builder 对 node_modules 的排除）：
 *   resources/dsh-bundle.tar.gz
 *     node.exe              ← 便携 Node 运行时（后端独立进程）
 *     node_modules/         ← @deepseek-ai/dsh 真实依赖树
 *     dsh-home/profiles/web ← 预初始化的 web profile（默认 persona）
 *
 * 首次运行把归档解压到 %APPDATA%\d-teacher-desktop\bundle（可写、可更新），
 * 之后用捆绑 node.exe 启动 dsh web。DeepSeek API Key 由用户在首次运行的
 * 引导页里填入，写入用户自己的 ~/.dsh/.credentials.yaml。
 *
 * 环境变量覆盖（仅调试用）：
 *   DTEACHER_BACKEND_URL   后端地址（默认 http://127.0.0.1:3080）
 *   DTEACHER_BACKEND_PORT  后端端口（默认 3080）
 */

const { app, BrowserWindow, shell, dialog } = require('electron')
const { spawn } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const { homedir } = require('node:os')

const IS_DEV = process.argv.includes('--dev')
const BACKEND_PORT = Number(process.env.DTEACHER_BACKEND_PORT || 3080)
const BACKEND_URL = process.env.DTEACHER_BACKEND_URL || `http://127.0.0.1:${BACKEND_PORT}`

/** 文件日志：写入 userData 下的 main.log，不依赖 stdout 重定向（便于诊断）。 */
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`
  console.log(line)
  try {
    const dir = app.getPath('userData')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'main.log'), line + '\n')
  } catch { /* 日志失败不影响主流程 */ }
}

/** 应用数据目录（%APPDATA%\d-teacher-desktop\bundle）——bundle 解压与运行时文件都在这。 */
function userDataDir() {
  return path.join(app.getPath('userData'), 'bundle')
}

/** 单次探测端口是否可连。 */
function probePort(port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, timeout: timeoutMs }, (res) => {
      res.resume()
      resolve(true)
    })
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
  })
}

// 8/14 修复：轮询等待端口就绪（冷启动后端需数秒到数十秒）
function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const tick = async () => {
      if (await probePort(port)) return resolve(true)
      if (Date.now() > deadline) return resolve(false)
      setTimeout(tick, 1000)
    }
    tick()
  })
}

/** 轮询等待后端就绪。 */
async function waitForBackend(port, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probePort(port)) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

/** 从 app resources 里定位捆绑的后端归档。 */
function bundledArchive() {
  // 开发模式：项目里的 build/dsh-bundle.tar.gz；打包后：resources/dsh-bundle.tar.gz
  const candidates = [
    path.join(__dirname, 'build', 'dsh-bundle.tar.gz'),
    path.join(process.resourcesPath, 'dsh-bundle.tar.gz'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return undefined
}

/** 把 bundle 归档解压到用户可写目录（首次运行；之后若版本一致则跳过）。 */
function ensureBundleInstalled(archivePath) {
  const target = userDataDir()

  // 8/14 修复：完整性校验 = 关键三件套（node.exe + 完成标记 + dsh 入口文件）。
  // 解压中断会留下残缺 bundle（node.exe 在归档里位置靠前，可能已解出），
  // 旧逻辑只看 node.exe 会带着残缺直接启动后端 → 白屏。
  let needsExtract = !(
    fs.existsSync(path.join(target, 'node.exe')) &&
    fs.existsSync(path.join(target, '.installed.json')) &&
    fs.existsSync(path.join(target, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
  )
  if (!needsExtract && fs.existsSync(path.join(target, '.installed.json'))) {
    try {
      const local = JSON.parse(fs.readFileSync(path.join(target, '.installed.json'), 'utf8'))
      needsExtract = local.archiveMtime !== String(fs.statSync(archivePath).mtimeMs)
    } catch {
      needsExtract = true
    }
  }
  if (!needsExtract) return target

  log('解压后端 bundle 到', target)
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })
  try {
    // 用系统 tar 解压（Win10+ 自带 bsdtar，支持 gz）。同步阻塞，解压 90MB
    // /3 万文件需要数十秒到一两分钟，属正常。
    const { execFileSync } = require('node:child_process')
    const out = execFileSync('tar.exe', ['-xzf', archivePath, '-C', target], {
      stdio: 'pipe',
      maxBuffer: 64 * 1024 * 1024,
    })
    if (out && out.length) log('tar 输出:', String(out).slice(0, 500))
  } catch (err) {
    log('tar 解压失败:', err && err.message ? err.message : err)
    if (err && err.stdout) log('tar stdout:', String(err.stdout).slice(0, 500))
    if (err && err.stderr) log('tar stderr:', String(err.stderr).slice(0, 500))
    throw new Error(`tar 解压失败: ${err && err.message ? err.message : String(err)}`)
  }
  // 归档内含 dsh-bundle/ 顶层目录，解压后把其中的条目上移到 target 根。
  // 不能用"先整体移走再移回"的两步 rename：那会把 target 连同 dsh-bundle
  // 一起移走，导致第二步的目标消失。这里逐个条目上移。
  const nested = path.join(target, 'dsh-bundle')
  if (fs.existsSync(nested)) {
    for (const entry of fs.readdirSync(nested)) {
      fs.renameSync(path.join(nested, entry), path.join(target, entry))
    }
    fs.rmSync(nested, { recursive: true, force: true })
  }
  // 8/14 修复：解压后同样校验关键三件套，缺任一即判定不完整并清除缓存，
  // 让下一次启动自动重解压（自愈），而不是带着残缺 bundle 启动白屏。
  const critical = [
    'node.exe',
    path.join('node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  ]
  for (const f of critical) {
    if (!fs.existsSync(path.join(target, f))) {
      fs.rmSync(target, { recursive: true, force: true })
      throw new Error(`bundle 解压不完整（缺 ${f}），已清除缓存，请重启应用自动重新解压`)
    }
  }
  fs.writeFileSync(
    path.join(target, '.installed.json'),
    JSON.stringify({ archiveMtime: String(fs.statSync(archivePath).mtimeMs) }, null, 2),
  )
  return target
}

/** 检查用户是否已配置 DeepSeek API Key。 */
function hasApiKey() {
  const home = process.env.DSH_HOME || path.join(homedir(), '.dsh')
  const credFile = path.join(home, '.credentials.yaml')
  if (!fs.existsSync(credFile)) return false
  const text = fs.readFileSync(credFile, 'utf8')
  const m = text.match(/^\s*DEEPSEEK_API_KEY\s*:\s*(.+)\s*$/m)
  return Boolean(m && m[1] && m[1] !== "''" && m[1] !== '""')
}

/** 引导用户填写 API Key（存到 ~/.dsh/.credentials.yaml）。 */
async function promptForApiKey(win) {
  const home = process.env.DSH_HOME || path.join(homedir(), '.dsh')
  fs.mkdirSync(home, { recursive: true })
  const credFile = path.join(home, '.credentials.yaml')

  const { value } = await dialog.showMessageBox(win, {
    type: 'question',
    title: 'deepseek harness · 首次配置',
    message: '请输入你的 DeepSeek API Key',
    detail: 'Key 只保存在你本机的 ~/.dsh/.credentials.yaml，不会上传或打包进应用。\n\n获取：platform.deepseek.com → API Keys',
    buttons: ['我已填入（下一步）', '暂时跳过'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  if (value !== 0) return false

  // 对话框里没有文本输入；用第二个对话框读 Key。
  // 注：Electron dialog 无输入框，这里用一个隐藏的 prompt 页面做输入更友好，
  // 但保持简单：让用户先把 Key 放进剪贴板，再在下面的对话框确认读取剪贴板。
  const clipboard = require('electron').clipboard
  const candidate = clipboard.readText().trim()
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    title: '粘贴 DeepSeek API Key',
    message: candidate
      ? `检测到剪贴板内容：\n\n${candidate.slice(0, 12)}…${candidate.slice(-4)}\n\n用它作为 API Key 吗？`
      : '请先复制你的 DeepSeek API Key 到剪贴板，然后点"重试"。',
    detail: '或稍后手动编辑 ' + credFile,
    buttons: candidate ? ['用它', '取消'] : ['重试', '取消'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  if (response !== 0) return false
  if (!candidate) return promptForApiKey(win)

  fs.writeFileSync(credFile, `DEEPSEEK_API_KEY: ${candidate}\n`, { mode: 0o600 })
  log('API Key 已保存到', credFile)
  return true
}

let backendChild = null
let backendWasAlreadyRunning = false

async function ensureBackend(win) {
  if (await probePort(BACKEND_PORT)) {
    log('检测到后端已在运行:', BACKEND_URL)
    backendWasAlreadyRunning = true
    return
  }

  const bundle = bundledArchive()
  if (!bundle) {
    log('未找到捆绑的后端归档')
    dialog.showErrorBox('deepseek harness', '未找到捆绑的后端 (dsh-bundle.tar.gz)。请重新安装应用。')
    return
  }

  let installed
  try {
    installed = ensureBundleInstalled(bundle)
  } catch (err) {
    log('后端 bundle 解压失败:', err && err.message ? err.message : String(err))
    dialog.showErrorBox(
      'deepseek harness',
      '后端 bundle 解压失败，应用无法启动。\n\n' + (err && err.message ? err.message : String(err)),
    )
    return
  }
  if (!hasApiKey()) {
    const ok = await promptForApiKey(win)
    if (!ok) {
      // 用户跳过：仍启动，界面会提示无 Key
    }
  }

  const nodeExe = path.join(installed, 'node.exe')
  const dshCli = path.join(installed, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const dshHome = path.join(installed, 'dsh-home')

  log('启动内嵌 dsh web', `DSH_HOME=${dshHome}`)
  log('node.exe 存在:', fs.existsSync(nodeExe), '| dshCli 存在:', fs.existsSync(dshCli))
  // 诊断期捕获子进程输出；正式版可改回 ignore。
  backendChild = spawn(nodeExe, [dshCli, 'web', '--port', String(BACKEND_PORT)], {
    cwd: installed,
    windowsHide: true,
    env: {
      ...process.env,
      DSH_HOME: dshHome,
      PATH: (process.env.PATH || '') + path.delimiter + path.dirname(nodeExe),
    },
  })
  let childOut = ''
  let childErr = ''
  backendChild.stdout && backendChild.stdout.on('data', (d) => { childOut += d })
  backendChild.stderr && backendChild.stderr.on('data', (d) => { childErr += d })
  backendChild.on('error', (err) => log('后端 spawn error:', err && err.message ? err.message : String(err)))
  backendChild.on('exit', (code, signal) => {
    log(`后端退出 code=${code} signal=${signal}`)
    if (childErr) log('后端 stderr:', String(childErr).slice(0, 2000))
    if (childOut) log('后端 stdout:', String(childOut).slice(0, 1000))
  })

  if (!(await waitForBackend(BACKEND_PORT))) {
    log('等待后端超时。')
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'deepseek harness',
    backgroundColor: '#f5f1ea',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.loadURL(BACKEND_URL)
  win.setTitle('deepseek harness')

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (IS_DEV) win.webContents.openDevTools({ mode: 'detach' })
  return win
}

app.whenReady().then(async () => {
  const win = createWindow()
  await ensureBackend(win)

  // 8/14 修复：冷启动时窗口先于后端创建，首次 loadURL 在后端就绪前必然失败；
  // 等后端就绪后重新加载窗口，避免白屏。
  if (!backendWasAlreadyRunning) {
    const ready = await waitForPort(BACKEND_PORT, 30000)
    if (ready) {
      log('后端已就绪，重新加载窗口')
      win.loadURL(BACKEND_URL)
    } else {
      log('等待后端就绪超时')
    }
  }

  if (!backendChild && !backendWasAlreadyRunning && !(await probePort(BACKEND_PORT))) {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: 'deepseek harness',
      message: '未能启动后端',
      detail: '捆绑的后端未能启动，请重新安装或查看日志。',
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (backendChild && !backendChild.killed) {
    try { backendChild.kill() } catch { /* 进程可能已退出 */ }
  }
})
