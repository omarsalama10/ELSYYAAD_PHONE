let ctx: AudioContext | undefined

/** Must be called from a user gesture once so iOS allows later beeps. */
export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    /* audio unavailable */
  }
}

export function beep(times = 3) {
  if (!ctx) return
  const c = ctx
  for (let i = 0; i < times; i++) {
    const t = c.currentTime + i * 0.35
    const o = c.createOscillator()
    const g = c.createGain()
    o.frequency.value = i === times - 1 ? 1320 : 880
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
    o.connect(g).connect(c.destination)
    o.start(t)
    o.stop(t + 0.3)
  }
}
