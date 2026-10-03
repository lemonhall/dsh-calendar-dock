# 我给 DSH 的右侧栏做了个日历

📅 **通用日历** —— DSH 右侧栏的一个新 tab。

## 为什么做这个

我需要知道今天还有什么事，而不是打开一个日历应用去找今天在哪一格。

## 长什么样

![通用日历](https://cdn.jsdelivr.net/gh/lemonhall/dsh-calendar-dock@main/docs/screenshot-panel.png)

（图只截了右侧栏面板。我这台机器桌面左下角有真名，所以截图从来不整屏。）

## 它能干什么

- 月视图（周一开头、今天描边、有事件打点）+ 当天事件列表 + 左下「接下来」
- 回车即加、点方框勾完成、一键删除
- `calendar_panel` 工具：`today` / `upcoming` / `add` / `remove` / `done`
- **日期一律用本地时区的 `YYYY-MM-DD` 字符串**跨进程传，不传 Date 对象（避免时区漂移）

## 一个值得说的设计决定

**日期一律用本地时区的 `YYYY-MM-DD` 字符串跨进程传，绝不传 Date 对象。** 跨进程传时间戳是时区漂移的经典来源：宿主在东八区算出来的今天，序列化一圈回来可能就成了昨天。字符串没有这个问题，而且人眼可读、日志里一眼看得懂。

## 双向的，不只看

这是这批插件的共同点：**状态在宿主、界面 2 秒轮询**。所以我在面板里点一下，Agent 调工具就能读到；Agent 写一次（比如「帮我记一笔午饭 12.5」），面板自己就变了。

装：

```
# 先装 DSH（桌面版从 https://harness.deepseek.com 下载安装包；只要 CLI 的话）：
npm i -g @deepseek-ai/dsh

# 再装这个插件（桌面版也可以走 GUI：右侧栏「插件 → 添加插件」）
dsh plugin --profile desktop add dsh-calendar-dock

# 如果你是开发者、想用本地目录直接挂：
plugin_manager install_bundle target=link:E:\development\dsh-calendar-dock
```

代码在 <https://github.com/lemonhall/dsh-calendar-dock>，npm 上是 `dsh-calendar-dock`。右侧栏点「**+**」→ 选「通用日历」就能看到它。

## 已知限制

- **不跟系统日历/Google Calendar 同步**，就是一份自己的清单
- 不做重复事件、提醒通知（DSH 里没有系统通知那个口子）
- 时间用本地时区，没有跨时区事件的语义
