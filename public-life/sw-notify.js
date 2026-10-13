// Imported by the generated service worker: tapping a reminder focuses (or opens) the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '#/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const scope = self.registration.scope
    for (const c of all) {
      if (c.url.startsWith(scope)) {
        await c.focus()
        if ('navigate' in c) await c.navigate(scope + target).catch(() => {})
        return
      }
    }
    await self.clients.openWindow(scope + target)
  })())
})
