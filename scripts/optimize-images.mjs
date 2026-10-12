// Downscales bundled exercise images (1275px originals) to 600px wide JPEG q0.72 via
// headless Chromium canvas, so the offline precache stays small on mobile data.
import { chromium } from 'playwright'
import { readdir, readFile, writeFile } from 'node:fs/promises'

const dir = new URL('../public/exercises/', import.meta.url).pathname
const browser = await chromium.launch()
const page = await browser.newPage()
let before = 0, after = 0
for (const id of await readdir(dir)) {
  for (const f of await readdir(dir + id)) {
    const path = `${dir}${id}/${f}`
    const src = await readFile(path)
    const b64 = await page.evaluate(async (data) => {
      const img = new Image()
      img.src = `data:image/jpeg;base64,${data}`
      await img.decode()
      if (img.width <= 600) return null // already optimized
      const w = 600, h = Math.round((img.height / img.width) * w)
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      c.getContext('2d').drawImage(img, 0, 0, w, h)
      return c.toDataURL('image/jpeg', 0.72).split(',')[1]
    }, src.toString('base64'))
    if (!b64) continue
    const out = Buffer.from(b64, 'base64')
    before += src.length; after += out.length
    await writeFile(path, out)
  }
}
await browser.close()
console.log(`images: ${(before / 1e6).toFixed(1)}MB -> ${(after / 1e6).toFixed(1)}MB`)
