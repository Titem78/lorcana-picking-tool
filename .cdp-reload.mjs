// Recharge la page en observant réseau + console + exceptions.
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const page = list.find((t) => t.type === 'page')
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
const reqs = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
    return
  }
  const p = msg.params
  switch (msg.method) {
    case 'Network.requestWillBeSent':
      reqs.set(p.requestId, p.request.url.split('/').pop())
      break
    case 'Network.loadingFinished':
      console.log('[OK ]', reqs.get(p.requestId))
      break
    case 'Network.loadingFailed':
      console.log('[FAIL]', reqs.get(p.requestId), '→', p.errorText, p.blockedReason ?? '', p.corsErrorStatus?.corsError ?? '')
      break
    case 'Log.entryAdded':
      console.log(`[${p.entry.level}]`, p.entry.text?.slice(0, 300))
      break
    case 'Runtime.exceptionThrown':
      console.log('[EXCEPTION]', JSON.stringify(p.exceptionDetails).slice(0, 400))
      break
    case 'Runtime.consoleAPICalled':
      console.log(`[console.${p.type}]`, p.args?.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300))
      break
  }
}
await new Promise((r) => (ws.onopen = r))
await send('Network.enable')
await send('Log.enable')
await send('Runtime.enable')
await send('Page.enable')
console.log('— reload —')
await send('Page.reload', { ignoreCache: true })
await new Promise((r) => setTimeout(r, 8000))
const root = await send('Runtime.evaluate', {
  expression: 'document.getElementById("root")?.innerHTML.length ?? -1',
  returnByValue: true
})
console.log('root length après reload:', root.result?.result?.value)
process.exit(0)
