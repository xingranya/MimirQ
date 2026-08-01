# 项目概览

SeeWayK 知识库前端位于 `web/`，使用 Next.js App Router、React、Tailwind、Radix 和 Zustand。根布局负责认证、主题、查询缓存和全局任务/命令 UI；`AppFrame` 与 `Navbar` 负责业务页面外壳。

核心用户路径是：首页 SSE 对话、数据集与知识库管理、入库解析、检索验证、图谱/评测分析和设置。后端已经提供 `/api/v1/chat/stream`，事件保持 `event`、`citations`、`token`、`done`、`error` 兼容。

本次重构保留所有路由、权限、接口和内部 `mimirq` 标识，只改变用户可见品牌、信息架构、视觉层级、流式呈现和路由切换体验。
