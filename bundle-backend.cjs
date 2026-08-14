// 捆绑脚本：构建自包含的 dsh 后端 bundle，供 electron-builder 打进 resources。
//
// electron-builder 的 extraResources 会排除 from 目录里的 node_modules（默认
// app 打包规则），所以这里把整个 bundle 打成单个 tar.gz，安装包只携带一个
// 文件，运行时由 main.js 解压到用户数据目录。
//
// 产物：build/dsh-bundle.tar.gz（内含 node.exe / node_modules / dsh-home / bundle.json）
//
// 用法：node bundle-backend.cjs
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = __dirname
const BUILD = path.join(ROOT, 'build')
const BUNDLE = path.join(BUILD, 'dsh-bundle')
const BUNDLE_NM = path.join(BUNDLE, 'node_modules')
const BUNDLE_HOME = path.join(BUNDLE, 'dsh-home')
const STAGE = path.join(BUILD, 'dsh-bundle-stage')
const ARCHIVE = path.join(BUILD, 'dsh-bundle.tar.gz')

const NODE_EXE = process.env.DSH_BUNDLE_NODE || process.execPath
const DSH_VERSION = '0.1.0-rc.6'

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts })
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

async function main() {
  rmrf(STAGE)
  rmrf(BUNDLE)
  rmrf(ARCHIVE)
  fs.mkdirSync(STAGE, { recursive: true })

  // 1. 在干净 stage 里真实安装 dsh（npm 布局，实体文件，无 Junction）
  fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify({ name: 'dsh-bundle', private: true }, null, 2))
  // 用 node 直接运行 npm-cli.js，绕开 Windows 下 execFileSync spawn .cmd 的失败。
  const npmCli = process.env.DSH_BUNDLE_NPM_CLI
    || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  run(process.execPath, [npmCli, 'install', `@deepseek-ai/dsh@${DSH_VERSION}`, '--no-audit', '--no-fund'], { cwd: STAGE })

  // 2. 预初始化 web profile（生成 dsh-home/profiles/web 与 cordis 文件）
  // 用 node 直接运行 dsh 的 bin.js，绕开 execFileSync spawn .cmd 的问题。
  const dshEntry = path.join(STAGE, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const env = { ...process.env, DSH_HOME: path.join(STAGE, 'dsh-home'), DEEPSEEK_API_KEY: '' }
  try {
    run(process.execPath, [dshEntry, 'web', '--help'], { cwd: STAGE, env })
  } catch {
    // --help 也可能以非零退出；profile 目录已生成即可
  }
  if (!fs.existsSync(path.join(STAGE, 'dsh-home', 'profiles', 'web'))) {
    throw new Error('web profile 未初始化成功')
  }

  // 3. 组装 bundle 目录：node.exe + node_modules + dsh-home
  fs.mkdirSync(BUNDLE, { recursive: true })
  fs.copyFileSync(NODE_EXE, path.join(BUNDLE, 'node.exe'))
  fs.cpSync(path.join(STAGE, 'node_modules'), BUNDLE_NM, { recursive: true })
  fs.cpSync(path.join(STAGE, 'dsh-home'), BUNDLE_HOME, { recursive: true })

  // 3b. dsh 在初始化 profile 时会往 profiles/node_modules 写入实体依赖树作为
  // "安装回退"，但 healProfilesModuleFallback 期望那里是它自己管理的符号链接；
  // 实体目录会导致目标机器上报错。回退由 dsh 在首次运行时自动重建（指向
  // bundle 内的 node_modules），因此随包分发前删除整个回退目录。
  rmrf(path.join(BUNDLE_HOME, 'profiles', 'node_modules'))

  // 4. 生成启动信息文件
  fs.writeFileSync(
    path.join(BUNDLE, 'bundle.json'),
    JSON.stringify({ dshVersion: DSH_VERSION, bundledAt: new Date().toISOString() }, null, 2),
  )

  rmrf(STAGE)

  // 5. 打包成单个 tar.gz。用 npm 的 tar 包（纯 JS，跨平台可靠）；
  //    系统 bsdtar 打 3 万+ 文件会超时且容易产出截断归档。
  const tar = require('tar')
  await tar.c({ gzip: true, file: ARCHIVE, cwd: BUILD }, ['dsh-bundle'])

  console.log('bundle 完成:', BUNDLE)
  console.log(`bundle 总体积: ${(dirSize(BUNDLE) / 1024 / 1024).toFixed(0)} MB (含 ${fileCount(BUNDLE)} 个文件)`)
  console.log(`归档: ${ARCHIVE} (${(fs.statSync(ARCHIVE).size / 1024 / 1024).toFixed(0)} MB)`)
}

function dirSize(dir) {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) total += dirSize(p)
    else if (entry.isFile()) total += fs.statSync(p).size
  }
  return total
}

function fileCount(dir) {
  let n = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) n += fileCount(p)
    else n += 1
  }
  return n
}

main().catch((err) => { console.error('捆绑失败:', err); process.exit(1) })
