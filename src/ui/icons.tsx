const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const Icon = {
  today: () => (<svg viewBox="0 0 24 24" className="h-6 w-6" {...P}><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" /></svg>),
  program: () => (<svg viewBox="0 0 24 24" className="h-6 w-6" {...P}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>),
  body: () => (<svg viewBox="0 0 24 24" className="h-6 w-6" {...P}><circle cx="12" cy="5" r="2" /><path d="M12 7v7M8 10h8M12 14l-3 7M12 14l3 7" /></svg>),
  progress: () => (<svg viewBox="0 0 24 24" className="h-6 w-6" {...P}><path d="M4 19h16M6 15l4-4 3 3 5-6" /></svg>),
  settings: () => (<svg viewBox="0 0 24 24" className="h-6 w-6" {...P}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>),
  check: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" {...P} strokeWidth={3}><path d="M5 12l5 5 9-10" /></svg>),
  back: () => (<svg viewBox="0 0 24 24" className="h-6 w-6" {...P}><path d="M9 6l6 6-6 6" /></svg>),
  chevron: ({ open }: { open: boolean }) => (<svg viewBox="0 0 24 24" className={`h-5 w-5 transition ${open ? 'rotate-180' : ''}`} {...P}><path d="M6 9l6 6 6-6" /></svg>),
  timer: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" {...P}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></svg>),
  video: () => (<svg viewBox="0 0 24 24" className="h-8 w-8" {...P}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></svg>),
  up: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" {...P}><path d="M6 15l6-6 6 6" /></svg>),
  down: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" {...P}><path d="M6 9l6 6 6-6" /></svg>),
  trash: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" {...P}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>),
  plus: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" {...P}><path d="M12 5v14M5 12h14" /></svg>),
  search: () => (<svg viewBox="0 0 24 24" className="h-5 w-5" {...P}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>),
}
