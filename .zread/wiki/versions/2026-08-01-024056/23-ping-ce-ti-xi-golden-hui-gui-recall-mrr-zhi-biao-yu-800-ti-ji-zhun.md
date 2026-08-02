MimirQ 的评测体系由三个互补的层次构成：**离线 Golden 回归**（以人工核验的固定题集驱动、以阈值门禁收口）、**确定性检索指标**（Recall/MRR/NDCG/Hit@K 等不依赖 LLM 的可复现度量）、以及**真实业务 800 题基准**（常州政务固定题集的多链路横评）。三者共享同一套数据模型与"case bundle → regression run → threshold gate"的执行范式，但服务于不同目标：Golden 回归负责版本迭代的可回归性，检索指标负责定位劣化维度，800 题基准负责面向真实业务场景的最终验收。

```mermaid
flowchart TD
    A[评测数据资产] --> B[Golden 回归 gate]
    A --> C[检索指标度量]
    A --> D[800 题业务基准]
    
    B --> B1[case bundle 导入<br/>mimirq.regression_cases.v1]
    B1 --> B2[regression run<br/>ragas_regression_runs]
    B2 --> B3[阈值门禁<br/>check_thresholds]
    B3 --> B4[门禁报告<br/>mimirq.regression_gate_report.v1]
    
    C --> C1[确定性指标<br/>recall/mrr/ndcg/hit@k]
    C --> C2[LLM 指标<br/>RAGAS faithfulness 等]
    
    D --> D1[常州政务 800 题]
    D1 --> D2[五链路横评]
    D1 --> D3[可公开复现基准<br/>MIRACL zh / CFeVER]
```

## 数据模型：回归运行的载体

评测体系的核心持久化载体是四张 SQLAlchemy 模型表，定义在 `app/models/evaluation.py`：`RagasEvaluationRun`/`RagasEvaluationItem` 承载对话级 RAGAS 评估，`RagasRegressionCase` 存储固定题集（question、expected_answer、reference_sources 人工核验证据指针），`RagasRegressionRun`/`RagasRegressionItem` 记录一次回归执行的参数快照、逐题得分与聚合 summary。`RagasRegressionCase.reference_sources` 是 Golden 题集的"标准答案"载体——每个条目携带 document_id + chunk_id 等证据指针，后续所有 Recall/MRR 计算都以它作为 gold 集合。一次回归运行是幂等的、可追溯的：`params` 记录检索配置快照，`summary` 记录聚合指标，`status` 走 `pending → running → completed|failed` 生命周期。

Sources: [evaluation.py](app/models/evaluation.py#L37-L135)

围绕这组模型，`app/api/v1/evaluations.py` 暴露了完整的回归 API 面：cases 的增删改查、批量导入、导出与合成 hardcase 生成；runs 的创建、列表、详情、leaderboard、diff、export-bundle 与 purge。其中 `/ragas/regression/runs/leaderboard` 支持按 `retrieval_mrr` 等 summary 指标排序比较不同运行，`/runs/{run_id}/diff` 提供两次运行的逐指标差异对比——这构成了版本 A/B 对比的基础设施。

Sources: [evaluations.py](app/api/v1/evaluations.py#L1238-L1440), [regression_leaderboard.py](app/services/regression_leaderboard.py#L140-L160)

## Golden 回归：从题集导入到阈值门禁

Golden 回归的端到端流程由 `scripts/regression_gate.py`（1794 行）实现，作为 CI 的离线门禁。其工作流是：**导入 case bundle → 启动回归运行 → 轮询完成 → 对比阈值 → 产出报告**。Case bundle 支持三种输入形态：带 schema 的导出包 `{"schema":"mimirq.regression_cases.v1","dataset_id":...,"items":[...]}`、最小 bundle、以及旧版数组形态；多 dataset 混合的 bundle 会被拒绝。导入时有一个关键防护：`review_only` 的本地样本（`reference_source_mode=local_sample_synthetic`）不允许导入，防止把未索引的合成 Golden 混入真实题集。

Sources: [regression_gate.py](scripts/regression_gate.py#L46-L107)

回归运行通过 `build_run_create_request_payload` 构造 `POST /evaluations/ragas/regression/runs` 的请求体，支持 30+ 个检索覆盖参数（retrieval_profile、top_k、retrieval_mode、alpha、fusion 策略、reranker 配置等），这意味着同一题集可以在不同检索配置下反复运行，形成策略对比矩阵。运行创建后脚本以 `poll_sec` 间隔轮询详情直至 `completed|failed`，随后拉取完整 items 进行指标核对。

Sources: [regression_gate.py](scripts/regression_gate.py#L155-L184), [regression_gate.py](scripts/regression_gate.py#L1577-L1650)

阈值门禁的核心是 `check_thresholds`：对 summary 中的每个指标施加 `{min?, max?}` 边界，并支持按维度切片（file_type、language 等）的逐桶阈值。阈值配置兼容两代格式：v1 的扁平 `{"retrieval_recall": 0.3}`，以及 v2 的结构化 `{"schema":"mimirq.thresholds.v2","metrics":{...},"slices":{...}}`。`generate_thresholds_from_summary` 支持从一次基线运行的 summary 自动生成阈值——对每个指标取 `baseline - max(rel_drop*baseline, abs_slack)` 作为 min（abstain_rate 取 max），并跳过样本数不足的切片桶。更严格的是 `case_source` 溯源绑定：阈值文件可钉住产生基线的 plugin Golden 来源（plugin_ref、plugin_version、plugin_package_hash），当前运行的来源必须逐字段匹配，否则门禁直接失败——这防止把 A 版本的基线阈值误用到 B 版本的题集上。

Sources: [regression_gate.py](scripts/regression_gate.py#L846-L919), [regression_gate.py](scripts/regression_gate.py#L1012-L1110), [regression_gate.py](scripts/regression_gate.py#L934-L999)

最终报告以 `mimirq.regression_gate_report.v1` schema 输出 JSON 与 Markdown 双格式，包含 gate_status、summary 指标表、通道归因（vector/bm25/lexical/sparse/multi-channel 各贡献多少 citations）、多跳诊断、以及可选的 query-set health 对比段。`regression_gate.py` 还内置了 query-set health 快照 diff：对比基线快照与当前快照的 hit@k、mrr、ndcg、P95 延迟与 miss rate 变化，按 `warn|fail` 策略决定是否阻断。

Sources: [regression_gate.py](scripts/regression_gate.py#L683-L845)

## Recall / MRR / NDCG / Hit@K 指标体系

检索质量的确定性指标在 `app/rag/evaluation/regression_sample_builder.py` 中统一计算，核心逻辑是：以 case 的 `reference_sources` 为 gold 集合，以按序排列的 citations 为系统输出，逐项比对 chunk_id、稳定引用键、record identity、语义键与 quote 签名五种匹配方式。基于此派生出一整族指标：

| 指标 | 定义 | 说明 |
|---|---|---|
| `retrieval_recall` | 命中的 reference_sources 数 / 总数 | 与 `citation_coverage` 同值 |
| `retrieval_mrr` | 首个命中 citation 的倒数排名 | 无命中则为 0 |
| `retrieval_ndcg_at_10/20` | 二进制相关性的 DCG/IDCG | IDCG 取 min(k, ref_total) |
| `retrieval_hit_at_1/3/5/10/20` | 前 K 内是否至少命中一个 gold | 布尔指标 |
| `retrieval_doc_recall` | 唯一命中文档数 / 唯一 gold 文档数 | 文档级召回 |
| `retrieval_family_recall` | 唯一命中 family 数 / gold family 数 | 层级折叠后的召回 |
| `citation_accuracy` | 命中 citations / 总 citations | 衡量噪声 |

Sources: [regression_sample_builder.py](app/rag/evaluation/regression_sample_builder.py#L662-L780)

这套指标被注册为"确定性回归指标"（不依赖 LLM、完全可复现），与 RAGAS 的 LLM 指标在 `app/rag/evaluation/ragas.py` 中通过 `DETERMINISTIC_REGRESSION_METRICS` 集合区分。确定性集合还包括 `faithfulness_det`（原子声明支持率）、`hallucination_rate`、`quote_verifiability`、`chunk_utilization`、`multihop_path_completeness` 等 28 个指标——它们与检索指标共用同一套逐题 meta 计算管线 `build_regression_item_meta`，从而保证检索质量与生成质量可以在同一次运行中一起度量。

Sources: [ragas.py](app/rag/evaluation/ragas.py#L96-L158)

针对"只测检索、不跑 LLM"的场景，`evidence_retrieve_gate.py` 提供了独立于 LangGraph 检索节点的轻量度量路径：`compute_retrieval_item_meta` 从 `reference_sources vs citations` 计算同样的指标族，并额外派生出 `must_recall_passed`（retrieval_recall ≥ 0.9999 时视为通过）与证据胶囊完整性校验。`build_retrieval_gate_summary` 聚合出 `must_recall_pass_rate`、`provenance_integrity_rate` 等门禁指标，配套的 `scripts/must_recall_provenance_gate.py` 可对单次运行的 JSON 做一次性 must-recall 与溯源完整性门禁。

Sources: [evidence_retrieve_gate.py](app/rag/evaluation/evidence_retrieve_gate.py#L36-L116), [evidence_retrieve_gate.py](app/rag/evaluation/evidence_retrieve_gate.py#L162-L270), [must_recall_provenance_gate.py](scripts/must_recall_provenance_gate.py#L140-L260)

## 800 题基准：常州政务真实评测

"800 题基准"指常州政务服务知识库的固定 800 题评测集，完整口径与历史结果归档在 `docs/benchmarks/changzhou_dify.md`。该基准以人工核验的 Golden 题集（`plugins/pipelines/changzhou-gov-service-knowledge/golden_eval_cases.json` 的 13 道精选题 + `human_mixed_eval_cases.json` 的 100 道人机混合题）为种子，由 `scripts/changzhou_gov_eval_pack.py` 从原始语料构建大规模评测包（默认输出 `artifacts/changzhou_eval_pack_1000`），包含 benchmark cases、truth manifest 与 regression bundle 三种产物。

Sources: [changzhou_dify.md](docs/benchmarks/changzhou_dify.md#L5-L57), [golden_eval_cases.json](plugins/pipelines/changzhou-gov-service-knowledge/golden_eval_cases.json#L1-L40), [changzhou_gov_eval_pack.py](scripts/changzhou_gov_eval_pack.py#L1-L80)

评分采用**确定性证据条款匹配**而非 LLM judge：`scripts/changzhou_gov_golden_eval.py` 对每题检查 title_contains/content_contains/metadata（gov_knowledge_type、knowledge_section、district、service_name 等多层元数据）与 answer_key_points（办理地点、咨询方式、收费情况等必答条款），输出"准确 / 部分准确 / 证据不足"三态判定与 key_point_recall、effective_context_rate、noise_rate 等细粒度指标。2026-07-27 的最新结论是：MimirQ 检索核心（无 LLM 生成）为 791 题准确、9 题部分准确、0 题证据不足（98.9% 准确率、99.5% 证据条款覆盖），真实三模型生成链路为 727/73/0；而 Dify 原生知识库仅 38.6% 准确率且错误证据率高达 79.3%——报告据此定位主要质量损失在 Dify 生成编排而非 MimirQ 召回。

Sources: [changzhou_gov_golden_eval.py](scripts/changzhou_gov_golden_eval.py#L297-L496), [changzhou_dify.md](docs/benchmarks/changzhou_dify.md#L5-L17)

800 题基准的多次复测（2026-07-21 至 07-27）沉淀了可复用的评测纪律：每次运行记录输入 SHA-256 与 artifact 清单、以固定并发从固定题集完整执行且不复用历史答案、分链路记录成功/失败/重试明细。除常州业务题集外，仓库还提供**可公开复现**的检索基准：`scripts/seed_public_bench_miracl_zh_pool.py` 构建 MIRACL 中文语料池（默认 20 万 passage），`scripts/seed_public_bench_cfever_dev.py` 构建 CFeVER dev 题集，配合 `docs/guides/public_benchmarks_zh.md` 提供无生产数据依赖的复现路径。

Sources: [seed_public_bench_miracl_zh_pool.py](scripts/seed_public_bench_miracl_zh_pool.py#L344-L410), [seed_public_bench_miracl_zh_pool.py](scripts/seed_public_bench_miracl_zh_pool.py#L622-L642), [public_benchmarks_zh.md](docs/guides/public_benchmarks_zh.md#L1-L30)

## CI 有界门禁与样本基准

为了让评测在 CI 中可重复、无外部依赖，仓库内置了确定性的样本夹具与门禁配置。`data/sample/retrieval_fixture_v1.json` 定义了 5 个文档、5 个查询的最小检索夹具（Kubernetes、PostgreSQL、Redis、RRF、MMR 主题），每个查询带 `expected_chunk_ids`。`scripts/run_sample_retrieval_benchmark.py` 在内存向量库 + 进程内 BM25 的确定性环境下运行该夹具，输出 hit@k、MRR（reciprocal_rank）、NDCG@k 以及 family 级指标，并记录 fixture_hash 以保证输入可溯源。

Sources: [retrieval_fixture_v1.json](data/sample/retrieval_fixture_v1.json#L1-L93), [run_sample_retrieval_benchmark.py](scripts/run_sample_retrieval_benchmark.py#L182-L262), [run_sample_retrieval_benchmark.py](scripts/run_sample_retrieval_benchmark.py#L380-L430)

CI 门禁的阈值基线固化在 `ci/retrieval_thresholds.v2.json`：针对 retrieval-only 有界门禁（keyword/hybrid/sparse/ColBERT 四种检索模式），hit@k、mrr、ndcg@k 均要求 **min 1.0**（满分通过），abstain_rate 要求 0；同时按 file_type（md/pdf）与 language（en/zh）做切片校验，保证任何检索通道退化都会被门禁捕获。`.github/workflows/rag-quality-gate.yml` 将样本基准运行、质量门产物构建与解析证明扫描串联为一次可手动触发的完整质量门禁。

Sources: [retrieval_thresholds.v2.json](ci/retrieval_thresholds.v2.json#L1-L82), [rag-quality-gate.yml](.github/workflows/rag-quality-gate.yml#L1-L93)

门禁之外，评测问题本身也有标准化的上报通道：`.github/ISSUE_TEMPLATE/retrieval-quality-regression.yml` 要求报告者提供可复现查询、数据集范围、检索 profile、期望/实际 citations 与 benchmark/trace 产物——这把线上发现的检索劣化转化为可进入 Golden 回归题集的候选样本，形成"发现 → 归档 → 回归"的闭环。

Sources: [retrieval-quality-regression.yml](.github/ISSUE_TEMPLATE/retrieval-quality-regression.yml#L1-L77)

## 评测数据资产的持续演进

评测题集本身作为版本化资产管理：`app/rag/evaluation/datasets/schema.py` 定义了统一的样本 schema（query_type、source_type、gold_chunk_ids、expected_route、annotation_status 等字段），stage1 种子集（4 题：factual/multi_hop/structured/unanswerable 各一）覆盖真实日志、人工种子与对抗样本三种来源；stage3 域数据集（finance/legal/support + adversarial 的 hard_negative/pii_trap/prompt_injection）面向垂直领域与安全边界。`contextual_855_plan.py` 规划了 855 题规模的上下文评估集（span 级标注、语义缺失/歧义/结构丢失三条 track），`quarterly_refresh.py` 以稳定哈希实现季度 20% 题集轮换——保证基准既持续更新又不因整体换题而失去纵向可比性。

Sources: [schema.py](app/rag/evaluation/datasets/schema.py#L1-L61), [stage1/manifest.json](app/rag/evaluation/datasets/stage1/manifest.json#L1-L19), [contextual_855_plan.py](app/rag/evaluation/datasets/contextual_855_plan.py#L1-L32), [quarterly_refresh.py](app/rag/evaluation/datasets/quarterly_refresh.py#L1-L79)

## 下一步阅读

评测体系是"可检查、可回归、可治理"理念的量化支撑。建议继续阅读：[CI 质量门禁：检索阈值、解析证明、查询集健康与发布预算策略](24-ci-zhi-liang-men-jin-jian-suo-yu-zhi-jie-xi-zheng-ming-cha-xun-ji-jian-kang-yu-fa-bu-yu-suan-ce-lue) 了解阈值如何在发布流程中落地；[回归套件与证据管理：回归运行、消融实验与证据胶囊](25-hui-gui-tao-jian-yu-zheng-ju-guan-li-hui-gui-yun-xing-xiao-rong-shi-yan-yu-zheng-ju-xiao-nang) 深入回归运行的对比、消融与证据溯源；检索指标的底层实现依赖[混合检索与融合策略：向量、稀疏检索与 RRF 融合](16-hun-he-jian-suo-yu-rong-he-ce-lue-xiang-liang-xi-shu-jian-suo-yu-rrf-rong-he) 与[重排器体系：Cross-Encoder、ColBERT、LTR、MMR 与混合重排](17-zhong-pai-qi-ti-xi-cross-encoder-colbert-ltr-mmr-yu-hun-he-zhong-pai) 的检索管线。