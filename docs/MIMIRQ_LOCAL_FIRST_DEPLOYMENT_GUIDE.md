# MimirQ 本地优先部署、配置与使用手册

> 适用版本：当前仓库版本（2026-08-01）
> 适用场景：中文文档、单台服务器、尽量不调用云端 API、尽量降低长期费用
> 本手册不包含服务器密码、JWT 密钥、MinIO 私密密钥或模型平台令牌。

## 1. 先看结论

这套系统可以完全按本地优先方式运行：数据库、缓存、向量库、对象存储、语言模型和向量模型都由自己的服务器提供。只有主动启用云端解析器、云端 OCR、云端 LLM 或云端对象存储时才会产生第三方费用。

### 推荐组合

| 能力 | 推荐实现 | 是否需要外网费用 | 当前建议 |
|---|---|---:|---|
| 对话生成 | 服务器上的 Ollama + `qwen3:8b` | 否 | 开启 |
| 中文向量 | `BAAI/bge-large-zh-v1.5` | 否 | 已部署并验证 |
| 向量库 | Docker Milvus | 否 | 开启 |
| 数据库 | Docker PostgreSQL 15 | 否 | 开启 |
| 任务队列和缓存 | Docker Redis 7 | 否 | 开启 |
| 图片、解析产物 | Docker MinIO | 否 | 开启 |
| 普通文档解析 | MarkItDown、DeepDoc | 否 | 开启 |
| 复杂 PDF 重排版 | Docling | 否 | 按需开启 |
| 中文重排 | 本地 `BAAI/bge-reranker-v2-m3` | 否 | 初期关闭，稳定后开启 |
| 知识图谱 | MimirQ 内置 KG + 本地 LLM | 否 | 初期关闭，确有关系检索需求再开启 |
| 网页采集 | MimirQ 服务端 URL 采集 | 否 | 默认关闭，存在 SSRF 风险 |
| MinerU | 本地服务或在线 API | 可能产生费用 | 当前关闭 |
| PaddleOCR-VL | GPU 外部解析服务 | 否，但占用 GPU 较高 | GTX 1060 6GB 不建议开启 |
| TextIn | 商业解析 API | 是 | 关闭 |

### 当前服务器状态

- 前端：`http://ai-factory.tail99c6f5.ts.net:3000/`
- API 文档：`http://ai-factory.tail99c6f5.ts.net:18000/docs`
- readiness：HTTP 200
- 宿主机 `8000`：当前是 MinerU 相关服务端口，不是 MimirQ API
- API 和 Worker：healthy
- Embedding：`BAAI/bge-large-zh-v1.5`，1024 维
- 服务器：12 核 CPU、约 62 GiB 内存、GTX 1060 6GB、驱动 535、CUDA 兼容上限约 12.2

因此，打开前端时使用 `3000`，调用 API 时使用 `18000`，不要把 `8000` 当成 MimirQ API。

## 2. 最低成本架构

~~~text
浏览器
  |
  | http://服务器:3000
  v
MimirQ Web (Next.js)
  |
  | Docker 内部网络
  v
MimirQ API :8000 ---- Redis 7 ---- MimirQ Worker
  |
  +---- PostgreSQL 15
  +---- Milvus ---- etcd + MinIO
  +---- 本地 BGE Embedding（CPU）
  |
  +---- host.docker.internal:11434 ---- Ollama qwen3:8b
~~~

Compose 中 API 容器内部端口仍然是 `8000`，宿主机通过根 .env 的 BACKEND_PORT 映射到 `18000`。前端使用同源代理，浏览器不需要知道 Docker 内部主机名。

费用控制原则：

1. 先只启用 API、Worker、PostgreSQL、Redis、Milvus、MinIO、MarkItDown、DeepDoc 和本地模型。
2. 解析器不要全部启动，每个外部解析服务都会增加镜像下载、内存占用和故障面。
3. 重排器、知识图谱、查询改写、多路查询、HyDE、评测任务在基础问答可用后再逐项开启。
4. 只有需要扫描 PDF、复杂表格或图文混排时才开启 Docling 或其他重型解析器。
5. 保留 Redis 和上传去重，减少同一文档重复解析和重复向量化。
6. 使用本地磁盘和 MinIO，不要同时配置 S3、OSS、COS 等云存储。

## 3. 硬件、代理和仓库

### 3.1 要求

| 部件 | 最低建议 | 本服务器情况 |
|---|---:|---:|
| CPU | 8 核 | 12 核 |
| 内存 | 16 GiB | 约 62 GiB |
| 磁盘 | 100 GiB 可用 | 需要给上传文件、模型缓存和 Docker 卷留空间 |
| GPU | 非必需 | GTX 1060 6GB |
| Docker | Docker Engine 24+ 和 Compose 插件 | 需要 |
| Git | 2.x | 需要 |

当前 MimirQ 后端镜像使用 CPU 版 PyTorch，BGE 实际在 CPU 运行，不会自动使用 GTX 1060。首次下载和批量向量化会比 GPU 慢，但可以避开 CUDA 冲突。

### 3.2 服务器代理

服务器通过代理访问 Docker Hub、npm、Hugging Face 或 ModelScope 时，在服务器 .env 填写：

~~~dotenv
HTTP_PROXY=http://100.70.139.102:7890
HTTPS_PROXY=http://100.70.139.102:7890
ALL_PROXY=http://100.70.139.102:7890
NO_PROXY=localhost,127.0.0.1,::1,mimirq-api,mimirq-worker,mimirq-postgres,mimirq-redis,mimirq-milvus,mimirq-minio,mimirq-etcd,host.docker.internal
~~~

代理变量主要用于构建和下载，不要放入前端公开变量，也不要把带账号密码的代理 URL 提交到 GitHub。

### 3.3 获取 GitHub 仓库

~~~bash
cd /home/fox
git clone <GitHub仓库地址> MimirQ
cd /home/fox/MimirQ
cp .env.example .env
~~~

已有仓库更新：

~~~bash
cd /home/fox/MimirQ
git fetch --all --prune
git pull --ff-only
~~~

确认 .env、上传目录和 Docker 卷不在 Git 跟踪范围内。真实 .env 不应提交到 GitHub。

### 3.4 生产密钥

服务器执行，输出不要粘贴到聊天或提交到仓库：

~~~bash
openssl rand -hex 32
openssl rand -hex 32
~~~

第一段可用于 SECRET_KEY，第二段可用于 MARKDOWN_IMAGE_PROXY_SECRET。MinIO Access Key 和 Secret Key 也要使用随机值。

## 4. Docker 部署

### 4.1 根 .env 核心模板

下面是核心变量。已经部署完成的服务器只需对照检查，不要覆盖已有密码、密钥和端口。

~~~dotenv
ENV=production
BACKEND_PORT=18000
WEB_PORT=3000
HOST=0.0.0.0
PORT=8000
BACKEND_WORKERS=1

POSTGRES_DB=mimirq
POSTGRES_USER=postgres
POSTGRES_PASSWORD=服务器生成的强密码
MIMIRQ_DB_CREATE_ALL_ON_STARTUP=false
MIMIRQ_DB_RUNTIME_MIGRATIONS_ENABLED=false

SECRET_KEY=至少32字节的随机值
MARKDOWN_IMAGE_PROXY_SECRET=另一段随机值
AUTH_MODE=jwt
ACCESS_TOKEN_EXPIRE_MINUTES=30
INITIAL_REGISTRATION_TOKEN=首次注册使用的一次性令牌

MILVUS_IMAGE=milvusdb/milvus:v2.6.11
MILVUS_HOST_DOCKER=mimirq-milvus
MILVUS_PORT_DOCKER=19530
MINIO_ENABLED_DOCKER=true
MINIO_ENDPOINT_DOCKER=mimirq-minio:9000
MINIO_ACCESS_KEY_DOCKER=自定义MinIO访问密钥
MINIO_SECRET_KEY_DOCKER=自定义MinIO私密密钥
MINIO_BUCKET_NAME_DOCKER=mimirq
MINIO_USE_SSL_DOCKER=false
MINIO_DOCUMENTS_ENABLED_DOCKER=true
REDIS_URL_DOCKER=redis://mimirq-redis:6379/0
TASK_QUEUE_ENABLED_DOCKER=true
UPLOAD_DIR_DOCKER=/data/uploads

CORS_ORIGINS_DOCKER=http://ai-factory.tail99c6f5.ts.net:3000,http://localhost:3000
NEXT_PUBLIC_API_URL_DOCKER=/
API_INTERNAL_URL_DOCKER=http://mimirq-api:8000

LLM_API_KEY=ollama
LLM_API_BASE=http://host.docker.internal:11434/v1
LLM_MODEL=qwen3:8b
LLM_TEMPERATURE=0.2
LLM_TIMEOUT=120

EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=BAAI/bge-large-zh-v1.5
EMBEDDING_API_KEY=no_api_key
EMBEDDING_API_BASE=

VECTOR_BACKEND=milvus
CHUNK_VECTOR_ENABLED=true
BM25_INDEX_ENABLED=true
LEXICAL_DB_HYBRID_FALLBACK_ONLY=true
BM25_LAZY_BUILD_ENABLED=true
DEFAULT_PARSER_BACKEND=auto
DEFAULT_CHUNK_STRATEGY=auto
CHUNK_SIZE=1000
CHUNK_OVERLAP=150
CHUNK_MIN_CHARS=30
RETRIEVAL_TOP_K=8
SIMILARITY_THRESHOLD=0.4

DEEPDOC_ENABLED=true
MARKITDOWN_ENABLED=true
DOCLING_ENABLED=false
LLAMA_INDEX_ENABLED=false
MINERU_ENABLED=false
MAGIC_PDF_ENABLED=false
ETL4LLM_ENABLED=false
MARKER_ENABLED=false
PADDLE_VL_ENABLED=false
TEXTIN_ENABLED=false

ENABLE_RERANKER=false
RERANKER_PROVIDER=cross_encoder
RERANKER_MODEL=BAAI/bge-reranker-v2-m3
RERANKER_API_KEY=
RERANKER_API_BASE=
RERANKER_TOP_N=20
RERANKER_LOCAL_LOAD_TIMEOUT_SEC=120

KG_ENABLED=false
KG_CHAT_ENABLED=false
URL_INGEST_ENABLED=false
GOVERNANCE_ENABLED=false
PROMETHEUS_ENABLED=false
OTEL_ENABLED=false
~~~

示例中的中文说明必须替换成真实值后才能用于 .env。Compose 通过 MINIO_*_DOCKER 和 REDIS_URL_DOCKER 给容器注入内部地址。

### 4.2 启动和重建

每次 Compose 命令都显式指定根 .env，否则可能回退到默认端口、默认 MinIO 凭据和默认服务地址：

~~~bash
cd /home/fox/MimirQ/docker
docker compose --env-file ../.env up -d --build
docker compose --env-file ../.env -f docker-compose.yml -f docker-compose.web.yml up -d --build
docker compose --env-file ../.env ps
docker compose --env-file ../.env logs --tail=200 mimirq-api mimirq-worker
curl -fsS http://127.0.0.1:18000/api/v1/health/ready
~~~

只重建 API 和 Worker：

~~~bash
docker compose --env-file ../.env up -d --build --force-recreate mimirq-api mimirq-worker
~~~

不要把 docker compose down -v 当普通重启命令。-v 会删除命名卷，可能清空 PostgreSQL、Milvus、MinIO 和上传数据。

### 4.3 前端地址

浏览器访问：

~~~text
http://ai-factory.tail99c6f5.ts.net:3000/
~~~

如果页面打开但接口失败，检查 NEXT_PUBLIC_API_URL_DOCKER=/ 和 API_INTERNAL_URL_DOCKER=http://mimirq-api:8000 是否同时存在。浏览器不应填写 http://mimirq-api:8000，因为该主机名只在 Docker 网络内可解析。

## 5. 本地 Ollama

### 5.1 安装和模型

服务器已有 Ollama，模型包括 qwen3:8b 和 llava:7b。新服务器安装后执行：

~~~bash
ollama pull qwen3:8b
ollama list
sudo systemctl edit ollama
~~~

写入：

~~~ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
~~~

应用配置并测试：

~~~bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
curl -fsS http://127.0.0.1:11434/api/tags
~~~

### 5.2 Docker 访问宿主机 Ollama

创建 docker/docker-compose.local.yml：

~~~yaml
services:
  mimirq-api:
    extra_hosts:
      - "host.docker.internal:host-gateway"
  mimirq-worker:
    extra_hosts:
      - "host.docker.internal:host-gateway"
~~~

启动：

~~~bash
cd /home/fox/MimirQ/docker
docker compose --env-file ../.env -f docker-compose.yml -f docker-compose.web.yml -f docker-compose.local.yml up -d
~~~

.env 使用：

~~~dotenv
LLM_API_KEY=ollama
LLM_API_BASE=http://host.docker.internal:11434/v1
LLM_MODEL=qwen3:8b
~~~

如果容器仍无法访问，检查 host.docker.internal 解析、Ollama 监听地址和宿主机防火墙。不要把 11434 暴露到公网。

### 5.3 语言模型设置页

在“设置 → 模型接入 → 语言模型 → 配置”中填写：

| 字段 | 填写值 | 说明 |
|---|---|---|
| API Key | ollama | Ollama 不校验此值，但前端要求非空 |
| API Base URL | http://host.docker.internal:11434/v1 | API 在 Docker 内；源码直跑可用 http://127.0.0.1:11434/v1 |
| 模型 | qwen3:8b | 中文文档的成本、速度、效果平衡点 |
| Temperature | 0.2 | 知识库问答建议低温度 |
| Max Tokens | 4096 | 长答案再提高 |

测试连接主要代表聊天模型接口可调用，不代表 Embedding 或解析器正常，仍要完成中文文档入库和带引用问答。

## 6. 本地 BGE 中文向量模型

### 6.1 已部署配置

服务器根 .env 已使用：

~~~dotenv
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=BAAI/bge-large-zh-v1.5
EMBEDDING_API_KEY=no_api_key
EMBEDDING_API_BASE=
~~~

EMBEDDING_API_KEY 在前端是必填项，但本地模型不需要真实 Key，所以填 no_api_key。EMBEDDING_API_BASE 留空，不要填 Ollama 地址；BGE 由 MimirQ 进程直接加载。

### 6.2 设置页填写

在“设置 → 模型接入 → 向量模型 → 本地 Embedding”填写：

| 字段 | 填写值 |
|---|---|
| API Key | no_api_key |
| API Base URL | 留空 |
| 模型 | BGE Large ZH v1.5 |
| Temperature | 保持默认；向量模型不使用 |
| Max Tokens | 保持默认；向量模型不使用 |

如果测试连接按钮不可用，不要改回云模型。验证步骤：

1. API 和 Worker 日志没有 embedding 初始化错误。
2. 上传一个中文 Markdown 或 PDF。
3. 等待入库状态成功。
4. 在知识库检索测试中输入原文问题。
5. 确认返回片段有引用，readiness 仍为 200。

可在 API 容器中做维度测试：

~~~bash
docker exec mimirq-api python -c "from app.services.embedding import get_embedding_service; v=get_embedding_service().embed_query('这是中文向量测试'); print(len(v), all(x == x for x in v))"
~~~

预期维度为 1024，且没有 NaN。API 和 Worker 都已经完成过中文向量实测。

### 6.3 共享模型缓存

首次下载模型会消耗网络和磁盘。建议 API 与 Worker 共用持久化 Hugging Face 缓存：

~~~yaml
services:
  mimirq-api:
    environment:
      HF_HOME: /data/model-cache
      TRANSFORMERS_CACHE: /data/model-cache/transformers
    volumes:
      - hf_cache:/data/model-cache
  mimirq-worker:
    environment:
      HF_HOME: /data/model-cache
      TRANSFORMERS_CACHE: /data/model-cache/transformers
    volumes:
      - hf_cache:/data/model-cache

volumes:
  hf_cache:
~~~

模型缓存后，暂时断外网也能继续使用。不要让 API 和 Worker 使用不同 Embedding 模型；如果向量维度改变，必须清理或迁移对应 Milvus 集合后重新入库。

## 7. 设置页总览

设置页共有 15 个分区。只有标为“保存到后端”的配置会影响所有用户；前端偏好保存在当前浏览器。

### 7.1 系统状态

显示 PostgreSQL、Milvus、LLM、Embedding 和解析器状态。

| 状态项 | 正常条件 | 异常处理 |
|---|---|---|
| PostgreSQL | 容器 healthy，数据库可连接 | 查看数据库日志和连接密码 |
| Milvus | healthz 成功 | 检查 etcd、MinIO、Milvus |
| LLM | Ollama OpenAI 兼容接口成功 | 检查 11434、容器路由和模型名 |
| Embedding | BGE 生成 1024 维有限值 | 检查缓存、磁盘和内存 |
| 解析器 | 开关打开且服务可达 | 开关和服务必须同时满足 |

### 7.2 模型接入

三类模型分别是语言模型、向量模型、重排序模型。推荐语言模型用 Ollama，Embedding 用 BGE，重排初期关闭。

本地重排配置：

~~~dotenv
ENABLE_RERANKER=true
RERANKER_PROVIDER=cross_encoder
RERANKER_MODEL=BAAI/bge-reranker-v2-m3
RERANKER_API_KEY=
RERANKER_API_BASE=
RERANKER_TOP_N=20
RERANKER_LOCAL_LOAD_TIMEOUT_SEC=120
~~~

首次下载重排模型时把本地加载超时设为 120 至 600 秒，缓存完成后再调低。

### 7.3 功能开关

初次部署只开 DeepDoc、MarkItDown；KG、Docling、LlamaIndex 和外部解析器按需开。完整开关见第 8 节。

### 7.4 前端偏好

| 字段 | 中文文档建议 |
|---|---|
| 解析方式 | auto；扫描件再选 deepdoc 或 docling |
| 切块策略 | auto；Markdown 选 markdown_outline，法规选 laws_structured，FAQ 选 qa_pairs |

入库管线高级配置只影响当前浏览器的新上传和预览操作，不等于修改服务器 .env。批量导入前先做切块预览。

### 7.5 导航权限

控制普通用户是否看见治理配置、重复内容治理、知识图谱、图谱快照、图谱检索评测、RAGAS 评测、检索消融、数据报告导出和提示词入口。管理员保留全部入口，普通用户只显示对话、历史、知识库、数据集和反馈。导航隐藏不代替后端 RBAC。

### 7.6 高级解析

配置解析器服务地址、超时和参数。地址必须从 API 或 Worker 容器可访问；浏览器能访问不代表容器能访问。

~~~dotenv
DEFAULT_PARSER_BACKEND=auto
DEEPDOC_ENABLED=true
MARKITDOWN_ENABLED=true
DOCLING_ENABLED=false
MAGIC_PDF_ENABLED=false
MINERU_ENABLED=false
~~~

### 7.7 对象存储

Docker 内部 MinIO 填写：

| 字段 | 填写值 |
|---|---|
| 启用 MinIO | 开启 |
| Endpoint | mimirq-minio:9000 |
| Bucket | mimirq |
| Access Key | .env 的 MINIO_ACCESS_KEY_DOCKER |
| Secret Key | .env 的 MINIO_SECRET_KEY_DOCKER |
| 使用 SSL | 关闭，除非 MinIO 已配置 HTTPS |
| 存储文档对象 | 开启 |
| 图片最大字节 | 保持默认；内存压力大时再降低 |

设置页不能把 localhost:9000 填给 Docker 中的 API，正确地址是 mimirq-minio:9000。

### 7.8 RAG 配置

中文文档建议起点：

| 字段 | 建议值 | 作用 |
|---|---:|---|
| 检索 Top K | 8 | 向量候选数 |
| 相似度阈值 | 0.4 | 过滤低相关片段；可调整到 0.5 |
| BM25 | 开启 | 提高编号、术语、条款号召回 |
| 重排序 | 关闭 | 先降低 CPU 延迟 |
| 重排服务 | cross_encoder | 本地 Cross-Encoder |
| 重排数量 | 20 | 候选重排数量 |
| 分块大小 | 1000 | 中文通用起点 |
| 分块重叠 | 150 | 保留跨块上下文 |
| 最小分块长度 | 30 | 丢弃短噪音块 |
| 回答附图 | 按需 | 图表或扫描件使用 |

调整顺序应是解析文本、切块预览、Top K、阈值、重排。不要一开始把阈值设为 0.7。

### 7.9 LTR 模型

LTR 需要训练好的模型文件、manifest 和特征版本。没有本业务题集验证时保持空；普通本地部署使用 Cross-Encoder 即可。

### 7.10 Dify 接入

Dify 外部知识层不是必需项。只有本地部署 Dify 且希望 Dify 把 MimirQ 作为独立检索层时才开启。

| 字段 | 填写方式 |
|---|---|
| 外部知识层 | 有 Dify 工作流时开启 |
| API Keys | 为 Dify 单独生成随机 Bearer Key |
| Tenant ID | Dify 访问的 MimirQ 租户 ID |
| Account ID | Dify 侧账号映射 |
| Dataset 映射 JSON | Dify 数据集 ID 到 MimirQ 数据集 ID |
| Top K 上限 | 不超过 MimirQ 内部上限 |

同一 Docker 网络使用 Compose 服务名；跨机器使用内网地址，不要暴露管理 API。

### 7.11 URL 采集

默认：

~~~dotenv
URL_INGEST_ENABLED=false
URL_INGEST_ALLOW_PRIVATE_IPS=false
URL_INGEST_FOLLOW_REDIRECTS=false
~~~

需要网页导入时才开启，起点为最大下载 50000000 字节、超时 30 秒，并配置出口防火墙和域名允许列表。不要为了采集局域网网页而打开允许私网 IP。

### 7.12 数据治理

中文企业文档可先打开基础清洗：

~~~dotenv
GOVERNANCE_ENABLED=true
GOVERNANCE_REMOVE_TOC_LINES=true
GOVERNANCE_REMOVE_NOISE_LINES=true
GOVERNANCE_UNWRAP_LINES=true
GOVERNANCE_REMOVE_COMMON_LINES=true
GOVERNANCE_PII_ANONYMIZE=true
GOVERNANCE_SECRETS_REDACT=true
GOVERNANCE_QUARANTINE_ON_DROP=true
~~~

首次启用前做治理预览。医疗、财务、合同文档必须保留原文备份，并把清洗文本和隔离记录纳入备份。

### 7.13 行业规则

行业规则可定义术语词库、匹配规则、意图规则和查询改写。示例：

~~~json
{
  "glossary": {
    "统一社会信用代码": ["信用代码", "统一信用代码"],
    "合同相对方": ["对方单位", "乙方"]
  },
  "patterns": [
    {"name": "合同编号", "regex": "合同[编号号]\\s*[:：]?\\s*[A-Za-z0-9-]+"}
  ],
  "intents": [
    {"name": "条款查询", "keywords": ["第几条", "条款", "约定"]}
  ]
}
~~~

保存后用真实问题预览检索表达，确认规则没有错误扩大查询范围。

### 7.14 可观测性

单机低成本配置：

~~~dotenv
LOG_LEVEL=INFO
LOG_FORMAT=json
PROMETHEUS_ENABLED=true
OTEL_ENABLED=false
SENTRY_DSN=
TOOL_CALL_LOG_ENABLED=true
TOOL_CALL_LOG_INCLUDE_PREVIEW=false
AGENT_LOG_ENABLED=true
AGENT_LOG_INCLUDE_EXECUTION_PATH=true
ENABLE_METRICS_LOG=true
~~~

不要把完整文档原文、用户问题或模型输出写入日志。保留 request_id、耗时、状态码、租户、数据集、解析器、模型名称和错误类型。

### 7.15 运行控制

| 选项 | 建议 |
|---|---|
| 断连自动取消 | 开启 |
| 心跳间隔 | 10 秒 |
| 上传去重 | 开启 |
| 对话响应缓存 | 低敏感重复问答开启；敏感数据默认关闭 |
| 缓存时长 | 300 秒起步 |
| 仅缓存无历史对话 | 开启 |
| PII 脱敏 | 开启 |
| 子图编排 | 初期关闭 |

## 8. 11 个功能开关

| 开关 | 依赖 | 本地优先建议 | 启用方法 |
|---|---|---|---|
| KG 知识抽取 | Milvus、LLM | 初期关闭 | KG_ENABLED=true |
| DeepDoc 结构化解析 | API/Worker 内置依赖 | 开启 | DEEPDOC_ENABLED=true |
| Docling 结构化解析 | 较多 CPU 和内存 | 按需 | DOCLING_ENABLED=true |
| ETL4LLM 版面解析 | ETL4LLM API URL | 关闭 | 启动服务后填写 URL |
| Marker 启发式解析 | Marker API URL | 关闭 | 启动服务后填写 URL |
| PaddleOCR-VL 外部解析 | 服务 URL、GPU | GTX 1060 关闭 | 换兼容 GPU 环境 |
| TextIn xParse | API URL、APP ID、Secret Code | 关闭 | 接受商业 API 费用后开启 |
| MarkItDown 文档解析 | 内置依赖 | 开启 | MARKITDOWN_ENABLED=true |
| LlamaIndex 分块 | 内置依赖 | 关闭 | LLAMA_INDEX_ENABLED=true |
| MinerU 解析 | 本地服务或在线 Token | 当前关闭 | 见第 10 节 |
| MagicPDF 本地解析 | magic-pdf 和模型缓存 | 当前关闭 | 准备独立服务后开启 |

第一阶段开关：

~~~dotenv
DEEPDOC_ENABLED=true
MARKITDOWN_ENABLED=true
DOCLING_ENABLED=false
ETL4LLM_ENABLED=false
MARKER_ENABLED=false
PADDLE_VL_ENABLED=false
TEXTIN_ENABLED=false
LLAMA_INDEX_ENABLED=false
MINERU_ENABLED=false
MAGIC_PDF_ENABLED=false
KG_ENABLED=false
~~~

共同规则：先启动外部服务，再打开开关；容器内使用服务名而不是宿主机 localhost；先用 1 至 3 页中文 PDF 验证；关闭开关只影响新任务，已入库文件不会自动重解析。

### 8.1 解析器字段填写表

| 解析器 | 启用开关 | 服务地址或本地字段 | 其他字段 | 本地优先值 |
|---|---|---|---|---|
| DeepDoc | `DEEPDOC_ENABLED` | 不填外部 URL | 印章识别默认关闭 | 开启；扫描件使用 `deepdoc` |
| Docling | `DOCLING_ENABLED` | 不填外部 URL | OCR、表格模式、抽取图片 | 开关关闭；需要时 OCR 开启、表格 `markdown` |
| MarkItDown | `MARKITDOWN_ENABLED` | 不填外部 URL | 插件默认关闭 | 开启；`MARKITDOWN_USE_PLUGINS=false` |
| ETL4LLM | `ETL4LLM_ENABLED` | Docker：`http://mimirq-etl4llm:10001/v1/etl4llm/predict` | 模式 `partition` 或 `text`、超时、强制 OCR、公式、图片 | 关闭；自建服务后填写 |
| Marker | `MARKER_ENABLED` | Docker：`http://mimirq-marker:2080/convert` | 超时 | 关闭；自建服务后填写 |
| PaddleOCR-VL | `PADDLE_VL_ENABLED` | Docker：`http://mimirq-paddlevl:9030/convert` | 超时、设备、模型缓存 | 当前关闭 |
| TextIn | `TEXTIN_ENABLED` | 默认商业 API 地址 | APP ID、Secret Code、解析模式、表格格式、DPI、页数 | 关闭，不填商业密钥 |
| MinerU | `MINERU_ENABLED` | 本地 `http://mimirq-mineru:8000` 或已适配的 API | 后端 `pipeline`/`vlm-http-client`、模型来源、版本、Token | 当前关闭 |
| MagicPDF | `MAGIC_PDF_ENABLED` | 独立服务 `http://mimirq-magicpdf:2095/convert` | method `auto`、语言 `ch`、设备 `cpu`/`cuda`、模型目录、超时 | 当前关闭 |

外部服务地址必须从 API 和 Worker 容器测试；设置页中的 `localhost` 只适合源码直跑，Docker 中应使用上表的 Compose 服务名。TextIn 的 APP ID 和 Secret Code 没有本地替代值，不使用时保持开关关闭和字段为空。

## 9. 核心业务闭环

~~~text
创建数据集
  -> 上传文件
  -> 预检和去重
  -> 选择解析器
  -> 解析文本、表格和图片
  -> 数据治理和隔离
  -> 切块预览
  -> BGE 向量化
  -> 写入 Milvus 和 BM25
  -> 检索测试
  -> 带引用对话
  -> 反馈和回归评测
~~~

### 9.1 对话、历史、反馈

对话使用 LLM 生成回答并召回知识库证据。中文企业文档应要求带引用，证据不足时明确拒答。历史页面可查看消息、引用和 RAG trace。反馈应绑定问题、数据集、引用和模型配置，才能用于回归题集。

### 9.2 数据集、知识库和隔离区

数据集是权限和检索范围的基本单元，应按部门、项目、合同类型或客户隔离。知识库页面管理文档、网页、目录、标签、权限和检索测试。隔离区保存治理丢弃的文本、解析失败文件和待人工确认内容，确认前不要清空。

### 9.3 入库、解析工作台和治理工作台

入库包括上传、预检、解析、治理、切块、向量化、Milvus 写入、BM25 构建和状态收尾。Worker 停止时上传可能成功但任务卡在处理中。解析工作台用于 PDF 页面、版面元素、文本、图片和解析对比；治理工作台用于 Profile、清洗规则、质量指标和隔离结果。

### 9.4 Profile 和切块预览

建议建立 中文通用、法规制度、FAQ、扫描 PDF 四个 Profile。切块预览重点看标题上下文、表格完整性、条款号、日期、金额、相邻块重复和页眉页码噪音。

中文起点：

- 通用：chunk_size=1000、chunk_overlap=150、chunk_min_chars=30
- 标题清晰 Markdown：markdown_outline
- 法规制度：laws_structured
- FAQ：qa_pairs

### 9.5 知识图谱

KG 会调用 LLM 抽取实体、事件和关系，增加任务时间和存储。只有需要跨文档追问关系时才开启。先对小数据集验证：

~~~dotenv
KG_ENABLED=true
KG_CHAT_ENABLED=true
~~~

确认实体、事件、来源文档和删除级联正常后再扩大范围。

### 9.6 RAGAS、回归、报告、Prompt、诊断和审计

RAGAS、检索消融和回归用于评测，不是日常问答必需项。先建立 20 至 50 个中文问题、标准答案和期望文档，再比较切块、Top K、阈值和重排。报告导出质量与运行统计；Prompt 管理提示词和 KG 模板；诊断查看解析质量、召回缺口和相似度分布；用量查看文档数、字符量、Embedding 工作量和缓存命中；审计查看登录、权限、配置和删除操作。

### 9.7 成员、组和 RBAC

成员、组、租户和角色共同决定数据可见范围。创建数据集后，使用普通成员账号验证不能通过检索、URL、Dify 或 API 访问未授权文档。导航隐藏不能替代后端权限。

## 10. MinerU、CUDA 和重型解析器

### 10.1 当前不要直接启用 MinerU

当前宿主机 CUDA 上限约 12.2，尝试的 mineru:latest 基础镜像要求 CUDA 13.0 级别环境；GTX 1060 和驱动 535 也不适合。现有宿主机 MinerU 只有 /parse，MimirQ 需要 /file_parse。所以只改镜像名称不能解决问题，必须同时解决 CUDA、接口适配和服务地址。

当前配置：

~~~dotenv
MINERU_ENABLED=false
DEFAULT_PARSER_BACKEND=auto
~~~

只有以下条件全部满足才启用 MinerU：

1. 使用与显卡、驱动和 CUDA 兼容的固定版本镜像，不使用未验证的 latest。
2. 服务实际暴露 /file_parse，或增加明确的 /parse 到 /file_parse 适配层。
3. API 和 Worker 容器能访问该服务。
4. 用中文扫描 PDF 完成解析、切块、向量化和带引用问答闭环。

### 10.2 PaddleOCR-VL

PaddleOCR-VL 需要独立服务和显存。GTX 1060 6GB 不适合默认高显存配置，当前关闭。功能开关可见不代表硬件满足条件。

### 10.3 MagicPDF

MagicPDF 需要 magic-pdf CLI 或独立服务、模型缓存和匹配设备模式。默认 API/Worker 镜像不一定包含 CLI，本地 CPU 还会显著增加耗时。当前关闭，除非已经准备独立 CPU 服务和模型目录。

## 11. 数据安全、备份、升级和回滚

### 11.1 密钥和访问边界

- .env 只保存在服务器，权限设为 600。
- GitHub 只提交 .env.example，不能提交真实 .env。
- Ollama、PostgreSQL、Milvus、MinIO 管理端口只绑定内网或本机。
- 首次管理员创建成功后，移除 INITIAL_ADMIN_PASSWORD 和 INITIAL_REGISTRATION_TOKEN。
- Ollama 没有适合公网的多租户鉴权，不要公开 11434。

### 11.2 PII、Secret 和删除

医疗、财务、合同文档先在治理预览中确认脱敏规则，再写入向量库。删除用户或文档时，检查 PostgreSQL 元数据、MinIO 对象、Milvus 向量、BM25、KG 实体事件和缓存是否全部级联处理。先用安全预演查看影响范围，再执行删除，不要直接手工删数据库表。

### 11.3 备份范围

至少备份 PostgreSQL、MinIO mimirq bucket、Milvus、etcd、上传目录、加密后的 .env、本地模型缓存、LTR 模型和治理规则。备份前暂停大批量入库，记录 Git 提交哈希和镜像标签。

### 11.4 升级

~~~bash
cd /home/fox/MimirQ
git fetch --all --prune
git pull --ff-only
cd docker
docker compose --env-file ../.env pull
docker compose --env-file ../.env -f docker-compose.yml -f docker-compose.web.yml up -d --build
~~~

升级后检查 readiness、Worker、Milvus、MinIO 和一条中文问答。不要自动删除命名卷。

## 12. 常见故障

### 前端打不开

~~~bash
docker compose --env-file ../.env ps web mimirq-api
docker compose --env-file ../.env logs --tail=200 web
~~~

确认宿主机 3000 未被占用、Web healthy、API readiness 为 200，并访问 http://服务器:3000/。

### API 访问到了 MinerU

宿主机 8000 是 MinerU 时，把 MimirQ 根 .env 的 BACKEND_PORT 设为 18000，然后始终使用 --env-file ../.env 重建 API。

### readiness 503 或 MinIO 认证失败

检查 MINIO_ACCESS_KEY_DOCKER、MINIO_SECRET_KEY_DOCKER、MINIO_ACCESS_KEY、MINIO_SECRET_KEY 是否与实际容器一致。Compose、Milvus 和 API 必须使用同一套内部凭据。

### Ollama 超时

~~~bash
docker exec mimirq-api getent hosts host.docker.internal
docker exec mimirq-api curl -fsS http://host.docker.internal:11434/api/tags
~~~

如果主机名不存在，添加 extra_hosts；如果解析存在但超时，检查 Ollama 监听地址和宿主机防火墙。不要在容器配置中填写 127.0.0.1:11434。

### BGE 下载失败或内存不足

检查磁盘、代理、模型缓存和日志。先停止批量入库，确认 API 能生成一条 1024 维向量，再恢复任务。更换向量模型后必须重新建立对应 Milvus 集合，不能混写不同维度。

### 文档入库一直处理中

~~~bash
docker compose --env-file ../.env ps mimirq-redis mimirq-worker
docker compose --env-file ../.env logs --tail=300 mimirq-worker
~~~

检查 Redis、Worker、解析器 URL 和文件权限。任务失败时查看死信和错误原因，不要盲目重复上传同一文件。

### 检索结果不相关

1. 确认解析文本正确。
2. 查看切块预览。
3. 开启 BM25。
4. 把 Top K 从 8 调到 10 或 12。
5. 将阈值从 0.4 调到 0.5，按数据集分布调整。
6. 仍然排序不稳时开启本地 Reranker。

### 引用为空或回答编造

确认 LLM、Embedding、Milvus、BM25 和 Worker 健康。可开启拒答保护：

~~~dotenv
RAG_ABSTAIN_ENABLED=true
RAG_ABSTAIN_MIN_CITATIONS=1
RAG_ABSTAIN_MIN_TOP_RELEVANCE_SCORE=0.4
~~~

低证据问题返回“证据不足”是预期行为。

## 13. 最终验收清单

- [ ] 浏览器可以打开 http://服务器:3000/。
- [ ] API 文档是 http://服务器:18000/docs，不是宿主机 MinerU 的 8000。
- [ ] API、Worker、PostgreSQL、Redis、Milvus、MinIO healthy。
- [ ] /api/v1/health/ready 返回 HTTP 200。
- [ ] Ollama 返回 qwen3:8b，API 容器可以访问 11434。
- [ ] Embedding 为 local、BAAI/bge-large-zh-v1.5、no_api_key、空 Base URL。
- [ ] API 和 Worker 都能生成 1024 维中文向量。
- [ ] MinIO Endpoint 为 mimirq-minio:9000。
- [ ] 中文 Markdown 完成上传、解析、切块、向量化和引用问答。
- [ ] 中文 PDF 完成解析、切块、向量化和引用问答。
- [ ] BM25 已开启，编号和专有名词可以召回。
- [ ] URL 采集、TextIn、PaddleOCR-VL、MinerU、MagicPDF 保持关闭，除非条件满足。
- [ ] .env、模型缓存和数据库备份没有提交到 GitHub。
- [ ] 普通成员无法访问未授权数据集。
- [ ] 删除测试文档后没有可见残留数据。

## 14. 最省钱推荐开关矩阵

| 模块 | 初次部署 | 基础问答稳定后 | 有明确需求时 |
|---|---|---|---|
| Ollama qwen3:8b | 开启 | 开启 | 根据质量升级更大本地模型 |
| BGE Large ZH v1.5 | 开启 | 开启 | 评测证明不足才换模型 |
| Milvus、PostgreSQL、Redis、MinIO | 开启 | 开启 | 不替换为云服务 |
| DeepDoc | 开启 | 开启 | 扫描件增加测试 |
| MarkItDown | 开启 | 开启 | Office/表格优先使用 |
| Docling | 关闭 | 按需开启 | 复杂表格和版面启用 |
| BM25 | 开启 | 开启 | 不建议关闭中文关键词通道 |
| Reranker | 关闭 | 按评测开启 | 使用本地 Cross-Encoder |
| KG | 关闭 | 按关系检索需求开启 | 先对小数据集运行 |
| LlamaIndex | 关闭 | 按切块需求开启 | 只为特定策略开启 |
| MinerU | 关闭 | 保持关闭 | CUDA 和 /file_parse 适配后再开 |
| PaddleOCR-VL | 关闭 | 保持关闭 | 换兼容 GPU 服务器再开 |
| MagicPDF | 关闭 | 按需 | 准备服务和模型缓存后再开 |
| ETL4LLM、Marker | 关闭 | 按需 | 启动对应 profile 后再开 |
| TextIn | 关闭 | 保持关闭 | 接受商业 API 费用才开 |
| URL 采集 | 关闭 | 按需 | 配置允许列表和出口防火墙 |
| Dify | 关闭 | 按需 | 本地 Dify 有工作流需求时开 |
| RAGAS、消融、回归 | 关闭 | 小规模开启 | 使用固定中文题集 |
| Prometheus | 开启 | 开启 | 需要长期监控时保留 |
| OTel、Sentry、Phoenix | 关闭 | 按需 | 有可观测性后端时再开 |

按这套矩阵运行，日常成本主要是服务器电费和磁盘，不会因为每次对话、向量化或普通文档解析向第三方平台产生 API 费用。性能不足时，优先增加 CPU/内存、调整并发和缓存，再考虑购买云模型或更换 GPU。
