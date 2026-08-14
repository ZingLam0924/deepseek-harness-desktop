// 用 sharp 将 DeepSeek 鲸鱼 favicon.svg 渲染为黑色 256x256 PNG，供 electron-builder 打包。
const sharp = require('C:/Users/Administrator/.dsh/profiles/node_modules/sharp')
const fs = require('node:fs')
const path = require('node:path')

const src = 'D:\\projects\\deepseek-harness\\website\\public\\favicon.svg'
const outDir = 'D:\\projects\\d-teacher-desktop\\build'
const outPng = path.join(outDir, 'icon.png')

fs.mkdirSync(outDir, { recursive: true })

async function main() {
  const svg = fs.readFileSync(src, 'utf8')
  // 原 SVG 的鲸鱼是 DeepSeek 品牌蓝 #4D6BFE；用户要黑色，直接替换。
  const blackSvg = svg.replace(/fill="#4D6BFE"/g, 'fill="#000"')
  await sharp(Buffer.from(blackSvg)).resize(256, 256).png().toFile(outPng)
  console.log('icon.png written:', fs.existsSync(outPng))

  // 校验像素确实是黑色
  const sharpInst = require('C:/Users/Administrator/.dsh/profiles/node_modules/sharp')
  const { data, info } = await sharpInst(outPng).raw().toBuffer({ resolveWithObject: true })
  let dark = 0
  let total = 0
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] > 0) {
      total++
      if (data[i] < 64 && data[i + 1] < 64 && data[i + 2] < 64) dark++
    }
  }
  console.log(`不透明像素 ${total} 个，其中近黑色 ${dark} 个 (${(dark / Math.max(total, 1) * 100).toFixed(1)}%)`)
}

main().catch((err) => { console.error(err); process.exit(1) })
