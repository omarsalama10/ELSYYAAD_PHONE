import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { deleteInBody, deleteTape, listInBody, listTape, saveInBody, saveTape, uid } from '../db/repo'
import { asymmetryPct, type Point } from '../domain/stats'
import type { InBody, Segments, Tape, TapeField } from '../domain/types'
import { fmtDate, fmtNum, todayISO } from '../lib/format'
import { LineChart, type Series } from '../ui/LineChart'
import { Button, Card, Empty, NumberInput, PageTitle } from '../ui/primitives'
import { useSafe } from '../ui/Toast'

type Tab = 'inbody' | 'tape'

const IB_MAIN: { key: keyof InBody; label: string; unit: string }[] = [
  { key: 'weight', label: 'الوزن', unit: 'كجم' },
  { key: 'smm', label: 'كتلة العضل (SMM)', unit: 'كجم' },
  { key: 'bfm', label: 'كتلة الدهون (BFM)', unit: 'كجم' },
  { key: 'pbf', label: 'نسبة الدهون (PBF)', unit: '%' },
  { key: 'bmi', label: 'BMI', unit: '' },
  { key: 'visceral', label: 'الدهون الحشوية', unit: 'مستوى' },
  { key: 'bmr', label: 'معدل الحرق (BMR)', unit: 'سعرة' },
  { key: 'score', label: 'InBody Score', unit: '/100' },
  { key: 'tbw', label: 'مياه الجسم (TBW)', unit: 'لتر' },
  { key: 'ecwRatio', label: 'ECW/TBW', unit: '' },
  { key: 'protein', label: 'البروتين', unit: 'كجم' },
  { key: 'minerals', label: 'المعادن', unit: 'كجم' },
]
const SEGMENTS: { key: keyof Segments; label: string }[] = [
  { key: 'ra', label: 'دراع يمين' }, { key: 'la', label: 'دراع شمال' }, { key: 'trunk', label: 'الجذع' },
  { key: 'rl', label: 'رجل يمين' }, { key: 'll', label: 'رجل شمال' },
]
const TAPE: { key: TapeField; label: string }[] = [
  { key: 'neck', label: 'الرقبة' }, { key: 'chest', label: 'الصدر' }, { key: 'waist', label: 'الوسط (عند السرة)' }, { key: 'hips', label: 'الحوض' },
  { key: 'armR', label: 'دراع يمين' }, { key: 'armL', label: 'دراع شمال' }, { key: 'forearmR', label: 'ساعد يمين' }, { key: 'forearmL', label: 'ساعد شمال' },
  { key: 'thighR', label: 'فخد يمين' }, { key: 'thighL', label: 'فخد شمال' }, { key: 'calfR', label: 'سمانة يمين' }, { key: 'calfL', label: 'سمانة شمال' },
]

const ts = (date: string) => new Date(`${date}T12:00:00`).getTime()

function seriesOf<T extends { date: string }>(rows: T[], get: (r: T) => number | undefined): Point[] {
  return rows.flatMap((r) => {
    const y = get(r)
    return y === undefined || Number.isNaN(y) ? [] : [{ x: ts(r.date), y }]
  })
}

function Field({ label, unit, value, onChange }: { label: string; unit?: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <label className="space-y-1 text-xs text-muted">
      <span>{label}{unit ? ` (${unit})` : ''}</span>
      <NumberInput ariaLabel={label} value={value} onChange={onChange} />
    </label>
  )
}

/** Delta from first to latest entry, labeled good/bad so meaning never relies on color alone. */
function Delta({ label, first, last, unit, goodWhen }: { label: string; first?: number; last?: number; unit: string; goodWhen?: 'up' | 'down' }) {
  if (first === undefined || last === undefined) return null
  const d = last - first
  const good = d === 0 || !goodWhen ? undefined : (d > 0) === (goodWhen === 'up')
  return (
    <div className="rounded-xl bg-surface2 p-2 text-center">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-bold">{fmtNum(last)} <span className="text-xs text-muted">{unit}</span></div>
      <div className={`text-xs ${good === undefined ? 'text-muted' : good ? 'text-accent' : 'text-warn'}`}>
        {d > 0 ? '▲' : d < 0 ? '▼' : '•'} {fmtNum(Math.abs(d))} {good === undefined ? '' : good ? '(كويس)' : '(راقبه)'}
      </div>
    </div>
  )
}

function InBodyForm({ initial, onDone }: { initial?: InBody; onDone: () => void }) {
  const safe = useSafe()
  const [r, setR] = useState<InBody>(initial ?? { id: uid(), date: todayISO(), weight: NaN, lean: {}, fat: {} })
  const set = (k: keyof InBody, v: number | undefined) => setR((x) => ({ ...x, [k]: v }))
  const setSeg = (kind: 'lean' | 'fat', k: keyof Segments, v: number | undefined) => setR((x) => ({ ...x, [kind]: { ...x[kind], [k]: v } }))
  const submit = () =>
    safe(async () => {
      if (!r.weight || Number.isNaN(r.weight)) throw new Error('الوزن مطلوب')
      await saveInBody(r)
      onDone()
    }, 'قياس InBody اتحفظ')

  return (
    <Card className="space-y-4">
      <label className="block space-y-1 text-xs text-muted">التاريخ<input type="date" className="ltr block w-full" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2">
        {IB_MAIN.map((f) => <Field key={f.key} label={f.label} unit={f.unit} value={Number.isNaN(r[f.key] as number) ? undefined : (r[f.key] as number | undefined)} onChange={(v) => set(f.key, v)} />)}
      </div>
      {(['lean', 'fat'] as const).map((kind) => (
        <div key={kind} className="space-y-2">
          <h3 className="text-sm font-bold">{kind === 'lean' ? 'العضل لكل جزء (Segmental Lean) — كجم' : 'الدهون لكل جزء (Segmental Fat) — كجم'}</h3>
          <div className="grid grid-cols-3 gap-2">
            {SEGMENTS.map((s) => <Field key={s.key} label={s.label} value={r[kind][s.key]} onChange={(v) => setSeg(kind, s.key, v)} />)}
          </div>
        </div>
      ))}
      <label className="block space-y-1 text-xs text-muted">ملاحظة<input className="block w-full" value={r.note ?? ''} onChange={(e) => setR({ ...r, note: e.target.value })} /></label>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={submit}>حفظ</Button>
        <Button variant="ghost" onClick={onDone}>إلغاء</Button>
      </div>
    </Card>
  )
}

function TapeForm({ initial, onDone }: { initial?: Tape; onDone: () => void }) {
  const safe = useSafe()
  const [r, setR] = useState<Tape>(initial ?? { id: uid(), date: todayISO() })
  const submit = () =>
    safe(async () => {
      if (!TAPE.some((f) => r[f.key] !== undefined)) throw new Error('دخّل مقاس واحد على الأقل')
      await saveTape(r)
      onDone()
    }, 'المقاسات اتحفظت')
  return (
    <Card className="space-y-4">
      <label className="block space-y-1 text-xs text-muted">التاريخ<input type="date" className="ltr block w-full" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} /></label>
      <p className="text-xs text-muted">بالسنتيمتر — قيس الصبح قبل الأكل، والعضلة مرتاحة مش مشدودة.</p>
      <div className="grid grid-cols-2 gap-2">
        {TAPE.map((f) => <Field key={f.key} label={f.label} unit="سم" value={r[f.key]} onChange={(v) => setR({ ...r, [f.key]: v })} />)}
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={submit}>حفظ</Button>
        <Button variant="ghost" onClick={onDone}>إلغاء</Button>
      </div>
    </Card>
  )
}

function lr<T extends { date: string }>(rows: T[], l: (r: T) => number | undefined, r: (x: T) => number | undefined): Series[] {
  return [
    { name: 'شمال', points: seriesOf(rows, l) },
    { name: 'يمين', points: seriesOf(rows, r) },
  ]
}

/** Charts for fields the user may never fill in stay hidden until there is data. */
function Optional(props: { title: string; unit?: string; series: Series[] }) {
  return props.series.some((x) => x.points.length > 0) ? <LineChart {...props} /> : null
}

function Asym({ label, l, r }: { label: string; l?: number; r?: number }) {
  if (l === undefined || r === undefined) return null
  const pct = asymmetryPct(l, r)
  const weaker = l < r ? 'الشمال' : 'اليمين'
  return (
    <div className={`rounded-xl px-3 py-2 text-sm ${pct >= 5 ? 'bg-warn/10 text-warn' : 'bg-surface2 text-muted'}`}>
      {label}: فرق {pct}% {pct > 0 ? `— ${weaker} أضعف` : ''}{pct >= 5 ? ' ⚠️ ابدأ بيه وزوّد له مجموعة' : ''}
    </div>
  )
}

export function BodyScreen() {
  const safe = useSafe()
  const [tab, setTab] = useState<Tab>('inbody')
  const [editing, setEditing] = useState<InBody | Tape | 'new'>()
  const inbody = useLiveQuery(() => listInBody(), [])
  const tape = useLiveQuery(() => listTape(), [])
  useEffect(() => window.scrollTo(0, 0), [editing, tab])
  if (!inbody || !tape) return null

  const switchTab = (t: Tab) => { setTab(t); setEditing(undefined) }
  const ibFirst = inbody[0], ibLast = inbody.at(-1)
  const tpLast = tape.at(-1)

  return (
    <div className="space-y-4">
      <PageTitle action={!editing && <Button className="px-3 py-2 text-sm" onClick={() => setEditing('new')}>+ قياس جديد</Button>}>الجسم</PageTitle>
      <div className="flex gap-2">
        {(['inbody', 'tape'] as const).map((t) => (
          <button key={t} type="button" onClick={() => switchTab(t)} className={`flex-1 rounded-xl py-2 font-bold ${tab === t ? 'bg-accent text-bg' : 'bg-surface2 text-muted'}`}>
            {t === 'inbody' ? 'InBody' : 'مقاسات بالشريط'}
          </button>
        ))}
      </div>

      {editing && tab === 'inbody' && <InBodyForm initial={editing === 'new' ? undefined : (editing as InBody)} onDone={() => setEditing(undefined)} />}
      {editing && tab === 'tape' && <TapeForm initial={editing === 'new' ? undefined : (editing as Tape)} onDone={() => setEditing(undefined)} />}

      {!editing && tab === 'inbody' && (
        inbody.length === 0 ? <Empty>سجّل أول قياس InBody — اعمله كل 3-4 أسابيع في نفس الوقت من اليوم.</Empty> : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Delta label="الوزن" first={ibFirst?.weight} last={ibLast?.weight} unit="كجم" />
              <Delta label="العضل" first={ibFirst?.smm} last={ibLast?.smm} unit="كجم" goodWhen="up" />
              <Delta label="الدهون" first={ibFirst?.pbf} last={ibLast?.pbf} unit="%" goodWhen="down" />
            </div>
            <Asym label="عضل الرجلين" l={ibLast?.lean.ll} r={ibLast?.lean.rl} />
            <Asym label="عضل الدراعين" l={ibLast?.lean.la} r={ibLast?.lean.ra} />
            <LineChart title="الوزن" unit="كجم" series={[{ name: 'الوزن', points: seriesOf(inbody, (r) => r.weight) }]} />
            <LineChart title="كتلة العضل (SMM)" unit="كجم" series={[{ name: 'SMM', points: seriesOf(inbody, (r) => r.smm) }]} />
            <LineChart title="نسبة الدهون (PBF)" unit="%" series={[{ name: 'PBF', points: seriesOf(inbody, (r) => r.pbf) }]} />
            <Optional title="الدهون الحشوية" series={[{ name: 'حشوية', points: seriesOf(inbody, (r) => r.visceral) }]} />
            <Optional title="عضل الرجلين: شمال مقابل يمين" unit="كجم" series={lr(inbody, (r) => r.lean.ll, (r) => r.lean.rl)} />
            <Optional title="عضل الدراعين: شمال مقابل يمين" unit="كجم" series={lr(inbody, (r) => r.lean.la, (r) => r.lean.ra)} />
            <Card>
              <h2 className="mb-2 font-bold">كل القياسات</h2>
              <ul className="divide-y divide-line text-sm">
                {[...inbody].reverse().map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-2">
                    <button type="button" className="flex-1 text-right" onClick={() => setEditing(r)}>
                      <span className="text-muted">{fmtDate(ts(r.date))}</span> — {fmtNum(r.weight)} كجم • عضل {fmtNum(r.smm)} • دهون {fmtNum(r.pbf)}%
                    </button>
                    <button type="button" className="text-xs text-danger" onClick={() => { if (confirm('تمسح القياس ده؟')) void safe(() => deleteInBody(r.id)) }}>مسح</button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )
      )}

      {!editing && tab === 'tape' && (
        tape.length === 0 ? <Empty>سجّل مقاساتك بالشريط — الساعد والدراع والفخد شمال ويمين، والوسط.</Empty> : (
          <div className="space-y-3">
            <Asym label="الساعد" l={tpLast?.forearmL} r={tpLast?.forearmR} />
            <Asym label="الفخد" l={tpLast?.thighL} r={tpLast?.thighR} />
            <LineChart title="الوسط (الكرش)" unit="سم" series={[{ name: 'الوسط', points: seriesOf(tape, (r) => r.waist) }]} />
            <LineChart title="الساعد" unit="سم" series={lr(tape, (r) => r.forearmL, (r) => r.forearmR)} />
            <Optional title="الدراع" unit="سم" series={lr(tape, (r) => r.armL, (r) => r.armR)} />
            <Optional title="الفخد" unit="سم" series={lr(tape, (r) => r.thighL, (r) => r.thighR)} />
            <Card>
              <h2 className="mb-2 font-bold">كل المقاسات</h2>
              <ul className="divide-y divide-line text-sm">
                {[...tape].reverse().map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-2">
                    <button type="button" className="flex-1 text-right" onClick={() => setEditing(r)}>
                      <span className="text-muted">{fmtDate(ts(r.date))}</span> — وسط {fmtNum(r.waist)} • ساعد {fmtNum(r.forearmR)}/{fmtNum(r.forearmL)}
                    </button>
                    <button type="button" className="text-xs text-danger" onClick={() => { if (confirm('تمسح المقاسات دي؟')) void safe(() => deleteTape(r.id)) }}>مسح</button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )
      )}
    </div>
  )
}
