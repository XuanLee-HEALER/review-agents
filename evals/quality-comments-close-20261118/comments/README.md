# Comments 阻断收紧回放

2026-11-18，本地定向验证。以 [冻结标准](expectations.md) 按根因、严重度、实际文档修改处和读者后果裁定。首次改提示词前已冻结此前没有参与调词的重试指南正反对照，固定范围见报告。每个样本使用新的独立 `review-comments` 任务，在中性的干净 head 检出中启动，由服务实际返回 `gpt-6.2-sol`、`high`。 [各轮原始报告和工具调用摘录](reports.json)

## 最终结果

第六轮用同一提示词和最终 CLI 全量重跑，八例均符合冻结标准。五个风险样本各保留一个经验证的文档阻断。同步指南、纯措辞和正确重试对照均零阻断。Butlers 的缓存恢复问题单列交给实施评审，工具状态阻断未附带基线成功响应的偏差。 [逐条裁决](adjudication.md#第六轮最终裁决)

| 样本 | 阻断 / 建议 | 结果 |
| --- | ---: | --- |
| 过时接入指南 | 1 / 0 | 旧文档原样提交返回 400，替换成 `delivery.channel` 可通过。 |
| 同步接入指南 | 0 / 1 | 只建议补迁移引导。已有兼容性保持未知。 |
| 纯措辞 | 0 / 1 | 只合并重复说明并指出响应字段。 |
| MCP 原样本 | 1 / 2 | 保住 `.mcp.json` 文件名阻断。重启说明为建议。 |
| MCP 重启对照 | 1 / 2 | 保住同一文件名阻断。已有的重启要求没有再被判为缺失。 |
| Butlers | 1 / 2 | 唯一阻断为公开状态字面值。首次异常后的持续拒绝与实际事件 ID 解析各有独立实现交接。 |
| 新重试秒数错误 | 1 / 0 | 秒与毫秒混淆导致继续 429。替换脚本换算正确。 |
| 新重试秒数正确 | 0 / 0 | 无发现。基线列表默认值偏差未升为阻断。 |

最终三个带 Web 样本分别发出 8、6、3 次外部请求。人工按事实归并后，各事实最多三次。工具记录的 product/contract 与事实一致，配额耗尽后没有重复请求或换键。最终 MCP 原样本达到 GitHub Docs 单主机停用阈值，未达到全任务八次无进展阈值。八份输出及已接受的模型原始报告均无 ESC 或其它不安全控制字符，关键文件名、状态值、JSON 和 JS 替换已核对。 [最终查询裁决](adjudication.md#第六轮外部查询)

前五轮的漏报、严重度偏差、缺少实现交接和对同一事实多次实际出网均保留在档案。全量归档包括 48 次完成的计分调用。最终八次共 1,429,609 个 provider 计数 token。

## 调用方验证

- 三个通知夹具的 Bun 测试均通过。把指南 JSON 原样提交给 handler，旧请求得到 `400 invalid_channel`，嵌套 `delivery.channel` 后得到 `201`。同步指南与纯措辞对照的请求和响应示例仍然一致。
- 把新夹具指南里的 JavaScript 示例用于同一个 handler，首个响应均为 `429` 和 `Retry-After: 5`。错误样本再过 5 毫秒请求仍是 `429`。修正样本过 5,000 毫秒得到 `200`。探针使用注入时间，直接检验说明和脚本对应的重试结果。 [HTTP Retry-After 字段](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after)
- 两个 MCP head 的 README 各有五段 JSON，均可解析。根据官方客户端设置文档，Claude Code 的项目设置必须用 `.mcp.json`，VS Code 配置顶层为 `servers`。打包清单探针以惰性 stub 复现 npm 11.20.0 的入口与两项内部文件包含规则。Git 来源的实际 `npx` 完整流程和客户端握手未执行。 [Claude Code 项目配置](https://code.claude.com/docs/en/mcp-quickstart.md#edit-mcp-json-directly) · [VS Code 配置参考](https://code.visualstudio.com/docs/agents/reference/mcp-configuration#configuration-structure)
- Butlers 用同一译码函数及本地 registry 和持久化替身重跑探针。旧状态为 `rejected_non_primary_sender`，head 实际回 `rejected_non_owner_sender`。第一次读取失败后，head 两次拒绝且只查询一次。真实修复版会重新查询。现行连接器事件还有独立的基线解析偏差，真实数据库、部署中的工具列表和完整连接器未运行。 [探针输入与结果](verification.json)

## 重跑

在 `review-agents` 根目录使用 macOS、Git、Bash、Python 3.9+、Bun 和已配置的真实 provider。可用 `REVIEW_CONFIG` 指定配置文件绝对路径。两个公开 Git 检出须能读取固定样本提交，准备方式见 [上一轮 MCP](../../quality-comments-20261118/comments/README.md#重跑) 和 [上一轮 Butlers](../../quality-comments-20261118/quality/README.md)。

```bash
new=evals/quality-comments-close-20261118/comments
old=evals/quality-comments-20261118/comments
private=$(mktemp -d)
bun run build
bash "$new/prepare.sh" "$private/fixtures" \
  .local/eval-repos/UniverseCitiz3n_msgraph-kb-mcp .local/eval-repos/Tzeusy_butlers
bun "$old/verify-examples.mjs" "$private/fixtures/guides/cases.tsv"
bun "$new/verify-holdout.mjs" "$private/fixtures/holdout/cases.tsv"
python3 "$new/replay.py" "$private/fixtures/cases.tsv" "$private/results"
```

命令在私有目录保留计划、任务、报告、退出码和 stderr。评分时核对报告及任务状态的实际模型和 SHA、完整 diff、报告的控制字符和外部工具调用。归档保存报告哈希和公开或合成内容，省略本地路径及任务标识。模型的多轮 token 包含重复上下文，单次小样本分数不能用于推算生产命中率或费用。
