# dsh-calendar-dock 📅

DSH 右侧栏的**通用日历**：月视图点选、当天事件、接下来一览；事件存本地，Agent 也能加/删/勾。

> 这是给 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 右侧栏做的一排日常插件之一。
> 右侧栏本来就是 DSH 的「apps 入口」—— 官方的文件/终端/浏览器和第三方插件走的是**完全同一套机制**。

## 效果

![面板](https://cdn.jsdelivr.net/gh/lemonhall/dsh-calendar-dock@main/docs/screenshot-panel.png)

（截图只裁了右侧栏面板。想换订阅源/分类/时长这些，改配置就行，不用碰代码。）

## 它能干什么

- 月视图（周一开头、今天描边、有事件打点）+ 当天事件列表 + 左下「接下来」
- 回车即加、点方框勾完成、一键删除
- `calendar_panel` 工具：`today` / `upcoming` / `add` / `remove` / `done`
- **日期一律用本地时区的 `YYYY-MM-DD` 字符串**跨进程传，不传 Date 对象（避免时区漂移）

## 装

```
plugin_manager  install_bundle  target=link:E:\development\dsh-calendar-dock
```

或从 npm：

```
dsh plugin --profile <你的 profile> add dsh-calendar-dock
```

装好之后：右侧栏点「**+**」→ 选「**日历**」。

⚠️ **客户端半边改动要重启一次应用**；宿主半边热生效 —— 但**新增宿主路由要重启**（实测，别指望热重载）。

## 它是怎么work的

```
lib/index.js    宿主半：路由 + calendar_panel 工具（Agent 侧读写同一份状态）
lib/state.js    本地状态（原子写：临时文件 + rename，读的人不会撞上写了一半的文件）
lib/client.js   右侧栏 tab（整个模块包在 IIFE 里 —— DSH 把所有客户端插件拼成一个脚本，
                顶层 const 会跨插件撞名，实测撞过一次直接把应用挡在启动之外）
```

**双向通道**：状态存在宿主，客户端 2 秒轮询。所以**你在面板里点一下，Agent 调工具就能读到**；
**Agent 写一次，面板自己会跟着变**。这不是"一个只读的看板"。

## 已知限制

- **不跟系统日历/Google Calendar 同步**，就是一份自己的清单
- 不做重复事件、提醒通知（DSH 里没有系统通知那个口子）
- 时间用本地时区，没有跨时区事件的语义

## License

MIT
