# 模块清单

| 模块 | 入口 | 主要文件 | 本轮动作 |
| --- | --- | --- | --- |
| 应用壳层 | 所有业务页 | `web/components/app-frame.tsx`、`web/app/layout.tsx` | 稳定滚动边界和侧栏挂载 |
| 侧栏 | 所有业务页 | `web/components/navbar.tsx` | 四组信息架构、品牌、状态和底部菜单 |
| 首页对话 | `/` | `web/components/chat-area.tsx`、`web/components/chat/message-item.tsx` | 收敛首屏、抽屉化高级设置、增量显示 |
| SSE | `/api/v1/chat/stream` | `web/lib/api/chat.ts`、`web/lib/sse-reader.ts`、`web/hooks/use-chat-stream.ts` | 记录事件时序并修复前端缓冲 |
| 设置 | `/settings` | `web/app/settings/page.tsx`、`_sections/*` | 五组任务 IA、搜索、折叠和固定保存栏 |
| 知识工作台 | `/knowledge` | `web/components/knowledge/*` | 迁移共享 token，减少装饰和重叠 |

