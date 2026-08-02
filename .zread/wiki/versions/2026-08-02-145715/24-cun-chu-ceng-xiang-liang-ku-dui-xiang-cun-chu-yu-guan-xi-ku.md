MimirQ 的存储层并非单一数据库，而是一套按职责分工的多存储体系：**PostgreSQL 关系库**承载全部业务元数据与状态机，**Milvus 向量库**承载文档块与知识图谱的向量索引，**MinIO（S3 兼容）对象存储**承载图片与文档源文件，另有 **Redis** 承担任务队列、限流与语义缓存等辅助职责。本章逐一拆解各存储组件的内部结构、选型逻辑与协作方式，并给出可落地的配置对照。

Sources: [docker-compose.infra.yml](docker/docker-compose.infra.yml#L1-L102)

## 存储层的总体架构

从部署拓扑看，后端进程与五个基础设施服务协同工作：Postgres 15 提供 ACID 关系存储，Redis 7 提供分布式协调，Etcd 保存 Milvus 的元数据与集合 Schema，MinIO 既作为 Milvus 的底层对象存储、又作为应用层图片/文档源文件的存储桶，Milvus Standalone 提供 gRPC 向量检索服务。

```mermaid
graph TB
    subgraph Backend["MimirQ 后端进程"]
        API["API / Worker"]
        DB["SQLAlchemy ORM<br/>app.core.database_singleton"]
        VS["向量存储路由<br/>app.storage.vector.factory"]
        OS["对象存储工厂<br/>app.storage.object.factory"]
        RC["LazyRedisClient<br/>app.core.redis_client"]
    end

    subgraph Infra["基础设施服务（docker-compose.infra.yml）"]
        PG[("PostgreSQL 15<br/>:5432")]
        RD[("Redis 7<br/>:6379")]
        MC[("Milvus 2.6.11<br/>:19530")]
        ETCD[("Etcd 3.5.5<br/>:2379")]
        MO[("MinIO<br/>:9000 / :9001")]
    end

    API --> DB
    API --> VS
    API --> OS
    API --> RC

    DB --> PG
    VS --> MC
    VS -->|"语义缓存（可选）"| MC
    VS -->|"本地后端 memory/faiss/chroma"| API
    OS --> MO
    RC --> RD
    MC --> ETCD
    MC --> MO
```

各存储组件在数据链路中的角色可以归纳为：**关系库回答「有哪些数据、状态如何」**，**向量库回答「哪些内容在语义上最接近」**，**对象存储回答「原始文件与图片在哪」**。三者的协作以 `document_id`、`chunk_id`、`img_id` 为纽带，在索引构建与检索路径中频繁交叉引用。

Sources: [docker/docker-compose.infra.yml](docker/docker-compose.infra.yml#L3-L102)

## 向量库：多后端路由与 Milvus 实现

### 后端选择机制

向量存储的入口是 `app/storage/vector/factory.py`，它定义了统一的 `BaseVectorStore` 接口（`add_documents` / `search` / `delete_by_document_id` / `delete_by_document_id_and_filter` / `get_embedding_client`），并通过 `VECTOR_BACKEND` 环境变量在六个后端之间路由：`milvus`（默认）、`memory`、`faiss`、`chroma`、`qdrant`、`pgvector`。

```python
backend_name, region_key = _resolve_vector_backend(backend=backend, region=region)
cache_key = _vector_store_cache_key(backend_name=backend_name, region_key=region_key)
# ...
if backend_name == "milvus":
    store: BaseVectorStore = MilvusVectorStore()
elif backend_name == "memory":
    store = MemoryVectorStore()
# ...
```

Sources: [app/storage/vector/factory.py](app/storage/vector/factory.py#L908-L936)

值得注意的三个设计点：

1. **单例缓存**：`get_vector_store()` 以 `(region, backend, embedding 配置哈希)` 为键缓存 store 实例。`memory`/`faiss` 等进程内后端靠单例避免数据在每次调用间丢失，因此缓存键对 embedding 客户端配置敏感——provider、model、api_base、api_key 哈希、维度任一变化都会生成新的 store 实例（`_embedding_client_cache_token`）。
2. **区域路由**：`VECTOR_REGION_BACKENDS` 允许按 `DATA_REGION` 为不同区域指定不同后端，实现多区域隔离部署。
3. **候选窗口扩展**：当元数据后过滤（post-filtering）剔除过多命中时，`search` 会循环扩大 `requested_k` 并重新检索，直到满足 `top_k` 或耗尽候选；每次 refill 之间 `time.sleep(0.001)` 让等待中的写入者有机会获取租户锁，避免长临界区饿死同租户写入。

Sources: [app/storage/vector/factory.py](app/storage/vector/factory.py#L142-L184)、[app/storage/vector/factory.py](app/storage/vector/factory.py#L875-L900)

### Milvus 单例模式：文档向量

`MilvusVectorStore` 采用双重检查锁的单例模式，服务于知识库文档块向量，使用固定集合名（`MILVUS_COLLECTION_NAME`，默认 `documents`）。其写入路径值得拆解：

- **稳定主键**：优先使用 `chunk_id`（UUID 字符串）作为向量主键，避免重索引时发生主键碰撞；无 chunk_id 时退化为 `{document_id}_{chunk_index}`。
- **元数据规范化**：写入前将元数据截断到 Milvus VARCHAR 上限（65,535 字节），`pipeline_hash` 截断到 64 字符、`doc_pipeline_key` 截断到 256 字符——这两个字段构成版本化回滚的稳定复合键。
- **自适应批大小**：默认批大小 256，但当单块超长时按 `VECTOR_WRITE_BATCH_MAX_CHARS`（默认 200,000 字符）预算自动收缩批大小，避免单次插入超限。
- **兼容回退**：旧集合缺少 `indexed_meta_*` 插槽字段时，首次写入失败会告警并去除这些可选字段重试，同时通过 Prometheus 计数器记录回退事件（`vector_milvus_write_compat_fallback_total`）。

Sources: [app/storage/vector/milvus.py](app/storage/vector/milvus.py#L1022-L1244)

检索路径的核心是**过滤条件下推（expr pushdown）+ 客户端后过滤兜底**：

1. 构建基础表达式：`tenant_id == "..."` 恒为第一条件；`document_id in [...]` 受 `MILVUS_EXPR_MAX_DOC_IDS`（默认 200）限制，超限时跳过下推、交由调用方后过滤。
2. 元数据过滤条件被翻译为 Milvus 布尔表达式（支持 `$eq/$ne/$gt/$gte/$lt/$lte/$in/$nin`），并限制在安全字段白名单 `_MILVUS_ALLOWED_FILTER_FIELDS` 内（如 `chunk_index`、`page_number`、`dataset_id`、`embedding_space_hash` 等）。
3. 若表达式下推失败（旧集合或语法不支持），回退为仅按基础表达式检索，再在客户端用 `match_metadata_filter` 做精确过滤，同时记录 `vector_milvus_search_expr_fallback_total` 指标。

Milvus 的索引配置集中在 `app/core/constants.py` 的 `MilvusConfig`：`COSINE` 度量 + `IVF_FLAT` 索引 + `nlist=1024`，检索参数 `nprobe=10`。Schema 由 LangChain Milvus 适配器自动创建，字段包括主键 `id`、文本 `content`、向量 `embedding` 及 `tenant_id`/`dataset_id`/`document_id`/`chunk_index`/`chunk_id`/`page_number`/`source`/`file_type`/`img_id`/`image_id`/`image_url`/`pipeline_hash`/`doc_pipeline_key`/`embedding_space_hash` 等标量字段，外加 16 组 `indexed_meta_XX_key/value` 插槽用于自定义过滤字段的扁平化存储。

Sources: [app/core/constants.py](app/core/constants.py#L115-L144)、[app/storage/vector/milvus.py](app/storage/vector/milvus.py#L42-L89)

### Milvus 多实例模式：KG 实体/事件与语义缓存

与文档向量的固定集合单例不同，`MilvusAdapter` 是支持任意自定义集合的通用适配器，按 `(collection_name, vector_field, text_field)` 缓存。它服务于三类场景：

- **知识图谱实体/事件**：`kg_entities` 与 `kg_events` 两个集合分别承载实体和事件的向量，供图谱检索与最短路径溯源使用；
- **图像嵌入索引**：`image_embedding_index` 集合承载文档图片的嵌入向量，支持图文混合检索；
- **语义缓存**：`semantic_cache` 集合（可经 `SEMANTIC_CACHE_COLLECTION_NAME` 覆盖）存储查询向量，命中后从 Redis 取回完整载荷。

`MilvusAdapter.add_vectors` 支持直接写入预计算嵌入（`embeddings` 参数），避免对已嵌入内容重复调用 embedding 模型；`upsert=True` 时走 Milvus upsert 语义，并自动剥离主键/文本/向量等保留字段后再写入元数据。

Sources: [app/storage/vector/milvus.py](app/storage/vector/milvus.py#L625-L760)、[app/rag/kg/repository.py](app/rag/kg/repository.py#L462-L463)、[app/services/semantic_cache.py](app/services/semantic_cache.py#L75-L76)

### 本地开发后端：memory / faiss / chroma / qdrant / pgvector

除 Milvus 外，其余后端均定位为本地开发或单节点场景：

| 后端 | 实现方式 | 持久化 | 适用场景 |
|------|----------|--------|----------|
| `memory` | 进程内列表 + 余弦相似度 | 无 | 单元测试、无向量库的快速验证 |
| `faiss` | LangChain FAISS，按租户分索引 | `FAISS_STORE_PATH`（需 `FAISS_ALLOW_DANGEROUS_DESERIALIZATION=true` 才加载） | 单节点开发，可选磁盘持久化 |
| `chroma` | LangChain Chroma，按租户分集合 | `CHROMA_PERSIST_PATH` | 本地开发，自动持久化 |
| `qdrant` | 进程内脚手架（非真实 qdrant-client） | 无 | 接口占位 |
| `pgvector` | 复用 Qdrant 脚手架接口 | 无 | 接口占位 |

`memory`/`faiss`/`chroma`/`qdrant`/`pgvector` 均被标记为 embedding 感知后端，缓存键中追加 embedding 配置哈希；`faiss`/`chroma` 的元数据过滤遵循与 Milvus 相同的 `match_metadata_filter` 语义，且 chroma 后端通过 `__mimirq_json_v1__:` / `__mimirq_string_v1__:` 前缀编解码复杂元数据，避免 Chroma 标量类型限制导致信息丢失。需要说明的是，`qdrant` 与 `pgvector` 目前只是确定性进程内脚手架，生产级接入仍以 Milvus 为唯一完整实现。

Sources: [app/storage/vector/factory.py](app/storage/vector/factory.py#L298-L418)、[app/storage/vector/factory.py](app/storage/vector/factory.py#L421-L839)、[app/storage/vector/qdrant.py](app/storage/vector/qdrant.py#L12-L126)、[app/storage/vector/pgvector.py](app/storage/vector/pgvector.py#L5-L7)

## 对象存储：MinIO 与 S3 兼容体系

对象存储层位于 `app/storage/object/`，核心类是 `MinIOService`（707 行），提供两类核心载荷的存取：**解析图片**与**文档源文件**。

### 图片存储与预签名访问

解析流水线在切块阶段检测 chunk metadata 中的图片数据（base64），生成 `img_id = "{tenant_id}:{dataset_id}:{document_id}:{chunk_index}"`，上传到 `images/{tenant_id}/{dataset_id}/{document_id}/{chunk_index}.jpg` 路径后删除内存中的 base64（节省资源），并在 metadata 中保留 `img_id` 建立图片与文本块的关联。读取侧通过 `get_image_url` 生成 7 天有效的预签名 URL，经由 `/api/v1/documents/image-url/{img_id}` 接口 302 重定向访问，避免公开桶泄露。批量上传用 `asyncio.Semaphore(10)` 控制并发，并逐对象记录成功/失败指标。

Sources: [app/storage/object/minio.py](app/storage/object/minio.py#L200-L336)、[docs/minio_integration.md](docs/minio_integration.md#L72-L100)

### 文档源文件存储

企业级/多实例部署可通过 `MINIO_DOCUMENTS_ENABLED=true` 或通用 `OBJECT_STORAGE_DOCUMENTS_ENABLED=true` 开启文档源文件入库。上传路径为 `documents/{tenant_id}/{dataset_id}/{document_id}{ext}`，返回 `minio://` URI 并写入 `documents.file_path` 字段；未启用时 `file_path` 退化为本地路径。`_store_document_source` 将同步 SDK 调用放入线程池执行，失败时清理已落地的临时上传文件。

Sources: [app/storage/object/minio.py](app/storage/object/minio.py#L457-L508)、[app/api/v1/document_upload.py](app/api/v1/document_upload.py#L165-L189)

### URI 协议与安全校验

`app/storage/object/runtime.py` 定义了完整的对象 URI 语义：`minio://bucket/object`、`s3://`、`s3_compatible://`（归一为 `s3compat`）、`oss://`、`cos://`。读取文档源文件时执行三层校验：

1. **提供商标识校验**：URI 中的 provider 必须与文档元数据中记录的 `source_storage_provider` 一致，否则抛 `object_provider_denied`；
2. **桶校验**：URI 的 bucket 必须等于该 store 配置的 bucket，否则抛 `object_bucket_denied`；
3. **对象键校验**：对象键必须精确匹配 `build_document_object_name` 生成的规范路径，否则抛 `object_key_denied`——这防止了任意路径穿越。

区域路由方面，`OBJECT_STORAGE_REGION_PROFILES`（JSON）可为每个 `DATA_REGION` 配置独立 provider/endpoint/凭据/桶；`_resolve_stored_object_region` 会先从文档元数据取回已记录的 region，再从 profile 反向匹配 provider+bucket，多区域命中时抛 `object_region_ambiguous` 拒绝歧义。

Sources: [app/storage/object/runtime.py](app/storage/object/runtime.py#L11-L120)、[app/storage/object/runtime.py](app/storage/object/runtime.py#L154-L180)

### 工厂与区域配置

`app/storage/object/factory.py` 的 `get_object_store()` 是统一入口：无 region 且 provider 为 minio 时走 `prefer_legacy_minio` 快速路径返回全局 `minio_service` 单例；其余情况按配置键（provider/region/endpoint/凭据/桶/SSL/指标路径/文档开关）缓存 S3 兼容 store 实例。`S3CompatibleObjectStore` 继承 `MinIOService` 但以构造参数覆盖默认值，从而复用同一套行为而无需改动既有调用方。两种对象存储都向 JSONL 指标文件（默认 `./logs/object_store_metrics.jsonl`）记录每次操作的类型、耗时与错误，供离线分析。

Sources: [app/storage/object/factory.py](app/storage/object/factory.py#L32-L114)、[app/storage/object/s3_compatible.py](app/storage/object/s3_compatible.py#L11-L83)

## 关系库：PostgreSQL 与 SQLAlchemy 会话管理

关系库的运行时核心是 `app/core/database_singleton.py`，它刻意独立于 `app/core/database.py` 存在——后者的顶层导入可能在测试中被 `sys.modules.pop` 移除，单例独立模块可防止 SQLAlchemy `Base`/engine 被意外重建而破坏模型注册。连接池配置随数据库方言自适应：非 SQLite 时启用 `pool_size=10`、`max_overflow=20`、`pool_timeout=30s`、`pool_recycle=1800s`、`pool_pre_ping=true`；`get_db` 作为 FastAPI 依赖，在异常时回滚并保证连接归还池中。

Sources: [app/core/database_singleton.py](app/core/database_singleton.py#L27-L63)

Schema 由 `app/models/` 下 40 余个 ORM 模型定义（tenants、users、datasets、documents、document_chunks、conversations、messages、evidence、feedback 等），经 Alembic 迁移演进（`alembic/versions/0001_baseline_schema.py` 至 `0026_add_index_drift_items.py`）。基线迁移采用原生 SQL 而非 `op.create_table`，包含 PostgreSQL 专属类型（`UUID[]`、`JSONB`、枚举类型 `datasetpermissionenum`），且大量使用复合唯一约束与部分唯一索引（如 `uq_documents_tenant_dataset_dedup_key_active` 仅在 `archived_at IS NULL` 时生效），体现多租户数据隔离的严谨性。

Sources: [alembic/versions/0001_baseline_schema.py](alembic/versions/0001_baseline_schema.py#L20-L60)、[app/models/document.py](app/models/document.py#L32-L48)

关系库与向量库的协调点是 `document_chunks.vector_id` 字段：关系库保存切块的文本内容、页码、起止字符与 JSONB 元数据，并记录该块在向量库中的主键；`fetch_existing_ids` 用 `id in [...]` 表达式按批查询 Milvus 主键是否存在，供索引审计检测「关系库仍引用但向量已丢失」的漂移。文档删除时，`indexer` 先按 `document_id` 删向量、再级联删关系行，保证两侧一致。

Sources: [app/models/document.py](app/models/document.py#L136-L160)、[app/storage/vector/milvus.py](app/storage/vector/milvus.py#L1385-L1402)

## Redis 与语义缓存

Redis 不承载核心业务数据，而是以 `LazyRedisClient`（懒加载 + I/O 错误失效）按需启用：任务队列、租户 QPS 限流、SAML 重放防护、检索候选单飞（singleflight）、语义缓存载荷等。健康检查通过 `redis_usage_flags` 汇总各功能的启用状态，仅当任一功能开启时才要求 Redis 连通。

语义缓存是存储层最具特色的复合设计：**Milvus ANN 负责向量近似检索，Redis 负责载荷存储与 TTL**。查询时先对输入做嵌入并在 `semantic_cache` 集合中检索（`SEMANTIC_CACHE_SCORE_THRESHOLD=0.95`、top-k=5），命中后从 Redis 取回不超过 `SEMANTIC_CACHE_MAX_VALUE_BYTES`（400KB）的载荷；设计上不在 Redis 键或 Milvus 元数据中存原始查询文本，规避 PII 泄露。TTL 默认 300 秒，`MilvusSemanticCacheMaintenanceIterator` 提供按租户分页清理过期条目的维护能力。

Sources: [app/core/redis_client.py](app/core/redis_client.py#L8-L72)、[app/services/semantic_cache.py](app/services/semantic_cache.py#L2-L11)、[app/services/semantic_cache.py](app/services/semantic_cache.py#L188-L212)

## 健康检查与运维观测

存储层各组件均暴露给 `/api/v1/health/details`（鉴权后）：

- **向量库**：`VECTOR_BACKEND=milvus` 时通过 `get_collection_count()` 读取集合实体数，标记 connected/disconnected；非 Milvus 后端返回未配置状态。
- **对象存储**：`minio_service.health_check()` 在启用时校验桶存在性，返回连接耗时与错误摘要；`S3CompatibleObjectStore.health_check()` 同构。
- **Redis**：按功能启用标志汇总，连接失败时返回 `should_reset_client=true` 触发客户端失效重建。

Prometheus 指标方面，Milvus 回退事件计数刻意保持低基数且 PII 安全（不携带租户/数据集/查询 ID 标签），仅在 `PROMETHEUS_ENABLED=true` 时上报；对象存储则以 JSONL 文件记录每次操作明细。

Sources: [app/core/health_checks.py](app/core/health_checks.py#L103-L159)、[app/core/health_checks.py](app/core/health_checks.py#L217-L248)、[app/storage/vector/milvus_prometheus_metrics.py](app/storage/vector/milvus_prometheus_metrics.py#L1-L57)

## 存储层配置速查

| 配置项 | 默认值 | 作用 |
|--------|--------|------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/mimirq` | 关系库连接串 |
| `VECTOR_BACKEND` | `milvus` | 向量后端选择：milvus/memory/faiss/chroma/qdrant/pgvector |
| `MILVUS_HOST` / `MILVUS_PORT` | `localhost` / `19530` | Milvus 连接 |
| `MILVUS_COLLECTION_NAME` | `documents` | 文档向量集合名 |
| `MILVUS_SHADOW_COLLECTION_NAME` | 空 | 蓝绿迁移影子集合（双写目标） |
| `MILVUS_EXPR_MAX_DOC_IDS` | 200 | document_id 下推上限，超限走客户端过滤 |
| `MINIO_ENABLED` | `false` | 启用 MinIO 图片存储 |
| `MINIO_DOCUMENTS_ENABLED` | `false` | 启用文档源文件入库 |
| `OBJECT_STORAGE_PROVIDER` | `minio` | 通用对象存储 provider：minio/s3/s3_compatible/oss/cos |
| `OBJECT_STORAGE_REGION_PROFILES` | 空 | 按区域 JSON 配置对象存储 |
| `FAISS_STORE_PATH` | `./vector_faiss` | FAISS 持久化目录 |
| `CHROMA_PERSIST_PATH` | `./vector_chroma` | Chroma 持久化目录 |
| `SEMANTIC_CACHE_ENABLED` | `false` | 语义缓存总开关（Milvus + Redis） |
| `SEMANTIC_CACHE_COLLECTION_NAME` | `semantic_cache` | 语义缓存集合名 |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis 连接串 |

Sources: [.env.example](.env.example#L375-L429)、[.env.example](.env.example#L701-L707)、[app/core/config.py](app/core/config.py#L331-L337)

## 小结与下一步

存储层的设计哲学可以概括为「**各司其职、路由隔离、双写兜底**」：关系库管状态、向量库管语义、对象存储管字节，三者以稳定 ID 松散耦合；`VECTOR_BACKEND` 与 `OBJECT_STORAGE_PROVIDER` 提供可插拔后端，`DATA_REGION` 实现多区域隔离；嵌入空间哈希与影子集合双写则为 embedding 模型升级提供了蓝绿切换路径。理解存储层后，建议继续阅读 [任务队列与后台作业](25-ren-wu-dui-lie-yu-hou-tai-zuo-ye) 了解存储与异步处理的衔接，以及 [可观测性：指标、追踪与日志](26-ke-guan-ce-xing-zhi-biao-zhui-zong-yu-ri-zhi) 掌握存储健康指标的消费方式；若关心部署形态，[部署运维：Docker Compose 与 Helm](28-bu-shu-yun-wei-docker-compose-yu-helm) 提供了完整的存储基础设施编排说明。