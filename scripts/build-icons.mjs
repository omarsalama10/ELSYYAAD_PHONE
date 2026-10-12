// Renders public/icons/icon.svg to the PNG sizes iOS and the manifest need.
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'

const svg = await readFile(new URL('../public/icons/icon.svg', import.meta.url), 'utf8')
const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 }
const browser = await chromium.launch()
for (const [file, size] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  await page.screenshot({ path: new URL(`../public/icons/${file}`, import.meta.url).pathname })
  await page.close()
}
await browser.close()
console.log('icons written')
