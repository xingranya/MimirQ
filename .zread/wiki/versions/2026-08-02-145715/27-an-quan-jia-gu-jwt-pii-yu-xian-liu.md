本页剖析 MimirQ 的**纵深防御**安全模型：以 **JWT 认证**守住身份边界、以 **PII 脱敏**保护数据出口、以**限流与配额**治理流量与成本。三者分别对应攻击面的「谁可以进」「能带走什么」「能占用多少」，是生产交付验收的核心话题，也是 [API 分层设计与认证鉴权](6-api-fen-ceng-she-ji-yu-ren-zheng-jian-quan) 与 [多租户、RBAC 与文档级 ACL](8-duo-zu-hu-rbac-yu-wen-dang-ji-acl) 的安全底座。

## 1. 安全架构总览：三层纵深防线

MimirQ 的安全加固不是单一组件，而是**按请求生命周期纵向排列的三道防线**：认证发生在请求进入业务路由之前，PII 脱敏贯穿 RAG 引擎的数据进出，限流与配额则同时作用于入口（中间件）与资源消耗点（检索准入、对话生成）。下图展示了三层防线在请求路径上的位置：

```mermaid
flowchart TD
    Client[客户端] -->|Bearer JWT + X-Tenant-ID| MW1[TrustedHost / BodySizeLimit]
    MW1 --> MW2[RateLimitMiddleware<br/>全局 RPS + Chat 专属限流]
    MW2 --> MW3[SecurityHeaders / HeaderSanitizer]
    MW3 --> Dep[get_current_account_id<br/>JWT 验证 + 租户声明校验]
    Dep -->|401 拒绝| Client
    Dep -->|通过| Route[业务路由]
    Route --> Quota[租户 QPS / Token 配额<br/>block 或 warn]
    Route --> RAG[RAG 引擎]
    RAG --> PII[PII 脱敏<br/>before/after model & tool call]
    PII --> Out[响应 / SSE 流]
```

关键设计取向是**「默认安全 + 显式放宽」**：所有加固开关默认关闭或默认从严，生产环境通过启动期校验强制收紧（如 `AUTH_MODE=header` 在生产直接拒绝启动）。中间件栈在 `main.py` 中按「TrustedHost → BodySizeLimit → RateLimit → GZip → Prometheus → ProcessTime → SecurityHeaders → HeaderSanitizer → RequestID」的顺序注册，外层防御先于业务逻辑执行。Sources: [main.py](app/main.py#L462-L560)

## 2. JWT：签发、验证与密钥治理

JWT 子系统由四个模块分工：`jwt_utils.py` 负责**签发**、`jwt_verify.py` 负责**验证**、`jwt_inspect.py` 提供**不验签的只读解析**（用于第三方令牌诊断）、`app/api/dependencies/auth.py` 是 FastAPI 侧的身份解析依赖。签发与验证的算法族解耦——**HS\* 用本地密钥，RS\*/ES\* 用远端 JWKS**，两者可共存于同一配置面。

### 2.1 签发路径

`create_access_token` 构造 `sub`（用户 ID）、`exp`（默认 30 分钟）、`iat` 三个核心声明，并按需注入 `iss`/`aud` 与**租户声明**。租户声明名由 `JWT_TENANT_CLAIM` 配置（如 `tid`），仅当声明存在时才写入令牌——这意味着多租户绑定的能力是显式开启的。登录与引导接口在签发时会把当前租户 ID 写入该声明，使令牌成为**已验证的租户来源**。Sources: [jwt_utils.py](app/core/jwt_utils.py#L35-L61)、[auth.py](app/api/v1/auth.py#L101-L114)

签发侧同样承担密钥卫生约束：`validate_secret_key_and_jwt_key_source` 要求 `SECRET_KEY` 存在、长度 ≥ 32、且不得等于遗留开发密钥 `your-secret-key-change-in-production`；`ALGORITHM` 若为 RS\*/ES\* 则必须配置 JWKS 来源（URL 或 OIDC 发现）。密码存储使用 bcrypt（72 字节上限），验证失败统一返回 `False` 而非抛出异常，避免时序侧信道。Sources: [config_validation.py](app/core/config_validation.py#L449-L481)、[security.py](app/core/security.py#L7-L24)

### 2.2 验证路径：HS 本地密钥与 JWKS 远端密钥

`decode_access_token` 依据算法族分派两条路径。HS 路径按 `SECRET_KEY_FALLBACKS`（逗号分隔、上限 6 个）**逐个尝试签名验证**，支持无中断的密钥轮换；`ExpiredSignatureError` 一旦抛出立即终止尝试（签名已通过，只是过期）。RS\*/ES\* 路径从 `JWT_JWKS_URLS` 拉取 JWKS，按 `kid` 匹配签名密钥，**kid 未命中时强制刷新一次**以容忍 IdP 密钥轮换。两条路径都严格启用 `verify_exp`。Sources: [jwt_verify.py](app/core/jwt_verify.py#L49-L71)、[jwt_verify.py](app/core/jwt_verify.py#L332-L371)

JWKS 与 OIDC 发现均带**双层缓存**：TTL 内直接命中（JWKS 默认 300s、OIDC 默认 3600s）；刷新失败时可在 `JWT_JWKS_MAX_STALE_SEC`（默认 3600s）的「过期窗口」内继续复用旧密钥，超过则 fail-closed。每次请求对同一 URL 的并发拉取由 per-URL `asyncio.Lock` 串行化，避免惊群。值得注意的工程细节是：JWKS 拉取**刻意不复用全局 HTTP 客户端**，防止把内部 `X-Request-ID`/`X-Tenant-ID` 头泄漏给外部 IdP。Sources: [jwt_verify.py](app/core/jwt_verify.py#L218-L281)、[jwt_verify.py](app/core/jwt_verify.py#L144-L215)

### 2.3 HTTPS 强制与启动校验

远端 URL 的传输安全由 `validate_jwt_remote_url` 统一把关：**生产环境强制 https**，仅非生产环境对 loopback/localhost 放行 http；同时禁止 URL 携带 userinfo。该函数同时作用于 `JWT_ISSUER`、`JWT_JWKS_URLS` 和 OIDC 发现响应链——后者通过 `_validate_response_url_chain` 校验**重定向链上每一个响应 URL**，防止 http→https 降级攻击。Sources: [config.py](app/core/config.py#L106-L135)、[jwt_verify.py](app/core/jwt_verify.py#L32-L47)

启动校验矩阵（`config_validation.py`）是生产安全的第一道闸门：

| 校验项 | 生产环境要求 | 违规后果 |
|---|---|---|
| `AUTH_MODE` | 仅允许 `jwt`，`header` 直接拒绝 | 启动失败 |
| `SECRET_KEY` | 非空、≥32 字符、非遗留开发密钥 | 启动失败 |
| 租户来源 | 必须配置 `JWT_TENANT_CLAIM`，或显式 `TENANT_HEADER_TRUSTED=true` | 启动失败 |
| JWKS 地址 | https（非 loopback 时） | 启动失败 |
| `ALLOWED_HOSTS` | 必填、不得含 `*` | 启动失败 |
| `CORS_ORIGINS` | 必填、不得含 `*`/`null`/localhost、默认禁 credentials | 启动失败 |

Sources: [config_validation.py](app/core/config_validation.py#L79-L139)、[config_validation.py](app/core/config_validation.py#L141-L183)

### 2.4 多租户绑定与防跨租户

认证依赖在 JWT 模式下的解析流程是：提取 Bearer 令牌 → 解码校验 → 读取 `sub` 与租户声明 → **可选强制租户头匹配** → 注入 `request.state` 与日志上下文 →（可选）异步执行组同步/成员自动开通。`JWT_ENFORCE_TENANT_HEADER_MATCH=true` 时，请求头 `X-Tenant-ID` 必须与令牌内租户声明一致，否则 401——这是对抗**跨租户头欺骗**的关键开关；默认关闭以保持后向兼容，但生产推荐开启。令牌解析结果缓存在 `request.state._jwt_payload`，同一请求内多个依赖共用一次验签。Sources: [auth.py](app/api/dependencies/auth.py#L63-L105)、[auth.py](app/api/dependencies/auth.py#L172-L211)

### 2.5 企业扩展：组同步与成员自动开通

面向企业目录场景，JWT 还承载两个可插拔的扩展：`JWT_GROUPS_SYNC_ENABLED` 从声明（支持 `realm_access.roles` 这类点分路径）提取组名并幂等 upsert 租户组与成员关系，`JWT_GROUPS_MAX_GROUPS`（默认 200）限制单请求处理量，`JWT_GROUPS_SYNC_TTL_SEC`（默认 60s）用进程内节流避免写放大；`JWT_TENANT_MEMBER_AUTO_PROVISION_ENABLED` 则在验证通过后为 JWT 用户自动开通租户成员。两者的共同原则是**永不阻塞认证**——同步失败仅记 debug 日志。这与 [多租户、RBAC 与文档级 ACL](8-duo-zu-hu-rbac-yu-wen-dang-ji-acl) 中的组权限模型直接衔接。Sources: [jwt_group_sync_service.py](app/services/jwt_group_sync_service.py#L107-L180)、[auth.py](app/api/dependencies/auth.py#L119-L133)

## 3. PII 脱敏：从检测到 Fail-Closed

PII 子系统分为三层：**核心引擎**（`app/core/pii_redaction.py`，零依赖、刻意放在 `app.core` 下避免被内部 try-import 绕过）、**RAG 中间件钩子**（`app/rag/middleware/pii.py`）、**管线内联调用点**（LangGraph 与引擎代码）。总开关 `PII_REDACTION_ENABLED` 默认关闭，掩码 `PII_REDACTION_MASK` 默认 `[REDACTED]`。Sources: [pii_redaction.py](app/core/pii_redaction.py#L1-L6)、[config.py](app/core/config.py#L2399-L2402)

### 3.1 检测模式

`PIIRedactor.redact_text` 按固定顺序扫描六类模式，并返回命中统计（`meta.hits`）供可观测性使用：

| 模式 | 正则要点 | 典型样例 |
|---|---|---|
| Key/Value 秘密 | `api_key|secret\|token\|bearer` + `:`/`=` + 8+ 字符值，**保留键名、掩码值** | `api_key=sk-abc…` → `api_key=[REDACTED]` |
| OpenAI 密钥 | `sk-` + 20+ 字母数字 | `sk-xxxxxxxx…` |
| AWS 访问密钥 | `AKIA` + 16 位大写字母数字 | `AKIAIOSFODNN7EXAMPLE` |
| 邮箱 | 字符类边界（容忍 CJK 邻接） | `user@example.com` |
| 中国手机号 | 数字边界 `1[3-9]\d{9}` | 中文文本中的 `13800138000` |
| 中国身份证 | 17 位数字 + 数字/X | `110101…` |
| 信用卡候选 | 13–19 位数字（允许空格/连字符），**Luhn 校验通过才掩码** | `4111 1111 1111 1111` |

Sources: [pii_redaction.py](app/core/pii_redaction.py#L22-L35)、[pii_redaction.py](app/core/pii_redaction.py#L78-L106)

### 3.2 CJK 感知正则与 Luhn 校验

代码注释中明确记录了两个「踩坑后的修正」：**`\b` 在中文字符与 ASCII 邮箱局部名之间不成立**，故邮箱正则改用字符类前后视断言；**`\b` 在中文与数字之间同样失效**（Unicode 下都是 `\w`），手机号/身份证正则改用 `(?<!\d)…(?!\d)` 数字边界——否则「电话13800138000」这类中文邻接文本会静默漏脱敏。信用卡候选先做形态匹配，再以 **Luhn 算法**验证校验位，显著降低普通数字串的误伤。Sources: [pii_redaction.py](app/core/pii_redaction.py#L20-L35)、[pii_redaction.py](app/core/pii_redaction.py#L47-L60)

### 3.3 Fail-Closed：宁可掩码不可泄漏

脱敏失败策略是**fail-closed**：启用状态下若正则执行抛异常，`redact_text` 直接返回整段掩码、`redact_obj` 递归掩码所有字符串叶子，并记录异常日志。这与限流侧的 fail-open 形成鲜明对比——**数据保护宁可过度遮掩，可用性保护宁可放行**。`redact_obj` 递归遍历 dict/list/tuple，容器结构保留、字符串内容替换。Sources: [pii_redaction.py](app/core/pii_redaction.py#L121-L165)

### 3.4 RAG 管线集成点

PII 中间件通过 `before_tool_call`/`after_tool_call`/`before_model`/`after_model` 四个钩子挂进 RAG 执行链：工具调用的 `arguments` 与 `result` 在进出时脱敏，模型输入（`question`/`history`/`context`/`system_prompt`）与输出（`answer`/`response`/`output`）在两侧脱敏。LangGraph 生成节点则在内联代码中完成同等工作——上下文、历史、问题在拼装 prompt **之前**脱敏，生成的答案在返回**之前**再脱敏一次，证据文本（claim check 用）同样走 `redact_text`。工具日志中间件对预览字段应用同一套脱敏，避免 PII 进入日志落盘。Sources: [pii.py](app/rag/middleware/pii.py#L65-L109)、[langgraph.py](app/rag/pipelines/langgraph.py#L577-L600)、[tool_logging.py](app/rag/middleware/tool_logging.py#L77-L78)

```mermaid
flowchart LR
    subgraph 输入侧
        Q[question / query]
        H[history]
        C[context / evidence]
    end
    Q --> R1[redact_text]
    H --> R1
    C --> R1
    R1 --> M[LLM / 检索]
    M --> A[answer]
    A --> R2[redact_text]
    R2 --> Out[响应]
    subgraph 工具侧
        T1[before_tool_call<br/>arguments 脱敏]
        T2[after_tool_call<br/>result/error 脱敏]
    end
```

Sources: [langgraph.py](app/rag/pipelines/langgraph.py#L582-L600)、[pii.py](app/rag/middleware/pii.py#L84-L109)

### 3.5 其他脱敏面

除聊天管线外，还有两处互补的脱敏工具：`security_redaction.py` 面向 **API 响应安全**——`redact_sql_literals` 掩码 SQL 字符串字面量与长数字（保留查询结构），`redact_connection_info` 按字段黑名单（host/dsn/jdbc_url/username 等）掩码连接器配置中的凭据；`GOVERNANCE_PII_ANONYMIZE` 则在治理画像层面提供独立于全局开关的匿名化模式。三层机制覆盖「模型 I/O → 日志 → API 响应 → 治理配置」的完整数据出口。Sources: [security_redaction.py](app/services/security_redaction.py#L29-L57)、[config.py](app/core/config.py#L1894)

## 4. 限流与配额：从令牌桶到成本治理

限流体系按「**入口频率 → 租户公平性 → 成本治理 → 资源准入**」四个层次组织，每一层回答不同问题：全局中间件防止单点打爆、租户 QPS 保证多租户公平、Token/存储配额控制账单、RAG 准入保护共享检索后端。完整配置目录见 `docs/deployment/quota_rate_limit.md`。

### 4.1 Token Bucket：内存实现与 Redis 原子脚本

核心算法是**令牌桶**，双实现共享同一语义。内存版 `RateLimiter` 用 `threading.Lock` 保护每桶状态，基于 `time.monotonic()` 计算补漏（避免时钟跳变影响速率），并按「桶满 + 久未使用」定期清理防止内存泄漏。Redis 版 `RedisRateLimiter` 将桶状态放入哈希键，用一段 **Lua 脚本**（`HMGET` 读取 → 补漏 → 扣减 → `HMSET` + `EXPIRE`）实现**读改写原子性**，使多进程/多 Pod 共享同一限流状态；Redis 不可用时**fail-open 放行**，并把单次故障告警抑制到 60 秒一次。Sources: [rate_limit.py](app/api/middleware/rate_limit.py#L29-L56)、[rate_limit.py](app/api/middleware/rate_limit.py#L107-L144)、[rate_limit.py](app/api/middleware/rate_limit.py#L195-L227)

### 4.2 中间件注册与 key 策略

`RateLimitMiddleware` 在 `main.py` 中注册，支持**全局桶 + chat 专属桶**双档位：chat 前缀（`/api/v1/chat/stream`）走更严的 `RATE_LIMIT_CHAT_RPS`（默认 2.0）/ `RATE_LIMIT_CHAT_BURST`（默认 5），其余 API 走 `RATE_LIMIT_REQUESTS_PER_SECOND`（默认 10.0）/ 突发 20。健康检查、文档页与图片资产端点被显式排除，避免浏览器批量渲染图片时误触限流。

限流 key 的解析顺序体现了**防欺骗优先级**：JWT 模式下优先用已验证的 `sub`（忽略客户端 `X-User-ID`，防止伪造限流 key），其次租户 ID + IP。key 形态为 `tenant:{tid}:user:{uid}` 或 `tenant:{tid}:ip:{ip}`。Sources: [rate_limit.py](app/api/middleware/rate_limit.py#L295-L317)、[rate_limit.py](app/api/middleware/rate_limit.py#L368-L402)、[main.py](app/main.py#L477-L488)

### 4.3 429 响应形状

超限响应统一为 **HTTP 429 + `Retry-After` 头 + 结构化 body**，`scope` 用于区分限流来源：

| scope | 触发点 |
|---|---|
| `rate_limit:api` | 全局令牌桶（非 chat 路径） |
| `rate_limit:chat` | chat 流式路径专属桶 |
| `tenant_qps:chat` / `tenant_qps:retrieval` | 租户 QPS 配额 |
| `chat_tokens` | assistant token 滚动窗口配额 |
| `tenant_documents` / `tenant_storage` | 上传数量/容量配额 |

客户端应优先按 `Retry-After` 退避，并将 `scope` 写入日志/监控以定位限流类别。Sources: [rate_limit.py](app/api/middleware/rate_limit.py#L419-L442)、[quota_rate_limit.md](docs/deployment/quota_rate_limit.md#L116-L128)

### 4.4 租户级 QPS 配额

与全局中间件（按用户/IP 计数）正交，`TENANT_QPS_QUOTA_*` 按 **tenant_id + scope key** 聚合计数，保护多租户场景下的共享检索后端。`block`/`warn` 双模式：`block` 超限抛 429，`warn` 只返回元数据供指标采集。它复用令牌桶实现——Redis 开启时自动升级为分布式计数，且在生产多 worker 场景下**强制要求 Redis**（启动校验会拒绝 `UVICORN_WORKERS > 1` 却未启用分布式限流的配置）。chat 与 retrieval 入口在异步路径上调用 `enforce_tenant_qps_quota_async` 执行强制。Sources: [tenant_quota_service.py](app/services/tenant_quota_service.py#L107-L183)、[config_validation.py](app/core/config_validation.py#L40-L67)、[chat.py](app/api/v1/chat.py#L211-L213)、[rag.py](app/api/v1/rag.py#L452-L454)

### 4.5 成本治理配额

成本类配额采用「**滚动窗口 + 单条聚合查询**」设计，均为 best-effort：`CHAT_ASSISTANT_TOKEN_QUOTA_*` 在窗口（默认 24h）内对 `Message.token_count` 求和，超限按 `block`/`warn` 处理；`TENANT_DOC_QUOTA_*` 与 `TENANT_STORAGE_QUOTA_*` 保护上传入口；`TENANT_EMBED_CHAR_QUOTA_*` 用字符数近似向量化工作量。共同原则是 **fail-open**——DB 聚合失败时关闭强制，避免把依赖故障扩大成全站不可用。Sources: [quota_service.py](app/services/quota_service.py#L19-L59)、[tenant_quota.py](app/services/tenant_quota.py#L5-L34)、[quota_rate_limit.md](docs/deployment/quota_rate_limit.md#L66-L113)

### 4.6 RAG 运行时准入控制

最内层是**资源准入**而非频率限制：`rag_runtime_limiter.py` 为检索卸载（offload）提供进程内 `BoundedSemaphore` 门闩 + **Redis 分布式租约**（按槽位 `ragadm:1..N` 抢占，带 TTL 与心跳续约线程），限制 `RAG_RETRIEVAL_OFFLOAD_MAX_CONCURRENCY` 级别的并发检索调用；另有后端向量分片预算门闩（`RAG_VECTOR_SHARD_GLOBAL_MAX_CONCURRENCY`）。超时抛 `RetrievalAdmissionTimeoutError`（429 语义），取消则抛 `RetrievalAdmissionCancelledError`。Redis 故障时降级为本地门闩并告警。Sources: [rag_runtime_limiter.py](app/services/rag_runtime_limiter.py#L58-L100)、[rag_runtime_limiter.py](app/services/rag_runtime_limiter.py#L116-L177)、[rag_runtime_limiter.py](app/services/rag_runtime_limiter.py#L317-L372)

## 5. 配套安全中间件

除三大主题外，请求路径上还有一组轻量加固：`SecurityHeadersMiddleware` 注入 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy`，并可按配置追加 HSTS（`max-age` + `includeSubDomains` + `preload`）、Permissions-Policy、COOP/CORP；`ResponseHeaderSanitizerMiddleware` 剥离 `Server`/`X-Powered-By` 等指纹头；`BodySizeLimitMiddleware` 作为 DoS 护栏限制请求体；生产环境默认启用 `TrustedHostMiddleware` 校验 Host 头。这些组件共同压缩了信息泄漏与放大攻击面。Sources: [security_headers.py](app/api/middleware/security_headers.py#L18-L59)、[response_header_sanitizer.py](app/api/middleware/response_header_sanitizer.py#L18-L48)、[main.py](app/main.py#L462-L475)

## 6. 总结：纵深防御的权衡

MimirQ 的安全加固呈现出一以贯之的**风险分层与失败模式选择**：认证层 fail-closed（验签失败即 401）、PII 层 fail-closed（宁可整段掩码）、限流层 fail-open（Redis 挂掉放行保可用）、配额层 fail-open（DB 查询失败不阻断核心流程）。这种「按损失方向选择失败策略」的工程判断，是安全加固中最值得复用的设计模式。生产部署时请对照 `.env.example` 的注释逐项核对 `AUTH_MODE=jwt`、`SECRET_KEY`、`JWT_TENANT_CLAIM`、`RATE_LIMIT_REDIS_ENABLED` 与 `PII_REDACTION_ENABLED`。Sources: [.env.example](.env.example#L230-L296)、[.env.example](.env.example#L1992-L1998)

进一步阅读：[API 分层设计与认证鉴权](6-api-fen-ceng-she-ji-yu-ren-zheng-jian-quan)、[多租户、RBAC 与文档级 ACL](8-duo-zu-hu-rbac-yu-wen-dang-ji-acl)、[可观测性：指标、追踪与日志](26-ke-guan-ce-xing-zhi-biao-zhui-zong-yu-ri-zhi)、[部署运维：Docker Compose 与 Helm](28-bu-shu-yun-wei-docker-compose-yu-helm)。