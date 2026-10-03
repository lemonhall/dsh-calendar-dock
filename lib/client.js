/**
 * Client half of dsh-calendar-dock —— 右侧栏的「日历」tab。
 *
 * 纯 DOM。事件的真相在宿主（lib/state.js），这里 2 秒轮询 —— Agent 用
 * calendar_panel 加了事件，界面自己就出来了。
 *
 * ⚠️ 整个模块包在 IIFE 里：DSH 把所有客户端插件拼成一个脚本加载，顶层 const 会撞名。
 */

;(() => {
const TAB_KIND = 'calendar'
const TAB_ID = 'dsh-calendar-dock:calendar'
const ROUTE_STATE = '/dsh-calendar/state'

window.__ModuleLoader__.load({
  id: 'dsh-calendar-dock',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const C = {
      bg: 'var(--dsw-alias-bg-base)',
      border: 'var(--dsw-alias-border-l1)',
      text: 'var(--dsw-alias-label-primary)',
      dim: 'var(--dsw-alias-label-secondary)',
      accent: 'var(--dsw-alias-brand-primary, #5a7cff)',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    }

    const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

    function pad(n) {
      return String(n).padStart(2, '0')
    }

    function keyOf(year, month, day) {
      return `${year}-${pad(month + 1)}-${pad(day)}`
    }

    /** 该月网格：从周一开头，末尾补齐到整周。 */
    function monthGrid(year, month, weekStartsOn) {
      const first = new Date(year, month, 1)
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const offset = (first.getDay() - weekStartsOn + 7) % 7
      const cells = []
      for (let i = 0; i < offset; i += 1) cells.push(null)
      for (let day = 1; day <= daysInMonth; day += 1) cells.push(day)
      while (cells.length % 7 !== 0) cells.push(null)
      return cells
    }

    function CalendarPanel() {
      const today = React.useMemo(() => {
        const now = new Date()
        return keyOf(now.getFullYear(), now.getMonth(), now.getDate())
      }, [])

      const [events, setEvents] = React.useState([])
      const [weekStartsOn, setWeekStartsOn] = React.useState(1)
      const [selected, setSelected] = React.useState(today)
      const [cursor, setCursor] = React.useState(() => {
        const now = new Date()
        return { year: now.getFullYear(), month: now.getMonth() }
      })
      const [draftTitle, setDraftTitle] = React.useState('')
      const [draftTime, setDraftTime] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const revisionRef = React.useRef(-1)

      const pushState = React.useCallback((patch) => {
        fetch(ROUTE_STATE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        }).catch(() => {})
      }, [])

      const pull = React.useCallback(() => {
        setBusy(true)
        return fetch(ROUTE_STATE)
          .then((response) => response.json())
          .then((payload) => {
            if (!payload || !payload.ok) return
            const state = payload.state || {}
            revisionRef.current = state.revision || 0
            setEvents(state.events || [])
            if (typeof payload.weekStartsOn === 'number') setWeekStartsOn(payload.weekStartsOn)
            if (state.selectedDate) setSelected(state.selectedDate)
          })
          .catch(() => {})
          .finally(() => setBusy(false))
      }, [])

      React.useEffect(() => {
        pull()
        const timer = setInterval(() => {
          fetch(ROUTE_STATE)
            .then((response) => response.json())
            .then((payload) => {
              if (!payload || !payload.ok) return
              const state = payload.state || {}
              if ((state.revision || 0) !== revisionRef.current) {
                revisionRef.current = state.revision || 0
                setEvents(state.events || [])
              }
            })
            .catch(() => {})
        }, 2000)
        return () => clearInterval(timer)
      }, [pull])

      const byDate = React.useMemo(() => {
        const map = {}
        for (const event of events) {
          const key = String(event.date || '')
          if (!map[key]) map[key] = []
          map[key].push(event)
        }
        for (const key of Object.keys(map)) {
          map[key].sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
        }
        return map
      }, [events])

      const addEvent = () => {
        const title = draftTitle.trim()
        if (!title) return
        const event = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          date: selected,
          time: draftTime.trim() || null,
          title,
          note: null,
          done: false,
        }
        const next = [...events, event].sort((a, b) =>
          `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`),
        )
        setEvents(next)
        setDraftTitle('')
        setDraftTime('')
        pushState({ events: next })
      }

      const toggleDone = (event) => {
        const next = events.map((item) => (item.id === event.id ? { ...item, done: !item.done } : item))
        setEvents(next)
        pushState({ events: next })
      }

      const removeEvent = (event) => {
        const next = events.filter((item) => item.id !== event.id)
        setEvents(next)
        pushState({ events: next })
      }

      const pickDay = (day) => {
        if (!day) return
        const key = keyOf(cursor.year, cursor.month, day)
        setSelected(key)
        pushState({ selectedDate: key })
      }

      const shiftMonth = (delta) => {
        setCursor((prev) => {
          const date = new Date(prev.year, prev.month + delta, 1)
          return { year: date.getFullYear(), month: date.getMonth() }
        })
      }

      const cells = monthGrid(cursor.year, cursor.month, weekStartsOn)
      const dayList = byDate[selected] || []
      const upcoming = React.useMemo(
        () =>
          [...events]
            .filter((event) => String(event.date || '') >= today && !event.done)
            .sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`))
            .slice(0, 12),
        [events, today],
      )

      const cellStyle = (isToday, isSelected, hasEvent) => ({
        position: 'relative',
        height: 26,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11.5,
        fontFamily: C.mono,
        cursor: 'pointer',
        color: isSelected ? '#fff' : isToday ? C.accent : C.text,
        background: isSelected ? `color-mix(in srgb, ${C.accent} 65%, transparent)` : 'transparent',
        boxShadow: isToday && !isSelected ? `inset 0 0 0 1px ${C.accent}` : 'none',
        fontWeight: hasEvent ? 600 : 400,
      })

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, color: C.text } },
        // 顶栏
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderBottom: `1px solid ${C.border}`, fontSize: 12 } },
          h('span', { style: { fontWeight: 600 } }, '📅 日历'),
          h(
            'span',
            { style: { marginLeft: 'auto', fontFamily: C.mono, fontSize: 11, color: C.dim } },
            `${cursor.year}-${pad(cursor.month + 1)}`,
          ),
          h('button', { type: 'button', onClick: () => shiftMonth(-1), style: btn() }, '‹'),
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                const now = new Date()
                setCursor({ year: now.getFullYear(), month: now.getMonth() })
                setSelected(today)
                pushState({ selectedDate: today })
              },
              style: { ...btn(), padding: '1px 6px' },
            },
            '今天',
          ),
          h('button', { type: 'button', onClick: () => shiftMonth(1), style: btn() }, '›'),
          h('button', { type: 'button', onClick: pull, title: '刷新', style: btn() }, busy ? '…' : '⟳'),
        ),
        h(
          'div',
          { style: { flex: '1 1 auto', minHeight: 0, display: 'flex' } },
          // 左：月视图
          h(
            'div',
            { style: { width: 246, flex: 'none', borderRight: `1px solid ${C.border}`, padding: '6px 8px' } },
            h(
              'div',
              { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 } },
              WEEKDAYS.map((label) => h('div', { key: label, style: { textAlign: 'center', fontSize: 10, color: C.dim } }, label)),
            ),
            h(
              'div',
              { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 } },
              cells.map((day, index) => {
                const key = day ? keyOf(cursor.year, cursor.month, day) : null
                const has = key ? Boolean(byDate[key]) : false
                return h(
                  'div',
                  { key: index, onClick: () => pickDay(day), style: cellStyle(key === today, key === selected, has) },
                  day || '',
                  has ? h('span', { style: { position: 'absolute', bottom: 2, width: 3, height: 3, borderRadius: 3, background: key === selected ? '#fff' : C.accent } }) : null,
                )
              }),
            ),
            h(
              'div',
              { style: { marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 6 } },
              h('div', { style: { fontSize: 10.5, color: C.dim, marginBottom: 4 } }, '接下来'),
              upcoming.length
                ? upcoming.map((event) =>
                    h(
                      'div',
                      {
                        key: event.id,
                        onClick: () => {
                          setSelected(event.date)
                          const [y, m] = event.date.split('-').map(Number)
                          setCursor({ year: y, month: m - 1 })
                        },
                        style: { display: 'flex', gap: 6, padding: '2px 4px', borderRadius: 5, fontSize: 11, cursor: 'pointer', color: C.dim },
                      },
                      h('span', { style: { fontFamily: C.mono, fontSize: 10, flex: 'none' } }, event.date.slice(5)),
                      h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, event.title),
                    ),
                  )
                : h('div', { style: { fontSize: 11, color: C.dim } }, '（没有未完成的）'),
            ),
          ),
          // 右：当天事件
          h(
            'div',
            { style: { flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' } },
            h(
              'div',
              { style: { padding: '8px 10px 6px', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontFamily: C.mono } },
              selected === today ? `今天 ${selected}` : selected,
              h('span', { style: { marginLeft: 8, fontSize: 10, color: C.dim } }, `${dayList.length} 条`),
            ),
            h(
              'div',
              { style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '4px 6px' } },
              dayList.length
                ? dayList.map((event) =>
                    h(
                      'div',
                      { key: event.id, style: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 6, fontSize: 12 } },
                      h(
                        'span',
                        { onClick: () => toggleDone(event), style: { cursor: 'pointer', color: event.done ? C.dim : C.accent, flex: 'none' } },
                        event.done ? '☑' : '☐',
                      ),
                      event.time ? h('span', { style: { fontFamily: C.mono, fontSize: 10.5, color: C.dim, flex: 'none' } }, event.time) : null,
                      h(
                        'span',
                        {
                          style: {
                            flex: '1 1 auto',
                            textDecoration: event.done ? 'line-through' : 'none',
                            opacity: event.done ? 0.55 : 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          },
                        },
                        event.title,
                      ),
                      h('span', { onClick: () => removeEvent(event), title: '删除', style: { cursor: 'pointer', color: C.dim, flex: 'none' } }, '✕'),
                    ),
                  )
                : h('div', { style: { padding: 10, fontSize: 11.5, color: C.dim } }, '这天没有事件'),
            ),
            // 新建
            h(
              'div',
              { style: { flex: 'none', display: 'flex', gap: 6, padding: '8px 10px', borderTop: `1px solid ${C.border}` } },
              h('input', {
                value: draftTime,
                onChange: (event) => setDraftTime(event.target.value),
                placeholder: 'HH:MM',
                style: { width: 52, flex: 'none', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: C.mono, fontSize: 11, padding: '3px 5px', outline: 'none' },
              }),
              h('input', {
                value: draftTitle,
                onChange: (event) => setDraftTitle(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') addEvent()
                },
                placeholder: '加一件事，回车',
                style: { flex: '1 1 auto', minWidth: 0, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, padding: '3px 6px', outline: 'none' },
              }),
              h('button', { type: 'button', onClick: addEvent, style: { ...btn(), padding: '2px 8px' } }, '加'),
            ),
          ),
        ),
      )
    }

    function btn() {
      return {
        border: `1px solid ${C.border}`,
        background: 'transparent',
        color: C.text,
        borderRadius: 6,
        fontSize: 12,
        padding: '1px 5px',
        cursor: 'pointer',
      }
    }

    function CalendarBody() {
      return h(CalendarPanel)
    }

    function CalendarTitle() {
      return h(
        'span',
        { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
        h('span', { 'aria-hidden': 'true' }, '📅'),
        h('span', null, '日历'),
      )
    }

    const inject = ['slots', 'sidebarRightTabs']

    function apply(ctx) {
      ctx.inject(['sidebarRightTabs'], (scoped) => {
        scoped.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          priority: 'extension',
          title: () => '日历',
          guide: [
            {
              id: TAB_KIND,
              kind: TAB_KIND,
              order: 80,
              title: () => '日历',
              description: () => '月视图 · 当天事件 · 接下来',
              icon: () => h('span', { style: { fontSize: 16 } }, '📅'),
            },
          ],
        })
      })
      ctx.inject(['slots'], (scoped) => {
        scoped.slots.inject('sidebar.right.pane.tab', () =>
          scoped.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, CalendarBody),
        )
        scoped.slots.inject('sidebar.right.pane.tab.title', () =>
          scoped.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, CalendarTitle),
        )
      })
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
})()
