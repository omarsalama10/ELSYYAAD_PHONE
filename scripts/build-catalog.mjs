// One-off generator: pulls the curated subset of free-exercise-db (Unlicense) listed in
// src/data/sources.json, writes src/data/catalog.json and downloads 2 images per exercise
// into public/exercises/<id>/ so the app works fully offline.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'

const RAW = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main'
const root = new URL('..', import.meta.url).pathname
const ids = [...new Set(JSON.parse(await readFile(`${root}src/data/sources.json`, 'utf8')))]

const all = await (await fetch(`${RAW}/dist/exercises.json`)).json()
const byId = new Map(all.map((e) => [e.id, e]))

const out = []
for (const id of ids) {
  const e = byId.get(id)
  if (!e) throw new Error(`Unknown exercise id: ${id}`)
  const dir = `${root}public/exercises/${id}`
  await mkdir(dir, { recursive: true })
  const images = []
  for (const [i, img] of e.images.slice(0, 2).entries()) {
    const file = `${dir}/${i}.jpg`
    const exists = await access(file).then(() => true, () => false)
    if (!exists) {
      const res = await fetch(`${RAW}/exercises/${img}`)
      if (!res.ok) throw new Error(`Image ${img}: HTTP ${res.status}`)
      await writeFile(file, Buffer.from(await res.arrayBuffer()))
    }
    images.push(`exercises/${id}/${i}.jpg`)
  }
  out.push({
    id,
    name: e.name,
    muscles: [...e.primaryMuscles, ...e.secondaryMuscles],
    equipment: e.equipment ?? 'body only',
    category: e.category,
    instructions: e.instructions,
    images,
  })
}

await writeFile(`${root}src/data/catalog.json`, JSON.stringify(out, null, 1) + '\n')
console.log(`catalog: ${out.length} exercises`)
