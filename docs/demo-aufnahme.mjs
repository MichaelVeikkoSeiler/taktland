// Nimmt das Demo-Video auf (app/public/demo/taktland-demo.mp4).
// Ablauf: in app/ «npm run build» und «npx vite preview --port 4173», dann
// «node docs/demo-aufnahme.mjs» (braucht playwright), danach die Bilder mit ffmpeg
// zusammensetzen: ffmpeg -f concat -safe 0 -i /tmp/claude-0/demo-video/liste.txt
//   -vf fps=30,format=yuv420p -c:v libx264 -crf 28 -movflags +faststart taktland-demo.mp4

import { chromium } from 'playwright'
const D = '/tmp/claude-0/demo-video'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  geolocation: { latitude: 46.00549, longitude: 8.94706 }, permissions: ['geolocation'], colorScheme: 'light',
})
await ctx.addInitScript(() => {
  window.__cap = (t) => {
    let e = document.getElementById('__cap')
    if (!e) {
      e = document.createElement('div'); e.id = '__cap'
      e.style.cssText = 'position:fixed;left:12px;right:12px;bottom:20px;z-index:9999;background:rgba(33,33,33,.92);color:#fff;font:600 17px/1.35 Helvetica,Arial,sans-serif;padding:12px 14px;border-radius:8px;transition:opacity .3s'
      document.body.appendChild(e)
    }
    e.style.opacity = t ? '1' : '0'; if (t) e.textContent = t
  }
  window.__karte = (t) => {
    let e = document.getElementById('__karte')
    if (!e) {
      e = document.createElement('div'); e.id = '__karte'
      e.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#fff;display:flex;flex-direction:column;justify-content:center;padding:32px;font:17px/1.45 Helvetica,Arial,sans-serif;color:#000'
      document.body.appendChild(e)
    }
    e.innerHTML = t
  }
})
const p = await ctx.newPage()
import fs from 'fs'
fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true })
const cdp = await ctx.newCDPSession(p)
const bilder = []
cdp.on('Page.screencastFrame', async (f) => {
  const n = `${D}/f${String(bilder.length).padStart(5, '0')}.jpg`
  fs.writeFileSync(n, Buffer.from(f.data, 'base64'))
  bilder.push([n, f.metadata.timestamp])
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
})
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 780, maxHeight: 1688 })
const w = (ms) => p.waitForTimeout(ms)
const cap = (t) => p.evaluate((t) => window.__cap(t), t)
const scroll = (y) => p.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), y)
const rot = '<div style="height:4px;width:40px;background:#eb0000;margin-bottom:14px"></div>'

await p.goto('http://localhost:4173/#/'); await w(300)
await p.evaluate((r) => window.__karte(r + '<div style="font-size:40px;font-weight:700;letter-spacing:-.5px">Taktland</div><div style="margin-top:10px;font-size:20px">Ein Lernspiel rund um die Schweizer Bahn</div><div style="margin-top:22px;color:#767676">Eine Aufnahme der App</div>'), rot)
await w(3000)
await p.evaluate(() => document.getElementById('__karte').remove())
await w(1200)
await cap('1175 Bahnhöfe, 155 Strecken, 289 Tunnel und 4057 Brücken, alles aus offenen Daten')
await w(3500); await scroll(420); await w(2500)

// Bahnhof
await cap('Jeder Bahnhof hat Kapitel mit Fakten und Fragen')
await scroll(0); await w(800)
await p.getByRole('link', { name: 'Bahnland' }).first().click(); await w(1500)
const suche = p.getByPlaceholder('Bahnhof suchen')
await suche.scrollIntoViewIfNeeded(); await suche.click(); await suche.pressSequentially('Lugano', { delay: 120 }); await w(900)
await p.locator('ul li button').filter({ hasText: /^Lugano/ }).first().click(); await w(2200)
const frage = p.getByText('Wie viele Personen steigen an einem Werktag in Lugano ein und aus?')
await frage.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy({ top: 120, behavior: 'smooth' })); await w(2200)
await p.getByRole('button', { name: /35.600/ }).first().click(); await w(3500)

// Duell
await scroll(0); await w(700)
await cap('Im Duell treten zwei Bahnhöfe, Strecken oder Tunnel gegeneinander an')
await p.getByRole('link', { name: 'Duell' }).first().click(); await w(1200)
await p.evaluate(() => window.scrollTo({ top: 330, behavior: 'smooth' })); await w(2800)
await p.locator('ul li button').first().click(); await w(3800)

// Fahrtmodus
await scroll(0); await w(700)
await cap('Fahrtmodus: Start per GPS, dann das Ziel eingeben')
await p.getByRole('link', { name: 'Fahrtmodus' }).first().click(); await w(1200)
await p.evaluate(() => window.scrollTo({ top: 640, behavior: 'smooth' })); await w(1800)
const nach = p.getByPlaceholder('Bahnhof').last()
await nach.click(); await nach.pressSequentially('Bellinzona', { delay: 110 }); await w(800)
await p.locator('ul li').filter({ hasText: 'Bellinzona' }).first().click(); await w(1500)
await cap('Hier als Probefahrt: der Weg 20-mal schneller abgespielt')
await w(2000)
await p.getByRole('button', { name: 'Probefahrt' }).click(); await w(500)
await p.evaluate(() => window.scrollTo(0, 0))
await cap('Taktland meldet Tunnel, Brücken und Bahnhöfe, bevor der Zug sie erreicht')
for (let i = 0; i < 90; i++) {
  await w(500)
  if (i === 24) await cap('Im Band: wo der Zug ist und was noch kommt')
  if (i === 50) await cap('Die Angaben kommen aus den Daten, etwa die Länge des Tunnels')
  if (/nichts mehr\s+zu melden/.test(await p.locator('body').innerText())) break
}
await w(1500)
await cap('Am Ende: die Bilanz der Fahrt')
await p.getByRole('button', { name: 'Beenden' }).click(); await w(3000)
await p.evaluate(() => window.scrollBy({ top: 350, behavior: 'smooth' })); await w(3000)
await cap(null)
await p.evaluate((r) => window.__karte(r + '<div style="font-size:30px;font-weight:700">Taktland</div><div style="margin-top:14px">Jede Angabe stammt aus offenen Daten: data.sbb.ch, opentransportdata.swiss, Bundesamt für Verkehr.</div><div style="margin-top:14px;color:#767676">Ein privates Lernprojekt, kein Angebot der SBB.</div>'), rot)
await w(4500)
await cdp.send('Page.stopScreencast')
bilder.push([bilder.at(-1)[0], Date.now() / 1000])
let liste = ''
for (let i = 0; i < bilder.length - 1; i++) liste += `file '${bilder[i][0]}'\nduration ${(bilder[i + 1][1] - bilder[i][1]).toFixed(3)}\n`
liste += `file '${bilder.at(-1)[0]}'\n`
fs.writeFileSync(D + '/liste.txt', liste); console.log(bilder.length, 'Bilder')
await ctx.close()
await b.close()
