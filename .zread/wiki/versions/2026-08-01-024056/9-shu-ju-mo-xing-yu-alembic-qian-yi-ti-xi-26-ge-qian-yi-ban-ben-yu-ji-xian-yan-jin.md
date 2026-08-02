本文解析 MimirQ 的数据库 Schema 管理体系：26 个线性排列的 Alembic 迁移版本如何从一张 39 表的基线演进到 52 张表，以及"确定性 Alembic 迁移 + 启动期幂等运行时迁移"双轨策略如何兼顾生产升级与存量部署兼容。面向已熟悉 SQLAlchemy 基础、需要理解 Schema 演进机制与操作流程的开发者。

## 双轨驱动的 Schema 管理总览

MimirQ 的 Schema 管理并非单一机制，而是两条并行轨道：**Alembic 版本化迁移**负责确定性的、可审计的 Schema 升级（生产环境推荐路径），**运行时迁移**（`app/core/migrations.py`）则是一组启动期执行的幂等 `ALTER TABLE ... IF NOT EXISTS` 语句，用于让存量数据库在未跑 Alembic 的情况下也能被新代码启动。这两条轨道在 `app/main.py` 的启动生命周期中协同工作，并分别由 `DB_RUNTIME_MIGRATIONS_ENABLED` 与 `DB_CREATE_ALL_ON_STARTUP` 两个开关控制。

```mermaid
flowchart LR
    subgraph CI["CI / 生产部署"]
        A[make db-upgrade] --> B[alembic upgrade head]
        B --> C[alembic_version 表记录 revision]
    end
    subgraph Runtime["应用启动 (app/main.py)"]
        D[DB_RUNTIME_MIGRATIONS_ENABLED=true] --> E[apply_runtime_migrations<br/>幂等 ALTER/索引守卫]
        F[DB_CREATE_ALL_ON_STARTUP=true] --> G[Base.metadata.create_all]
        G --> E
    end
    subgraph Models["模型层"]
        H[app/models/*.py] --> I[Base.metadata]
        I --> J[alembic env.py 加载]
        J --> B
    end
```

主程序启动时先按配置执行运行时迁移，再视配置执行 `create_all`（仅建缺失表、不改动已有表），随后再次执行运行时迁移为新建表补齐兼容列；若关闭 `create_all`，则完全交由外部管理 Schema（如 CI 中的纯 Alembic 路径）[app/main.py](app/main.py#L244-L262)。两条轨道的边界在配置注释中写得很清楚：`create_all` 便利但不推荐生产，运行时迁移是存量兼容守卫，生产环境应优先使用 Alembic [app/core/config.py](app/core/config.py#L173-L185)。

## 迁移基础设施：env.py 的 URL 解析与元数据装载

Alembic 环境配置被刻意保持轻量（`alembic/env.py` 仅 113 行），核心职责有三：把仓库根目录加入 `sys.path` 使 `app.*` 可导入、解析数据库 URL、装载完整模型元数据 [alembic/env.py](alembic/env.py#L1-L8)。

数据库 URL 的解析采用三级回退：优先 `app.core.config.settings.DATABASE_URL`（支持 .env），失败则回退环境变量 `DATABASE_URL`，最后才使用 `alembic.ini` 中的占位值 `postgresql+psycopg2://postgres:postgres@localhost:5432/mimirq` [alembic/env.py](alembic/env.py#L37-L54)。这意味着本地开发只需配置应用设置即可驱动 Alembic，无需维护两份 URL。

元数据装载的关键在 `app/models/_all.py`：由于并非所有模型模块都从 `app.models.__init__` 导入，Alembic 的 autogenerate 必须显式导入全部模块才能让 `Base.metadata` 包含每一张表——该模块被明确标注为"仅供工具链或测试导入，请求路径中应避免导入" [alembic/env.py](alembic/env.py#L57-L63)；`_all.py` 逐行 import 了 26 个模型模块并附带 `# noqa: F401` 注释说明副作用是表注册，最后还额外导入 `app.rag.kg.models` 覆盖知识图谱模型 [app/models/_all.py](app/models/_all.py#L1-L40)。

在线/离线两种迁移模式均开启了 `compare_type=True` 与 `compare_server_default=True`，让 autogenerate 能捕获类型与默认值层面的漂移 [alembic/env.py](alembic/env.py#L69-L106)。命令入口方面，`scripts/alembic_cli.py` 是对 Alembic console script 的包装——某些 Windows/CI 环境 PATH 上找不到 `alembic` 命令，包装器让 `make db-upgrade` 通过 `python scripts/alembic_cli.py` 稳定执行 [scripts/alembic_cli.py](scripts/alembic_cli.py#L1-L21)。Makefile 中 `db-upgrade` 对应 `upgrade head`，`db-revision` 对应 `revision --autogenerate -m "$(m)"` [Makefile](Makefile#L567-L571)；`alembic/README.md` 还提示存量部署可校验 Schema 后用 `alembic stamp head` 建立基线 [alembic/README.md](alembic/README.md#L12-L17)。

## 26 个版本的迁移链全景

所有 26 个迁移构成一条**无分支的线性链**：从 `0001_baseline_schema`（`down_revision = None`）逐级指向 `0026_add_index_drift_items`。revision 标识符风格前后不一——早期是完整描述性 ID（如 `0004_add_kg_search_diagnostics_runs_compound_index`），后期改为短 ID（如 `0021_conv_owner_account`）——这直接导致了一个关键历史决策：Alembic 默认 `version_num` 列为 `VARCHAR(32)`，而 `0003` 的 revision ID 超过 32 字符，因此 `0002` 的 UPGRADE_SQL 第一条语句就是把 `alembic_version.version_num` 加宽到 `VARCHAR(255)`，且必须在新 revision 写入前完成 [alembic/versions/0002_add_kg_relations.py](alembic/versions/0002_add_kg_relations.py#L17-L21)。

```mermaid
flowchart LR
    B["0001 baseline<br/>39 张表"] --> K1["0002 kg_relations"]
    K1 --> K2["0003 KG 诊断运行表"]
    K2 --> K3["0004 复合索引"]
    K3 --> K4["0005 KG pipeline_hash"]
    K4 --> K5["0006 实体消解+本体"]
    K5 --> C["0007 切块预设 dataset_id"]
    C --> D1["0008 文档生命周期"]
    D1 --> D2["0009 发布状态"]
    D2 --> T1["0010 租户组"]
    T1 --> T2["0011 组权限"]
    T2 --> T3["0012 SCIM 加固"]
    T3 --> R1["0013 RAG 配置模板"]
    R1 --> R2["0014 标题来源"]
    R2 --> I1["0015 死信表"]
    I1 --> I2["0016 pipeline_hash 修复"]
    I2 --> D3["0017 Dify 元数据锚点索引"]
    D3 --> D4["0018 Dify 别名索引"]
    D4 --> F1["0019 反馈分类"]
    F1 --> U1["0020 成员唯一"]
    U1 --> U2["0021 会话 owner"]
    U2 --> U3["0022 最新消息索引"]
    U3 --> DD["0023 文档去重键"]
    DD --> UU["0024 入库文档唯一"]
    UU --> SC["0025 扫描运行唯一"]
    SC --> ID["0026 索引漂移表"]
```

从功能域看，这些版本可归纳为五条主线：**知识图谱域**（0002-0006、0016：关系表、诊断运行、pipeline_hash、实体消解与谓词本体、漂移修复）、**治理与权限域**（0007-0013：切块预设数据集化、文档生命周期、发布状态、租户组、组权限、SCIM 加固、RAG 配置模板）、**Dify 外部知识集成域**（0017-0018：metadata 锚点与别名的 trigram 索引）、**可靠性域**（0015、0023-0026：死信表、去重键、入库唯一约束、扫描唯一约束、索引漂移跟踪）、**会话与反馈域**（0014、0019-0022：标题来源、反馈分类、成员唯一、会话 owner、最新消息索引）。

| 版本 | 类型 | 功能域 | 核心变更 |
|---|---|---|---|
| 0001 | 基线 | 全量 | 39 张表 + ENUM 类型 |
| 0002 | 加表 | 知识图谱 | `kg_relations`；加宽 `alembic_version` |
| 0003 | 加表 | 知识图谱 | `kg_search_diagnostics_runs` 快照表 |
| 0004 | 索引 | 知识图谱 | tenant/dataset/created_at 复合索引 |
| 0005 | 加列+回填 | 知识图谱 | KG 表 `pipeline_hash` 列及回填 |
| 0006 | 加表 | 知识图谱 | 实体别名/重定向/消解动作/谓词本体 4 表 |
| 0007 | 加列 | 治理 | `chunk_presets.dataset_id` + 复合外键 |
| 0008 | 加列 | 治理 | 文档生命周期 4 列 + 2 索引 |
| 0009 | 加列+回填 | 治理 | `publication_status` 默认 published |
| 0010 | 加表 | 权限 | `tenant_groups`、`tenant_group_members` |
| 0011 | 加表 | 权限 | 数据集/文档组权限表 |
| 0012 | 加固 | 权限 | 成员 `is_active`、组 external_id 唯一 |
| 0013 | 加表 | 实验管理 | `rag_config_templates` A/B 路由字段 |
| 0014 | 加列+分类回填 | 会话 | `title_source` auto/manual 判定 |
| 0015 | 加表+加列 | 可靠性 | `ingest_dead_letters` + 文档失败字段 |
| 0016 | 修复 | 知识图谱 | KG pipeline_hash 漂移修复（幂等） |
| 0017 | 索引 | Dify 集成 | metadata 锚点 trigram GIN 索引 |
| 0018 | 索引 | Dify 集成 | metadata 别名 trigram GIN 索引 |
| 0019 | 加列+约束 | 反馈 | 反馈分类/溯源列 + CHECK 约束 |
| 0020 | 去重+唯一 | 权限 | 成员 (tenant,user) 唯一约束 |
| 0021 | 加列+回填 | 会话 | `owner_account_id` 从 user_id 回填 |
| 0022 | 索引 | 会话 | 最新消息查找复合索引 |
| 0023 | 加列+回填+唯一 | 可靠性 | `dedup_key` 部分唯一索引 |
| 0024 | 去重+唯一 | 可靠性 | 入库文档去重 + run stats 修复 |
| 0025 | 去重+唯一 | 可靠性 | 扫描运行 active 唯一（并发建索引） |
| 0026 | 加表 | 可靠性 | `index_drift_items` 漂移跟踪表 |

## 基线 0001：从元数据生成的 39 张表

基线迁移是唯一一个由 SQLAlchemy 元数据自动生成的文件（docstring 明确标注"generated from SQLAlchemy metadata"），其 UPGRADE_SQL 包含 39 张表的 `CREATE TABLE` 语句与一个自定义枚举类型 `datasetpermissionenum`（`ONLY_ME` / `ALL_TEAM_MEMBERS` / `PARTIAL_MEMBERS`）[alembic/versions/0001_baseline_schema.py](alembic/versions/0001_baseline_schema.py#L1-L20)。基线覆盖了对话（`conversations`、`messages`）、文档（`documents`、`document_chunks`、`document_permissions`）、数据集（`datasets`、`dataset_permissions`）、连接器（`connector_configs`、`connector_runs`）、评测（`ragas_*` 四表）、证据（`evidence_suites`、`evidence_items`）、治理（`governance_profiles`）、KG（`kg_entities`、`kg_source_events`、`kg_event_entities`）、租户（`tenants`、`tenant_members`）等核心领域 [alembic/versions/0001_baseline_schema.py](alembic/versions/0001_baseline_schema.py#L20-L120)。

基线在演进中承担了"历史快照"角色：文件头部注释说明它**仅面向新数据库**，Alembic 引入前创建的存量库应校验兼容后 `alembic stamp head` [alembic/versions/0001_baseline_schema.py](alembic/versions/0001_baseline_schema.py#L1-L7)。DOWNGRADE_SQL 以逆依赖序 DROP 39 张表并最后删除枚举类型 [alembic/versions/0001_baseline_schema.py](alembic/versions/0001_baseline_schema.py#L721-L760)。该文件的引入提交（`4a20d422`）同时新增了 env.py、alembic.ini、script.py.mako、Makefile 接线与 `_all.py`，是 Alembic 体系的奠基提交。

基线之后的 13 个新表分布如下：0002 增加 `kg_relations`；0003 增加 `kg_search_diagnostics_runs`；0006 一口气增加 4 张实体消解表；0010 增加租户组两张表；0011 增加两张组权限表；0013 增加 `rag_config_templates`；0015 增加 `ingest_dead_letters`；0026 通过 ops API 增加 `index_drift_items`。最终 Schema 合计 52 张表。所有新增表几乎都遵循同一模板：UUID 主键 + `tenant_id` 非空 + `created_at/updated_at` 默认 `now()` + 租户级唯一约束（如 `uq_tenant_groups_tenant_id_id`、`uq_tenant_groups_tenant_name`）[alembic/versions/0010_add_tenant_groups.py](alembic/versions/0010_add_tenant_groups.py#L17-L48)。

## 三种迁移实现风格

26 个迁移文件体现了三种实现风格，是理解代码库演进痕迹的切入点：

| 风格 | 特征 | 代表版本 | 适用场景 |
|---|---|---|---|
| **A 原始 SQL 列表** | 模块级 `UPGRADE_SQL`/`DOWNGRADE_SQL` 列表 + `for stmt in ...: op.execute(stmt)`；语句自带 `IF NOT EXISTS` 幂等 | 0001-0018、0021、0022（约 20 个） | 批量 DDL、复杂回填、多语句原子性由 Alembic 事务保证 |
| **B ops API** | `op.create_table`、`op.add_column`、`op.create_unique_constraint`、`op.create_check_constraint`、`op.create_index` | 0019、0020、0023、0024、0025、0026 | 单列/单约束变更、需要方言感知选项 |
| **C 混合** | `op.execute` + ops API + `autocommit_block` + `postgresql_concurrently` | 0025 | 并发建索引、跨方言（Postgres/SQLite）兼容 |

风格 A 的典型代表是 0015：`documents` 增加 4 个失败追踪列，随后 `CREATE TABLE IF NOT EXISTS ingest_dead_letters` 定义含 `schema_version`（`mimirq.ingest_dead_letter.v1`）的完整死信结构，再创建 6 个查询索引 [alembic/versions/0015_ingest_dead_letters.py](alembic/versions/0015_ingest_dead_letters.py#L12-L45)。风格 B 的典型代表是 0026：`op.create_table` 用 `sa.dialects.postgresql.UUID(as_uuid=True)` 声明列，`details`/`marker` JSON 列默认 `'{}'`，`updated_at` 带 `onupdate=sa.func.now()` [alembic/versions/0026_add_index_drift_items.py](alembic/versions/0026_add_index_drift_items.py#L13-L48)。风格 C 的 0025 则展示了最精细的工程处理：先对两张扫描运行表去重（将多余 active 行置为 failed），再针对 Postgres 使用 `postgresql_where` 部分索引与 `CONCURRENTLY` 建索引，并在建索引前先 drop 可能残留的 INVALID 索引以保证重试安全，SQLite 分支则退化为普通部分索引 [alembic/versions/0025_scan_run_active_uniqueness.py](alembic/versions/0025_scan_run_active_uniqueness.py#L43-L80)。

风格 A 的优势是完整掌控 SQL 语义（Postgres 方言特性、CTE 回填），劣势是与 ORM 模型脱节；风格 B 更贴近 Alembic 推荐写法且支持方言翻译，但复杂回填仍需 `op.execute`。工程上还可见第三种形态：0019 在 `autocommit_block` 中并发创建索引（避免长事务锁表），同时用 CHECK 约束固化反馈分类枚举值 [alembic/versions/0019_add_feedback_triage_fields.py](alembic/versions/0019_add_feedback_triage_fields.py#L13-L37)。

## 数据回填与修复型迁移

迁移链中最具工程价值的部分是 6 个**带数据回填或数据修复**的版本，它们展示了"加列 → 回填 → 加固约束"的标准三步法，以及 CTE 窗口函数在幂等去重中的应用：

- **0009 发布状态**：加列 → `UPDATE ... SET publication_status='published' WHERE IS NULL` → `SET DEFAULT` → `SET NOT NULL`，完成从无状态到强制默认值的平滑过渡 [alembic/versions/0009_add_document_publication_status.py](alembic/versions/0009_add_document_publication_status.py#L17-L24)。
- **0014 标题来源**：用 `DISTINCT ON` 取每个会话的首条用户消息，按"空标题"或"标题等于首条消息 50 字符截断"判定为 `auto`，其余为 `manual` [alembic/versions/0014_add_conversation_title_source.py](alembic/versions/0014_add_conversation_title_source.py#L17-L40)。
- **0016 漂移修复**：针对"已 stamp 到最新 revision 但 `kg_source_events.pipeline_hash` 列缺失"的长寿命库，幂等补列并从文档 metadata 回填；其 downgrade 刻意设计为 no-op，因为列由 0005 拥有，直接删除会破坏正常库 [alembic/versions/0016_repair_kg_source_event_pipeline_hash.py](alembic/versions/0016_repair_kg_source_event_pipeline_hash.py#L1-L51)。
- **0021 owner 回填**：把遗留 UUID `user_id` 转字符串拷入 `owner_account_id`，NULL 行保持不动以便运行时 fail-closed [alembic/versions/0021_add_conversation_owner_account_id.py](alembic/versions/0021_add_conversation_owner_account_id.py#L17-L21)。
- **0023 去重键**：用 `row_number() OVER (PARTITION BY tenant_id, dataset_id, sha, pipeline_hash)` 选择保留行（failed 优先淘汰、按 updated_at 倒序），再建部分唯一索引 `uq_documents_tenant_dataset_dedup_key_active` 让去重从"尽力扫描"升级为"数据库强制" [alembic/versions/0023_add_document_dedup_key.py](alembic/versions/0023_add_document_dedup_key.py#L11-L39)。
- **0024 入库文档唯一**：这是最复杂的回填迁移——对 `ingestion_run_documents` 按 (tenant, run, document) 分区、按状态优先级（completed > failed > quarantined > cancelled > processing > pending）排序去重，同时**重算受影响 run 的 `stats` 聚合**（total_documents、status_counts、progress），并显式警告"去重不可逆" [alembic/versions/0024_ingestion_run_document_uniqueness.py](alembic/versions/0024_ingestion_run_document_uniqueness.py#L15-L80)。

这些回填型迁移的共同特征是：**幂等性**（`IF NOT EXISTS` + 仅处理 NULL/空值行）、**保留数据优先级**（失败行可丢弃、完成行保留）、**约束后置**（先清洗数据再建唯一约束，避免迁移本身触发 IntegrityError）。

## 运行时迁移：启动期的兼容层

`app/core/migrations.py` 是独立于 Alembic 的第二套机制，其模块注释直白说明设计动机："启动时用 `Base.metadata.create_all()` 建表（不修改已有表），并应用一组安全的 `ALTER TABLE ... IF NOT EXISTS` 操作以平滑部署，仅在 PostgreSQL 上运行，失败被忽略以免阻塞启动" [app/core/migrations.py](app/core/migrations.py#L1-L9)。

其内容与 Alembic 版本存在大量**镜像关系**：15 张遗留表的多租户列加固（`_tenant_id_migrations` 生成 ADD COLUMN → 回填 → SET DEFAULT → SET NOT NULL 四步语句，默认租户 UUID 从 `DEFAULT_TENANT_ID` 解析、失败回退全零 UUID）[app/core/migrations.py](app/core/migrations.py#L20-L57)；死信表结构与索引完全复刻 0015 [app/core/migrations.py](app/core/migrations.py#L143-L177)；Dify metadata trigram 索引复刻 0017/0018 [app/core/migrations.py](app/core/migrations.py#L225-L259)；文档去重键与部分唯一索引复刻 0023 [app/core/migrations.py](app/core/migrations.py#L377-L407)；另有大量复合索引、复合外键、数据集隔离约束等守卫 [app/core/migrations.py](app/core/migrations.py#L292-L339)。

执行层面的关键设计在文件尾部：由于 PostgreSQL 中一条语句出错会污染整个事务，这些"尽力而为"的迁移必须**每条 DDL 独立事务**，`with conn.begin()` 包裹单条语句、异常被吞掉继续下一条，确保一条失败不阻塞其余 [app/core/migrations.py](app/core/migrations.py#L472-L490)。这解释了为何运行时迁移与 Alembic 的失败语义不同：Alembic 是全部或全不（all-or-nothing），运行时迁移是逐条尽力（best-effort）。

## 模型层注册与 autogenerate 契约

模型层是迁移体系的"源真相"，二者通过 `Base.metadata` 契约连接。`app/core/database.py` 刻意只做单例重导出（避免测试中 `sys.modules.pop` 后重建 Base/engine），真正定义在 `database_singleton.py` [app/core/database.py](app/core/database.py#L1-L23)。`app/models/__init__.py` 面向应用代码重导出约 30 个模型类 [app/models/__init__.py](app/models/__init__.py#L4-L19)，而 `_all.py` 面向工具链导入全部 26 个模块（含 `app.rag.kg.models`），二者分工明确、互不干扰。

模型与迁移的双向印证随处可见：`Conversation` 模型声明 `owner_account_id` 与 `ix_conversations_tenant_owner_account_id` 索引，与 0021 迁移一致 [app/models/chat.py](app/models/chat.py#L16-L44)；`Document` 模型声明 `fk_documents_tenant_dataset` 复合外键与 `uq_documents_tenant_dataset_dedup_key_active` 部分唯一索引，与 0023 迁移一致 [app/models/document.py](app/models/document.py#L30-L48)；`IngestDeadLetter` 与 `IndexDriftItem` 则分别是 0015 与 0026 的表映射 [app/models/ingest_dead_letter.py](app/models/ingest_dead_letter.py#L11-L43)、[app/models/index_drift_item.py](app/models/index_drift_item.py#L11-L38)。由于 `env.py` 开启了 `compare_type` 与 `compare_server_default`，autogenerate 能发现类型漂移；但需要注意：**已有迁移文件都是手写或从元数据一次性生成的**，`script.py.mako` 模板只提供标准骨架 [alembic/script.py.mako](alembic/script.py.mako#L1-L28)，新增迁移应由 `make db-revision m="..."` 生成后再人工编写 DDL/回填逻辑。

## 集成测试与 CI 门禁

迁移体系的可信度由一套**真实 PostgreSQL 集成测试**支撑：`tests/test_alembic_upgrade_from_prior_revision.py` 在 `MIMIRQ_INTEGRATION_TESTS=1` 时启用，通过 `make_url` 解析 `DATABASE_URL` 后创建临时数据库（`mimirq_alembic_<uuid>`），测试结束强制 DROP [tests/test_alembic_upgrade_from_prior_revision.py](tests/test_alembic_upgrade_from_prior_revision.py#L16-L52)。

三个测试覆盖了三条关键路径：**中间版本升级回填**——先 `upgrade` 到 0020，插入遗留形态的 `conversations`（有 user_id、无 owner_account_id），再升级到 head，断言 `owner_account_id` 被回填且新索引存在 [tests/test_alembic_upgrade_from_prior_revision.py](tests/test_alembic_upgrade_from_prior_revision.py#L56-L96)；**最新版本建表**——先到 0025 断言 `index_drift_items` 不存在，升到 head 后校验全部列与 7 个索引 [tests/test_alembic_upgrade_from_prior_revision.py](tests/test_alembic_upgrade_from_prior_revision.py#L100-L178)；**去重迁移语义**——构造含大小写脏状态 `' Completed '` 的重复行，升级到 0024 后断言仅保留 completed/pending 两行、run stats 被重算（total 3→2、progress 66→50）、且重复插入被唯一约束拒绝（`IntegrityError`）[tests/test_alembic_upgrade_from_prior_revision.py](tests/test_alembic_upgrade_from_prior_revision.py#L182-L337)。

CI 工作流的 "Database migrations and integration tests" 步骤以 `MIMIRQ_DB_CREATE_ALL_ON_STARTUP=false` 与 `MIMIRQ_DB_RUNTIME_MIGRATIONS_ENABLED=false` 启动——强制验证**纯 Alembic 路径**（不依赖任何启动期守卫），先 `make db-upgrade` 再跑迁移与 Schema 集成测试 [.github/workflows/ci.yml](.github/workflows/ci.yml#L156-L169)。

## 演进规律与操作实践

回看 26 个版本，可以提炼出本代码库 Schema 演进的五条规律：

1. **先加列、再回填、后加固**：任何新约束（唯一索引、NOT NULL）都发生在数据清洗之后，0023/0024/0025 均遵循此序。
2. **索引与查询形态对齐**：0017/0018 的 trigram 索引注释直接标注"匹配 `HybridRetriever._search_lexical_db` 的查询形态" [app/core/migrations.py](app/core/migrations.py#L218-L224)，迁移是检索热路径的 DDL 投影。
3. **租户隔离是贯穿性约束**：几乎所有新表都带 `tenant_id` 非空列 + 租户级唯一约束，复合外键 `(tenant_id, dataset_id) → datasets(tenant_id, id)` 被系统性建立 [app/core/migrations.py](app/core/migrations.py#L292-L339)。
4. **幂等与可重试优先**：`IF NOT EXISTS` 遍布全链；0025 专门处理并发建索引失败残留的 INVALID 索引；0016 的 downgrade 是 no-op 以保护共享列。
5. **双轨镜像但语义分层**：运行时迁移镜像了 0015/0017/0018/0023 等关键 DDL 用于存量兼容，但生产确定性升级永远走 Alembic。

实际操作建议：新功能涉及 Schema 变更时，先用 `make db-revision m="描述"` 生成骨架，再按"DDL → 回填 → 约束 → 索引"顺序手写 upgrade，并同步在 `app/core/migrations.py` 中补充运行时守卫（若需兼容未跑迁移的存量库）；涉及数据清洗的迁移应参照 0024 编写集成测试，并在 CI 的纯 Alembic 路径下验证。需要理解迁移产生的表如何被上层消费，可继续阅读 [多租户与安全边界：行级安全、RBAC、JWT、SAML SSO 与 SCIM 供应](10-duo-zu-hu-yu-an-quan-bian-jie-xing-ji-an-quan-rbac-jwt-saml-sso-yu-scim-gong-ying)（0020/0021 的成员与会话隔离语义）与 [入库生命周期与失败处理：ingestion runs、死信队列与重试机制](15-ru-ku-sheng-ming-zhou-qi-yu-shi-bai-chu-li-ingestion-runs-si-xin-dui-lie-yu-zhong-shi-ji-zhi)（0015/0024 的可靠性表）；迁移在应用启动时序中的位置参见 [FastAPI 应用骨架与启动生命周期](8-fastapi-ying-yong-gu-jia-yu-qi-dong-sheng-ming-zhou-qi-zhong-jian-jian-pei-zhi-yi-chang-chu-li-yu-yun-xing-shi-qian-yi)。