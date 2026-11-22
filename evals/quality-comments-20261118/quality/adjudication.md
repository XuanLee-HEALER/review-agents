# Quality 回放判定

Quality 在 Butlers 原始提交找到 Performance 漏掉的可复现阻断，在 Catalog 找到 Performance 没有报告的诊断遗漏。重复详情和合成目录的硬配额失败由两角色共同发现，按同一根因计一次。证据支持保留 Quality 的独立可靠性审查。将其输出用于阻断仍需要调用方核验触发条件和严重度。[冻结预期](expectations.json) · [逐条原始建议与运行记录](results.json)

| 样本 | Quality 报告 | 与 Performance 的关系 | 冻结根因判定 |
| --- | --- | --- | --- |
| Catalog 原始 | 4 阻断，2 建议 | 重复详情为同根建议。静默漏导为独立建议 | 两项命中 |
| Catalog 性能修复 | 4 阻断，2 建议 | 归档 Performance 报独立串行等待建议，Quality 未报。Quality 仍查出静默漏导 | 重复详情消失，静默漏导保留 |
| Catalog 诊断修复 | 4 阻断，3 建议 | 重复详情仍为建议。该 head 无配对 Performance | 静默漏导消失，重复详情保留 |
| Butlers 原始 | 2 阻断，2 建议 | 同范围 Performance 只报 3 条性能建议。缓存失败为 Quality 独立阻断 | 缓存失败和旧状态文档均命中 |
| Butlers 真实修复 | 2 阻断 | 对照头仅运行 Quality | 缓存异常和文档根因均消失，见其他发现的分项判定 |
| Directory 配额正例 | 1 阻断 | 与归档 Performance 同根阻断 | 命中第 65 次查询耗尽额度，建议保留空输入行为 |
| Directory 正常负对照 | 0 | 与归档 Performance 一致 | 守住逐行分类、16 行上限和 64 次预算 |

## Catalog 逐项核验

| 根因 | 判定与依据 |
| --- | --- |
| 首次外部详情失败被静默丢弃 | 独立且可操作的建议。`scripts/export-tags.js:132–158` 吞掉 HTTP、网络与解析错误，外部标签缺席，周度任务仍使用部分文件。浏览器对应分支记录告警。原始及性能修复的模拟均为 0 条告警，诊断修复为 1 条。 |
| 成功详情再次抓取 | Performance 同根建议。首次成功而第二次失败也丢弃标签，仍可用复用已成功数据这一处改动解决。空默认列表和缺少代表性时延数据支持建议级。 |
| 已报错的部分结果仍可提交 | 诊断修复上的独立相邻建议。告警恢复了诊断，`scripts/export-tags.js:164–178` 仍成功写出部分文件，`.github/workflows/weekly-tag-scan.yml` 以成功退出和新增标签阈值决定是否更新基线。模拟只验证部分输出，CI 后续行为来自源码；这个建议要求传播完整性结果，和恢复告警的修复不同。 |
| 保留旧自定义配置时不再加载 | 三版均报独立阻断。`README.md:30,48–55` 说明部署后仍可编辑配置，模板实例可拣选上游更新。缺字段在 `main.js:765–799,897` 清空组织并跳过加载，在 `scripts/export-tags.js:48–50` 抛错。阻断成立于保留旧配置的升级路径，三版随附配置均包含空列表。 |
| 允许没有 `cardData` 的新增外部条目 | 三版均报独立阻断。新增外部入口未补齐字段，既有 `main.js:500,570,634–643` 会在合格旧条目缺字段时抛异常。一次只读调用确认公开模型详情包含 2022 年的 `createdAt` 且缺少 `cardData`，与官方客户端的可选字段一致。受影响路径是配置外部模型后的列表渲染；未跑浏览器端到端验证。[Hugging Face 字段契约](https://huggingface.co/docs/huggingface_hub/main/en/package_reference/hf_api#huggingface_hub.ModelInfo) · [详情接口](https://huggingface.co/api/models/hf-internal-testing/tiny-random-bert) |
| 新增调用边上的认证范围和外部内容边界 | 模型在三版各报两项阻断。源码支持新增 Hugging Face 导出复用 GitHub 凭据规则的边界缺陷，也支持新配置的组织外仓库数据流入既有未转义模板。凭据发现取决于 URL 命中条件和令牌存在，HTML 风险取决于配置启用与具体远端返回值。记为有依据的条件性风险，未发送真实认证请求，未验证上游内容清洗或在浏览器验证可利用性，排除在已证实阻断计数之外。[Hugging Face 模型卡数据来源](https://huggingface.co/docs/hub/model-cards#model-card-metadata) · [仓库名验证源码](https://github.com/huggingface/huggingface_hub/blob/main/src/huggingface_hub/utils/_validators.py) |
| 浏览器与导出重复实现合并规则 | 两份修复报告各有一条建议。类型过滤、配置 ID 去重与响应合并确实重复，属于可选的小型共用逻辑。不同受支持的配置 ID 归一到同一个响应 ID 的条件尚未证实，不计为已验证的重复卡片缺陷。 |

## Butlers 逐项核验

| 根因 | 判定与依据 |
| --- | --- |
| 首次查询异常被缓存为无账号 | Quality 的独立阻断。`wellness_ingest.py:279–291,331–340` 可复现一次故障变为后续进程级拒收，base 下一次会查询。真实修复只缓存成功结果并保留本次失败的原有拒绝状态，已恢复下次账号校验。Quality 提议改回 `error` 属于额外接口行为选择，修复此根因只需要避免缓存失败。Performance 起草的查询合并建议还要求保留现在的异常处理，不能代替独立核验。 |
| 返回状态说明滞后 | Quality 的独立建议。`roster/health/modules/tools.py:347,354–356` 声明旧枚举但直接透传新枚举。未在范围内找到读取旧枚举的代码消费者。该文档根因在真实修复中同步消失。 |
| 成功缓存跨运行会话过期 | 真实的相邻根因。原始报告覆盖已经缓存的账号增加或撤销，真实修复报告覆盖成功空查询后补齐授权。两者共享进程级无失效机制，按一个根因计。`src/butlers/core/spawner.py:1703–1713` 和 `src/butlers/guards.py:180–184` 支持同一服务跨会话，连接器会重新发现授权，而翻译器被进程级结果锁定。探针确认成功空列表仍只查询一次。把新授权持续拒收作为缺陷有证据，关于撤销后仍可通过完整摄取路径的结论未核实，阻断受当前连接器及会话契约影响。 |
| 新增验收测试用旧事件 ID | 两版都有真实的测试覆盖缺口。`roster/health/tests/test_wellness_ingest.py:885` 的输入绕过连接器实际的格式，`src/butlers/connectors/google_health.py:483` 加入邮箱段，而路由原样传递，翻译器仍按第二段识别资源。改用当前格式的探针证实 base 和真实修复在账号恢复后仍 `skipped_unknown_predicate`。生产解析偏差在 base 已有。将新增测试覆盖缺口作为建议有依据，从原始建议升为修复头阻断的严重度依据不足。 |
| Performance 同范围三条建议 | 冷启动并发查询确实可能重复，但相对 base 的逐次查询是可选优化。一次性加载所需列更少是可选优化，当前注册表默认软上限 10，额外专用查询需权衡复用和维护成本。拒绝路径每次排序全集是静态可证实的额外开销，也受账号数约束。三条皆未命中异常缓存、状态文档或事件 ID 问题。 |

## 运行与局限

七次 Quality 和一次新 Performance 全部完成。持久任务确认请求参数为 `gpt-6.2-sol/high`、30 轮、压缩阈值 120000 和 `snapshot,workspace,web`。八份报告实际模型均为 `gpt-6.2-sol`，未读 diff 均为 0，reviewer 的工作树在运行后仍为指定且干净的 head。两次工具错误都来自 Catalog 原始的文档抓取，一次 HTTP 404 和一次重定向；该报告仍提供了可核对证据。全量 diff 覆盖只能证明分页完成。

Quality 共 2,935,740 个 provider 计数 token，单次 10,340–882,717，7 次中共压缩 3 次。单次耗时 15–155 秒，受并行和请求等待影响。同一 Butlers 原始范围的 Performance 为 378,523 token，Quality 为 882,717。对照档案的 Catalog 两次使用有语义的工作区名，Directory 两次使用随机路径。这些是小样本单次结果。归档比较与本轮的时间、工作区元数据和随机采样不同，token 合计含上下文和模型返回的压缩用量，不能直接视为账单。

本轮探针分别验证了 Catalog 部分导出和 Butlers 的处理推进，没有运行上游项目全套测试、真实数据库、浏览器或生产任务。新公开缺陷案例和已有归档的覆盖范围有限，不推断总体召回率或误报率。清单在审查前冻结，之后的新增发现逐条判断。原始状态与报告含本地路径，公共结果只保留整理后的字段和报告哈希。

评测仓的 `bun run check`、`bun run build` 与 `bun test` 通过，26 项测试全部通过。两个 Catalog 修复补丁均在独立检出中重建出了冻结 SHA，当前脚本的探针聚合也已单独复跑。
