// 今日事的 service worker：把網頁本身存在手機裡，沒有網路也打得開。
// 資料（Supabase）不經過這裡；離線時的打勾由網頁自己排隊，連上網路再送。
const CACHE = 'kid-tasks-shell-v1'
const SHELL = ['./', './manifest.webmanifest', './icon.svg', './apple-touch-icon.png']

// 安裝時把網頁和它用到的程式檔（從 index.html 找出來）一起存起來
async function precache() {
  const c = await caches.open(CACHE)
  await c.addAll(SHELL)
  const html = await (await c.match('./')).text()
  const files = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => new URL(m[1], self.registration.scope).href)
  await c.addAll(files)
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    // 網頁：先拿最新的，沒網路就用存著的
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./')),
    )
    return
  }
  // 程式和圖示：檔名含版本號，存過就直接用
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
