/**
 * 日历日期工具的单元测试（纯函数，不用起应用）：
 *   node test/dates.test.mjs
 */
import { dateKey, addDays, sortEvents, upcomingEvents } from '../lib/index.js'

let failed = 0
function check(name, actual, expected) {
  const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v))
  const ok = show(actual) === show(expected)
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    期望 ${show(expected)}\n    实际 ${show(actual)}`}`)
}

// dateKey 用本地时区，别再经过 toISOString（那是 UTC，会差一天）
check('dateKey 本地日期', dateKey(new Date(2026, 9, 3, 23, 30)), '2026-10-03')
check('dateKey 月初补零', dateKey(new Date(2026, 0, 5)), '2026-01-05')

check('addDays 普通', addDays('2026-10-03', 5), '2026-10-08')
check('addDays 跨月', addDays('2026-10-30', 3), '2026-11-02')
check('addDays 跨年', addDays('2026-12-31', 1), '2027-01-01')
check('addDays 往回', addDays('2026-03-01', -1), '2026-02-28')

const events = [
  { id: 'c', date: '2026-10-04', time: '09:00', title: 'c' },
  { id: 'a', date: '2026-10-03', time: '14:00', title: 'a' },
  { id: 'b', date: '2026-10-03', time: null, title: 'b' },
  { id: 'd', date: '2026-10-20', time: '08:00', title: 'd' },
]
check('sortEvents 按日期+时间，无时间的排当天最前', sortEvents(events).map((e) => e.id), ['b', 'a', 'c', 'd'])

check('upcomingEvents 单日', upcomingEvents(events, '2026-10-03', 1).map((e) => e.id), ['b', 'a'])
check('upcomingEvents 含窗口末', upcomingEvents(events, '2026-10-03', 2).map((e) => e.id), ['b', 'a', 'c'])
check('upcomingEvents 排除窗口外', upcomingEvents(events, '2026-10-03', 2).some((e) => e.id === 'd'), false)
check('upcomingEvents 空列表', upcomingEvents([], '2026-10-03', 7).length, 0)

console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
process.exit(failed ? 1 : 0)
