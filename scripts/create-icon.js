#!/usr/bin/env node
/**
 * Generates resources/icons/icon.ico for the SFTP Deployer app.
 * Design: rounded indigo square, white upload arrow + file lines.
 */

const Jimp = require('jimp')
const { default: pngToIco } = require('png-to-ico')
const fs = require('fs')
const path = require('path')

const SIZES = [256, 128, 64, 48, 32, 16]
const OUT_DIR = path.join(__dirname, '../resources/icons')

fs.mkdirSync(OUT_DIR, { recursive: true })

function lerp(a, b, t) { return a + (b - a) * t }

// ─── Draw the master icon at 256×256 ────────────────────────────────────────

async function drawIcon(size) {
  const img = new Jimp(size, size, 0x00000000)

  const S = size
  const cx = S / 2

  // Color palette
  const BG1 = Jimp.cssColorToHex('#4f46e5ff')   // indigo-600
  const BG2 = Jimp.cssColorToHex('#3730a3ff')   // indigo-800 (for gradient feel)
  const WHITE = Jimp.cssColorToHex('#ffffffff')
  const WHITE_DIM = Jimp.cssColorToHex('#ffffff99')
  const WHITE_FAINT = Jimp.cssColorToHex('#ffffff55')

  const radius = Math.round(S * 0.18)  // rounded corner radius

  // Helper: set pixel (clipped)
  function px(x, y, hex) {
    x = Math.round(x); y = Math.round(y)
    if (x < 0 || x >= S || y < 0 || y >= S) return
    img.setPixelColor(hex, x, y)
  }

  // Fill a rectangle
  function rect(x1, y1, x2, y2, hex) {
    for (let y = Math.max(0, Math.round(y1)); y <= Math.min(S - 1, Math.round(y2)); y++)
      for (let x = Math.max(0, Math.round(x1)); x <= Math.min(S - 1, Math.round(x2)); x++)
        img.setPixelColor(hex, x, y)
  }

  // ── Background: rounded rectangle with subtle vertical gradient ──
  img.scan(0, 0, S, S, function (x, y, idx) {
    // Rounded corner mask
    let inside = true
    if (x < radius && y < radius) inside = (x - radius) ** 2 + (y - radius) ** 2 <= radius ** 2
    else if (x > S - 1 - radius && y < radius) inside = (x - (S - 1 - radius)) ** 2 + (y - radius) ** 2 <= radius ** 2
    else if (x < radius && y > S - 1 - radius) inside = (x - radius) ** 2 + (y - (S - 1 - radius)) ** 2 <= radius ** 2
    else if (x > S - 1 - radius && y > S - 1 - radius) inside = (x - (S - 1 - radius)) ** 2 + (y - (S - 1 - radius)) ** 2 <= radius ** 2

    if (!inside) return

    // Vertical gradient: BG1 top → BG2 bottom
    const t = y / S
    const r = Math.round(lerp(0x4f, 0x37, t))
    const g = Math.round(lerp(0x46, 0x30, t))
    const b = Math.round(lerp(0xe5, 0xa3, t))
    this.bitmap.data[idx + 0] = r
    this.bitmap.data[idx + 1] = g
    this.bitmap.data[idx + 2] = b
    this.bitmap.data[idx + 3] = 255
  })

  // ── Upload arrow ──────────────────────────────────────────────────────────
  const arrowCenterX = cx
  const arrowTipY = S * 0.19
  const arrowMidY  = S * 0.52    // where triangle base ends / shaft begins
  const arrowBotY  = S * 0.68
  const arrowHalfW = S * 0.30   // half-width of triangle base
  const shaftHalfW = S * 0.085  // half-width of shaft

  // Triangle (arrow head)
  for (let y = arrowTipY; y <= arrowMidY; y++) {
    const progress = (y - arrowTipY) / (arrowMidY - arrowTipY)
    const hw = progress * arrowHalfW
    rect(arrowCenterX - hw, y, arrowCenterX + hw, y, WHITE)
  }

  // Shaft
  rect(arrowCenterX - shaftHalfW, arrowMidY, arrowCenterX + shaftHalfW, arrowBotY, WHITE)

  // ── File lines (3 horizontal lines below arrow) ───────────────────────────
  const lineX1 = S * 0.22
  const lineX2 = S * 0.78
  const lineH = Math.max(1, Math.round(S * 0.028))
  const lineGap = S * 0.055
  const line1Y = S * 0.76

  rect(lineX1, line1Y, lineX2, line1Y + lineH, WHITE_DIM)
  rect(lineX1, line1Y + lineGap, lineX2, line1Y + lineGap + lineH, WHITE_DIM)
  rect(lineX1 + S * 0.08, line1Y + lineGap * 2, lineX2 - S * 0.08, line1Y + lineGap * 2 + lineH, WHITE_FAINT)

  return img
}

// ─── Build ICO from multiple PNGs ───────────────────────────────────────────

async function main() {
  console.log('Generating icon...')

  const pngPaths = []
  for (const size of SIZES) {
    const img = await drawIcon(size)
    const pngPath = path.join(OUT_DIR, `icon-${size}.png`)
    await img.writeAsync(pngPath)
    pngPaths.push(pngPath)
    console.log(`  ✓ ${size}×${size}`)
  }

  const icoBuffer = await pngToIco(pngPaths)
  const icoPath = path.join(OUT_DIR, 'icon.ico')
  fs.writeFileSync(icoPath, icoBuffer)
  console.log(`\n✓ Icon saved: ${icoPath}`)

  // Cleanup temp PNGs
  for (const p of pngPaths) fs.unlinkSync(p)
}

main().catch((err) => { console.error(err); process.exit(1) })
