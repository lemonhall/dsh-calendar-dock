/**
 * Host half of dsh-calendar-dock —— 通用日历的宿主半。
 *
 * 纯本地：事件存在 $DSH_HOME/dsh-calendar-dock/state.json，不联网、不需要代理。
 * 日期一律用 **本地时区的 `YYYY-MM-DD` 字符串**（不用 Date 对象跨进程传，避免时区漂移）。
 */

import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createStateStore } from './state.js'

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const DEFAULTS = {
  upcomingDays: 14,
  weekStartsOn: 1, // 1 = 周一
}

const ROUTE_STATE = '/dsh-calendar/state'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const stateStore = createStateStore(join(DSH_HOME, 'dsh-calendar-dock', 'state.json'), {
  events: [], // [{ id, date:'YYYY-MM-DD', time:'HH:MM'|null, title, note, done }]
  selectedDate: null, // 面板里选中的那天
  pendingQuestion: null,
})

function sendJson(res, status, payload) {
  try {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  } catch {
    /* 连接已经断了 */
  }
}

/** 本地时区的 YYYY-MM-DD。 */
export function dateKey(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now())
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 在 YYYY-MM-DD 上加天数（跨月跨年由 Date 自己算）。 */
export function addDays(key, days) {
  const [y, m, d] = String(key).split('-').map(Number)
  const date = new Date(y, (m || 1) - 1, d || 1)
  date.setDate(date.getDate() + Number(days || 0))
  return dateKey(date)
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** 事件按日期+时间排序；没时间的排当天最前。 */
export function sortEvents(events) {
  return [...(events || [])].sort((a, b) => {
    const byDate = String(a.date || '').localeCompare(String(b.date || ''))
    if (byDate !== 0) return byDate
    return String(a.time || '').localeCompare(String(b.time || ''))
  })
}

/** 从 fromKey 起 days 天内的事件（含 fromKey）；完成的默认也算进去，由调用方过滤。 */
export function upcomingEvents(events, fromKey, days) {
  const end = addDays(fromKey, Math.max(0, Number(days) || 14) - 1)
  return sortEvents(events).filter((event) => {
    const key = String(event.date || '')
    return key >= fromKey && key <= end
  })
}

/** Host plugin body. */
function apply(ctx, config) {
  const cfg = config && typeof config === 'object' ? config : {}
  const opts = { ...DEFAULTS, ...cfg }

  ctx.inject(['tools'], (toolScoped) => {
    toolScoped.tools.register({
      name: 'calendar_panel',
      description:
        '读写 DSH 右侧栏「日历」面板里的事件（本地存储，不连云日历）。' +
        'action=today 看今天；action=upcoming 看未来若干天（可给 days）；action=add 加一条（需要 date，格式 YYYY-MM-DD，可选 time=HH:MM、title、note）；' +
        'action=remove 删一条（需要 id）；action=done/undone 勾选完成。' +
        'id 从 today/upcoming 的返回里拿。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['today', 'upcoming', 'add', 'remove', 'done', 'undone', 'state'], description: '要做的动作。' },
          date: { type: 'string', description: 'add：YYYY-MM-DD（本地日期）。' },
          time: { type: 'string', description: 'add：HH:MM，可省。' },
          title: { type: 'string', description: 'add：事件标题。' },
          note: { type: 'string', description: 'add：备注，可省。' },
          id: { type: 'string', description: 'remove/done/undone：事件 id。' },
          days: { type: 'number', description: 'upcoming：往后看几天，默认 14。' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
          additionalProperties: false,
        },
        render(_args, value) {
          return [{ type: 'text', text: String((value && value.text) || '') }]
        },
      },
      presentCall(args) {
        return { card: 'terminal', title: `calendar_panel ${String((args && args.action) || 'today')}`.trim() }
      },
      async execute(args) {
        const action = String((args && args.action) || 'today').toLowerCase()
        const today = dateKey(new Date())

        if (action === 'state') {
          const s = stateStore.get()
          return { text: JSON.stringify({ 事件数: (s.events || []).length, 选中: s.selectedDate, revision: s.revision }, null, 2) }
        }

        if (action === 'today' || action === 'upcoming') {
          const days = action === 'today' ? 1 : Math.min(90, Math.max(1, Number(args.days) || opts.upcomingDays))
          const list = upcomingEvents(stateStore.get().events, today, days)
          if (!list.length) return { text: action === 'today' ? `今天（${today}）没有事件` : `未来 ${days} 天没有事件` }
          return {
            text: list
              .map((event) => `- ${event.date}${event.time ? ` ${event.time}` : ''}  ${event.title}${event.done ? '  [已完成]' : ''}${event.note ? `\n    备注：${event.note}` : ''}\n    id=${event.id}`)
              .join('\n'),
          }
        }

        if (action === 'add') {
          const title = String(args.title || '').trim()
          const date = String(args.date || '').trim() || today
          if (!title) return { text: 'add 需要 title' }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { text: `date 格式要是 YYYY-MM-DD，收到的是「${date}」` }
          const time = String(args.time || '').trim()
          if (time && !/^\d{1,2}:\d{2}$/.test(time)) return { text: `time 格式要是 HH:MM，收到的是「${time}」` }
          const s = stateStore.get()
          const event = { id: newId(), date, time: time || null, title, note: String(args.note || '').trim() || null, done: false }
          const next = stateStore.patch({ events: sortEvents([...(s.events || []), event]) })
          return { text: `已加：${date}${time ? ` ${time}` : ''} ${title}（id=${event.id}，现有 ${next.events.length} 条）` }
        }

        const id = String(args.id || '').trim()
        if (!id) return { text: `${action} 需要 id` }
        const s = stateStore.get()
        const target = (s.events || []).find((event) => event.id === id)
        if (!target) return { text: `找不到 id=${id} 的事件` }
        if (action === 'remove') {
          const next = stateStore.patch({ events: (s.events || []).filter((event) => event.id !== id) })
          return { text: `已删：${target.date} ${target.title}（剩 ${next.events.length} 条）` }
        }
        if (action === 'done' || action === 'undone') {
          const want = action === 'done'
          const next = stateStore.patch({
            events: (s.events || []).map((event) => (event.id === id ? { ...event, done: want } : event)),
          })
          return { text: `${want ? '已勾完成' : '已取消完成'}：${target.title}（剩 ${next.events.filter((event) => !event.done).length} 条未完成）` }
        }
        return { text: `不认识的动作：${action}` }
      },
    })
  })

  ctx.inject(['webServer'], (scoped) => {
    const disposers = []
    disposers.push(
      scoped.webServer.register({
        kind: 'exact',
        path: ROUTE_STATE,
        handler: (req, res) => {
          const method = String((req && req.method) || 'GET').toUpperCase()
          const headers = (req && req.headers) || {}
          if (String(headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
            res.statusCode = 403
            res.end()
            return
          }
          if (method === 'GET' || method === 'HEAD') {
            sendJson(res, 200, { ok: true, today: dateKey(new Date()), weekStartsOn: opts.weekStartsOn, upcomingDays: opts.upcomingDays, state: stateStore.get() })
            return
          }
          if (method === 'POST') {
            let raw = ''
            req.on('data', (chunk) => {
              raw += chunk
              if (raw.length > 1024 * 1024) req.destroy()
            })
            req.on('end', () => {
              let body = {}
              try {
                body = raw.trim() ? JSON.parse(raw) : {}
              } catch {
                sendJson(res, 400, { ok: false, error: '请求体不是 JSON' })
                return
              }
              // events 统一排一次序，减少客户端的分支
              if (Array.isArray(body.events)) body.events = sortEvents(body.events)
              sendJson(res, 200, { ok: true, today: dateKey(new Date()), state: stateStore.patch(body) })
            })
            return
          }
          res.statusCode = 405
          res.end()
        },
      }),
    )

    ctx.on('dispose', () => {
      for (const off of disposers) {
        try {
          off()
        } catch {
          /* already gone */
        }
      }
    })
  })
}

export { apply, ROUTE_STATE, DEFAULTS }
