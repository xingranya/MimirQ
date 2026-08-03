<div align="center">

<img src="./web/public/brand/seewayk-logo-wide.png" alt="SEEWAY 见外" width="300"/>

# 见外传媒知识库

**让分散在文档里的知识，成为可检索、可验证、可持续运营的企业能力。**

面向企业知识运营、智能问答与业务应用集成的一体化知识平台。  
从资料入库、解析治理到检索生成、引用追溯与质量评测，让每一份知识都有来源，让每一次回答都有依据。

<p>
  <a href="#让知识真正进入业务"><b>产品价值</b></a> ·
  <a href="#从文档到可信答案"><b>业务闭环</b></a> ·
  <a href="#核心能力"><b>核心能力</b></a> ·
  <a href="#产品界面"><b>产品界面</b></a> ·
  <a href="#快速体验"><b>快速体验</b></a>
</p>

<p>
  <a href="https://www.apache.org/licenses/LICENSE-2.0"><img src="https://img.shields.io/badge/License-Apache_2.0-2563EB.svg" alt="Apache License 2.0"/></a>
  <a href="./docs/releases/v1.0.1.md"><img src="https://img.shields.io/badge/Release-v1.0.1-111827.svg" alt="v1.0.1"/></a>
  <img src="https://img.shields.io/badge/Private_Deployment-Ready-0F766E.svg" alt="支持私有化部署"/>
  <img src="https://img.shields.io/badge/Language-中文优先-DC2626.svg" alt="中文优先"/>
</p>

</div>

---

## 让知识真正进入业务

企业拥有大量文档，却常常缺少一套让知识持续发挥价值的机制：资料分散在不同系统，复杂版式难以准确解析，检索结果无法解释，回答质量也缺少稳定的验收标准。

**见外传媒知识库不只是一个问答入口，而是一套完整的企业知识运营工作台。**

它把文档处理、数据治理、知识检索、智能回答和质量回归连接成清晰的业务链路，让团队可以回答三个关键问题：

- **知识从哪里来**：来源、版本、权限和处理记录完整留痕。
- **答案为什么可信**：回答可以回到具体文档、页码和原文证据。
- **效果如何持续提升**：解析、切块、召回、重排和生成均可检查、评测与优化。

| 业务价值 | 带来的改变 |
|:---|:---|
| **统一知识入口** | 将分散资料沉淀为可搜索、可问答、可复用的组织知识资产 |
| **降低信息确认成本** | 从“人工翻找文档”转向“答案与证据同时呈现” |
| **建立质量标准** | 用固定题集、检索指标和引用覆盖率衡量知识服务质量 |
| **守住数据边界** | 通过数据集权限、文档 ACL、角色管理和私有化部署控制访问范围 |
| **连接现有业务** | 通过 API 与 Dify 外部知识库能力接入已有应用和工作流 |

## 从文档到可信答案

见外传媒知识库围绕企业知识的完整生命周期设计，所有关键环节都可以被看见、被管理、被验证。

```text
资料接入 → 智能解析 → 清洗治理 → 业务切块 → 混合检索 → 重排生成 → 引用追溯 → 质量回归
```

| 阶段 | 平台能力 | 业务结果 |
|:---|:---|:---|
| **资料接入** | 文件上传、URL 导入、连接器、批量任务 | 将多来源内容集中进入统一知识空间 |
| **解析与治理** | OCR、版面与表格解析、规则清洗、质量检测、隔离审核 | 减少脏数据和错误结构对后续问答的影响 |
| **切块与索引** | 章节、语义、父子等多类策略，支持预览与版本管理 | 让知识单元更符合真实业务语义 |
| **检索与生成** | 向量、全文、稀疏检索与多路融合重排 | 在正确的数据范围内找到更相关的证据 |
| **引用与评测** | 来源引用、检索 Trace、Golden 题集与回归指标 | 让结果可以验收，让优化有据可依 |

## 核心能力

### 企业级文档处理

支持 PDF、Office、图片、网页与结构化文本等常见资料类型，并可按文档特征选择 DeepDoc、MinerU、Marker、PaddleOCR-VL 等解析后端。面对扫描件、表格、公式和复杂版式，不必把所有内容强行交给同一种处理方式。

### 可运营的数据治理

知识入库不是一次性上传。平台提供质量检测、清洗规则、治理画像、异常隔离、文档版本和重新处理能力，帮助运营人员持续维护知识资产，而不是在回答出错后重新开始。

### 面向中文场景的混合检索

以向量检索和 BM25 为基础，可组合稀疏检索、融合排序与多类重排器。运营人员可以查看候选片段、得分、检索通道和 Trace，快速判断问题发生在数据范围、召回还是排序阶段。

### 带证据的智能问答

回答与来源证据在同一会话中呈现，并保留数据集范围、引用片段和历史记录。使用者得到的不只是一段生成文本，还能继续核对原始材料。

### 可回归的质量评测

通过 Golden 题集、Recall、MRR、RAGAS、运行记录和对比报告建立发布门禁。每次调整解析器、切块策略、Embedding 或重排配置后，都可以用同一套标准重新验证。

### 组织权限与运行保障

支持多租户、RBAC、数据集访问范围、文档级 ACL、审计、SSO / SAML / SCIM 接入能力，并提供任务监控、依赖检查和可观测性入口，满足从团队试用到企业部署的不同阶段。

> 当前仓库已覆盖 30 个解析后端、86 种切块策略和 13 类重排器。能力数量用于说明可组合范围，实际项目应根据资料类型、质量目标和基础设施条件选择最合适的链路。

## 适用场景

| 场景 | 典型资料 | 可以解决的问题 |
|:---|:---|:---|
| **企业内部知识助手** | 制度、流程、培训资料、项目文档 | 为员工提供统一、可追溯的知识入口 |
| **传媒内容知识中枢** | 选题资料、采访记录、历史稿件、品牌规范 | 提升内容检索、资料复用和事实核验效率 |
| **政策与公共服务问答** | 政策文件、办事指南、区域资料 | 在明确知识范围内提供带依据的答案 |
| **客户服务与业务支持** | 产品手册、服务标准、常见问题 | 缩短查找时间，统一对外答复口径 |
| **研发与项目知识沉淀** | 技术文档、接口说明、复盘记录 | 减少重复沟通，让项目经验持续复用 |

## 产品界面

界面围绕“操作清晰、状态明确、证据可查”设计。知识运营、问答使用和系统管理各自聚焦当前任务，高级能力按需展开。

<table>
  <tr>
    <td width="50%" align="center">
      <img src="./docs/images/screenshots/dataset-management.png" alt="见外传媒知识库的数据集管理界面" width="100%"/>
      <br/><strong>知识库管理</strong>
      <br/><sub>统一查看数据集、文档、知识单元、权限范围与处理状态。</sub>
    </td>
    <td width="50%" align="center">
      <img src="./docs/images/screenshots/data-governance.png" alt="见外传媒知识库的数据治理界面" width="100%"/>
      <br/><strong>数据治理</strong>
      <br/><sub>在同一工作台完成预览、质量检测、清洗、标注和异常处理。</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="./docs/images/screenshots/knowledge-graph.png" alt="见外传媒知识库的知识图谱界面" width="100%"/>
      <br/><strong>知识图谱</strong>
      <br/><sub>探索实体、事件与关系，辅助发现跨文档的知识联系。</sub>
    </td>
    <td width="50%" align="center">
      <img src="./docs/images/screenshots/rag-evaluation.png" alt="见外传媒知识库的质量评测界面" width="100%"/>
      <br/><strong>质量评测</strong>
      <br/><sub>使用标准问答、检索指标和运行记录持续验证效果。</sub>
    </td>
  </tr>
</table>

更多完整操作界面与使用路径见[全流程操作指南](./docs/user_guide.md)。

## 真实验证，不只展示功能

平台已经在固定 800 题、真实自托管模型和多知识库场景下完成完整复测。以下为 2026-07-27 的检索直连结果：

| 成功执行 | 准确 | 部分准确 | 证据不足 | 准确率 | 证据覆盖率 |
|---:|---:|---:|---:|---:|---:|
| **800 / 800** | **791** | **9** | **0** | **98.9%** | **99.5%** |

该结果用于验证指定数据、模型与配置下的知识链路，不代表所有业务场景的固定效果。测试方法、完整指标、Dify 接入对照和历史复测记录见[真实场景验证报告](./docs/benchmarks/changzhou_dify.md)。

## 为企业环境而设计

- **可以私有化部署**：数据、模型服务和基础设施可以保留在自有环境中。
- **可以按需组合**：支持 OpenAI 兼容模型服务，也可接入本地 LLM、Embedding 与 Reranker。
- **可以从小规模开始**：轻量模式使用 Chroma / FAISS，标准模式使用 Milvus、PostgreSQL、Redis 与 MinIO。
- **可以接入现有应用**：提供 REST API，并兼容 Dify External Knowledge API 与 Workflow HTTP 节点。
- **可以持续运维**：支持 Docker Compose、Helm / Kubernetes、健康检查、指标监控和后台任务。

### 技术底座

| 层级 | 主要技术 |
|:---|:---|
| Web | Next.js、React、TypeScript、Tailwind CSS |
| API 与任务 | FastAPI、Python、Redis Worker |
| AI 编排 | LangChain、LangGraph、OpenAI 兼容接口 |
| 数据与检索 | PostgreSQL、Milvus / Chroma / FAISS、BM25、MinIO |
| 部署与运维 | Docker Compose、Helm、Prometheus 生态 |

## 快速体验

### 环境要求

- Docker 20.10+ 与 Docker Compose 2.0+
- GNU Make
- 推荐至少 4 核 CPU、16 GB 内存和 50 GB 可用磁盘

### 启动完整 Web 版本

```bash
git clone --depth 1 --single-branch https://github.com/xingranya/MimirQ.git seeway-knowledge-base
cd seeway-knowledge-base
make init
```

编辑 `.env`，至少填写可用的模型地址和模型名。云端服务需要真实密钥，本地免鉴权的 OpenAI 兼容服务可以将密钥留空：

```dotenv
LLM_API_BASE=https://api.example.com/v1
LLM_API_KEY=<your-api-key>
LLM_MODEL=<your-model>
```

如 LLM、Embedding 和 Reranker 使用不同服务，请分别配置对应的 Base URL、API Key 与模型名。随后启动并检查服务：

```bash
make up-web
make api-ping
```

启动完成后访问：

| 服务 | 地址 |
|:---|:---|
| **Web 工作台** | [http://localhost:3000](http://localhost:3000) |
| **API 文档** | [http://localhost:8000/docs](http://localhost:8000/docs) |

`make init` 只会创建缺失的 `.env` 和 `web/.env.local`，不会覆盖已有配置。首次管理员、独立模型服务和生产凭据配置见[模型服务与首次管理员配置](./docs/guides/model_services.md)。

### 选择部署方式

| 方式 | 命令或入口 | 适合场景 |
|:---|:---|:---|
| **完整 Web 栈** | `make up-web` | 首次体验、团队试用、服务器部署 |
| **轻量模式** | `make up-lite` | 低资源环境、API 最小闭环验证 |
| **源码开发** | `make setup-host` | 前后端开发与热更新调试 |
| **Helm / Kubernetes** | [部署文档](./docs/deployment/helm.md) | 集群化生产部署 |

> 更换 Embedding 模型、供应商或向量维度后，必须重建已有知识库索引。生产部署前请完成密钥、跨域、存储、备份、监控和权限配置检查。

### 源码开发（Python venv + pip + pnpm）

首次准备本地开发环境后，分别打开两个终端启动 API 与 Web：

```bash
make setup-host
make backend
make web
```

需要处理异步入库任务时，再运行 `make worker`；可通过 `make worker-check` 检查 Worker 是否正常发布健康状态。完整开发流程见[快速入门](./docs/quickstart.md)。

### 可选解析服务

解析器按资料类型和部署资源选择，不需要全部启动：

| 解析器 | 启动命令 |
|:---|:---|
| ETL4LLM | `make up-etl4llm` |
| Marker | `make up-marker` |
| PaddleOCR-VL | `make up-paddlevl` |
| MinerU Pipeline | `make up-mineru` |
| MinerU VLM | `make up-mineru-vlm` |
| olmOCR | `make up-olmocr` |
| Magic-PDF | `make up-magicpdf` |
| 百度千帆 OCR | `make up-qianfanocr` |

使用 MinerU 云端 API 时只需在 `.env` 配置令牌和云端地址，不要启动本地 MinerU Compose 服务。

### 停止和清理

- `make down`：停止本项目容器，保留数据卷和镜像。
- `make docker-reset`：停止容器并删除本项目数据卷，用于重新初始化数据。
- `make docker-purge`：停止容器并删除本项目数据卷及镜像，用于彻底重建。

涉及数据删除前请先完成备份。项目隔离、升级、备份和清理边界见[Docker Compose 部署指南](./docs/deployment/docker_compose.md)。

## 文档中心

| 文档 | 内容 |
|:---|:---|
| [完整操作指南](./docs/user_guide.md) | 从首次登录到知识库运营、评测与生产运维 |
| [快速入门](./docs/quickstart.md) | 本地开发、模型配置和常用命令 |
| [Docker Compose 部署指南](./docs/deployment/docker_compose.md) | 容器部署、升级、备份与安全清理 |
| [运维手册](./docs/deployment/runbook.md) | 健康检查、监控、故障定位和恢复 |
| [企业知识流水线设计准则](./docs/guides/rag_platform_design_principles.md) | 解析、治理、检索与回归的设计方法 |
| [Dify 集成与验证](./docs/benchmarks/changzhou_dify.md) | External Knowledge API、HTTP 节点与实测记录 |
| [v1.0.1 发布说明](./docs/releases/v1.0.1.md) | 当前稳定版本的重要变更 |

## 开源与合作

见外传媒知识库基于开放技术生态构建，项目采用 [Apache License 2.0](./LICENSE) 开源。欢迎通过 [GitHub Issues](https://github.com/xingranya/MimirQ/issues) 提交问题、业务需求和改进建议；参与开发前请阅读[贡献指南](./.github/CONTRIBUTING.md)。

第三方组件和模型权重的归属声明见 [NOTICE](./NOTICE)。默认 PDF 解析路径可能使用采用 AGPL-3.0 / 商业双授权的 PyMuPDF；用于 SaaS 或商业交付前，请根据实际组合方式完成许可证评估，或选择 pypdf、pdfplumber 等其他解析后端。

---

<div align="center">

**SEEWAY 见外 · 让知识可见，让答案可信。**

</div>
