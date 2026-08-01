// Capture le framebuffer du renderer via CDP + état du DOM.
import { writeFileSync } from 'fs'
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const page = list.find((t) => t.type === 'page')
if (!page) {
  console.log('AUCUNE PAGE:', JSON.stringify(list))
  process.exit(0)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
function send(method, params = {}) {
  return new Promise((resolve) => {
    const mid = ++id
    pending.set(mid, resolve)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
await new Promise((r) => (ws.onopen = r))
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value
console.log('root:', (await evl('document.getElementById("root")?.innerHTML.slice(0, 80)')) ?? 'VIDE')
console.log('bg body:', await evl('getComputedStyle(document.body).backgroundColor'))
const shot = await send('Page.captureScreenshot', { format: 'png' })
const data = shot.result?.data
if (data) {
  writeFileSync('.renderer-shot.png', Buffer.from(data, 'base64'))
  console.log('screenshot renderer écrit (.renderer-shot.png), octets:', data.length)
} else {
  console.log('échec screenshot:', JSON.stringify(shot).slice(0, 300))
}
process.exit(0)
