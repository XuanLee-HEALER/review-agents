# Comments 真实回放

2026-11-18。本地定向验证。五次均为独立的 `review-comments` 新任务，报告和任务状态均确认实际模型 `gpt-6.2-sol`、`high`，固定范围的 diff 已读完。评审从各自的中性目录启动，工作区只包含本次固定 head。冻结判定、脱敏报告和调用方执行证据见 [expectations.md](expectations.md)、[reports.json](reports.json)、[verification.json](verification.json)。

| 样本 | 退出码 | 阻断 / 建议 | 轮数 | 累计 token | 外部读取错误 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 过时接入指南 | 1 | 1 / 0 | 3 | 9,858 | 0 |
| 同步接入指南 | 0 | 0 / 1 | 4 | 16,431 | 0 |
| 纯措辞变更 | 0 | 0 / 1 | 4 | 12,122 | 0 |
| MCP 原样本 | 1 | 1 / 4 | 12 | 415,414 | 9 |
| MCP 补充重启说明对照 | 1 | 1 / 3 | 10 | 274,085 | 16 |

## 接入指南和措辞对照

| 样本 | 根因、评审锚点与修改位置 | 核实结果 |
| --- | --- | --- |
| 过时接入指南 | `src/notifications.js:14` 锚定变化，`docs/notifications.md:3–9` 是实际修改处且在 diff 外。旧指南的必填字段叙述和示例使用顶层 `channel`，请求改读 `delivery.channel`。 | **阻断成立，属于 Comments 范围。** 调用方解析并原样提交指南 JSON，handler 返回 `400` 和 `{"error":"invalid_channel"}`。嵌套 `delivery.channel` 后返回 `201`，原响应 `data.channel` 示例仍匹配。 |
| 同步接入指南 | `docs/notifications.md:3` 锚定并修改文档，可在请求示例之后补旧格式迁移与错误说明。同步版已给出正确的新请求结构。 | **建议成立。** 新示例返回 `201`，旧格式返回 `400` 已有测试断言。外部调用方存在与否及上线顺序未查；模型没有推定。 |
| 纯措辞变更 | `docs/notifications.md:11` 是实际修改处，新增句重复说明由调用方选频道。 | **建议成立。** 只合并重复表达并指出 `data.channel`。请求和响应示例均匹配 handler，未改变对外契约。 |

两份接入指南夹具的 `src` 和 `tests` 差异逐字节等同。调用方执行了三份夹具内的 Bun 测试，并用 Fetch `Request` 调用 handler 对比指南 JSON、返回状态及响应体。

## MCP 既有样本逐条核实

| 实际发现 | 锚点与修改位置 | 校验与严重度 |
| --- | --- | --- |
| 两例都报告 Claude Code 项目配置文件名错误 | `README.md:55`。将项目根目录的 `mcp.json` 改为 `.mcp.json`。 | **阻断成立。** 这是按 README 执行时会失败的默认发现路径，当前官方文档独立确认。v4 原样本、复跑和该对照均给过建议级别。本轮两个建议文本均含 U+001B，需要按目标 Markdown 重写。 [Claude Code MCP quickstart](https://code.claude.com/docs/en/mcp-quickstart.md#edit-mcp-json-directly) |
| 原样本未说明克隆失败后需重启 | `README.md:134`。可明确修复克隆问题后重启。 | **建议成立，与旧级别一致。** `src/index.ts:16–20` 只在启动调用 `loadIndex()`，`src/loader.ts:208–223` 在失败时提前返回且缓存未写入，后续 handler 从 `src/index.ts:118–120` 读取缓存。对照已经保留重启说明，未重复这一根因。 |
| 对照指出默认分支回退和降级说明 | `README.md:128` 为回退锚点及修改处，`README.md:134` 为协同修正处。 | **两项事实成立，同一条建议可拆开实施。** 标签查询失败时 `src/loader.ts:106–130` 改克隆默认分支。真正的克隆失败时返回的空对象被启动代码丢弃，缓存保持空值，`src/tools/get_server_info.ts:14–23` 返回 `degraded`，数据工具报告不可用。原样本未报告默认分支回退。 |
| 两例都报告本地构建配置并非各客户端通用 | `README.md:111` 的引导语和示例。 | **建议成立。** `.vscode/mcp.json` 用 `servers`，示例却用 `mcpServers`。保留各客户端要求和格式，并限于客户端进程能访问实际生成的文件。GitHub 托管执行器若要用该路径，需要在执行器上准备文件。 [VS Code 配置参考](https://code.visualstudio.com/docs/agents/reference/mcp-configuration#configuration-structure) · [GitHub 仓库 MCP 配置](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers) |
| 两例都报告工具表遗漏可选 `limit` | `README.md:91` 的工具输入表。 | **建议成立。** `src/index.ts:40–55` 声明 `limit`，`src/tools/search_graph_apis.ts:40–41` 在未给出正数时使用 20，`src/search.ts:67` 截取结果。文字提到的 100 上限未由服务端代码实施。 |
| 仅原样本报告 Node.js 最低版本声明不一致 | `README.md:13` 的快速启动前提。 | **建议成立，措辞须限定。** `package-lock.json:25–44` 锁定的 `@hono/node-server@1.19.11` 声明 `>=18.14.1`。这是锁定依赖声明支持的下限，能影响强制检查 engine 的安装。更低 Node 版本的 stdio 运行失败未实测。 [npm engines 说明](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#engines) |

MCP 两个 head 各自包含的五段 JSON 均可解析。调用方用现有的惰性打包探针验证 npm 11.20.0 的 manifest 包含入口和两个非入口编译文件。模型把 Git 安装、完整 `npx` 链路和客户端握手留在 limitations，调用方未执行这些流程。动态客户端文档的证据限于本轮核验日期，目标 README 未锁定客户端版本。 [打包探针](../../../scripts/check-pilot-packaging.py)

MCP 两次外部核验共计 689,499 provider 累计 token，25 次读取错误为重定向、404 等。脚本记录的累计 token 含重复请求上下文，不是账单费用。报告最终拿到关键官方配置证据，但同一来源多次换路径尝试，说明现有提示词的外部查询上界仍偏软。五次均为单次回放，历史和当前的模型、提示词及可访问外部文档也有变化，不能把级别差异归因给某一项变化。

## 重跑

在 `review-agents` 根目录使用 Bun、Git、Bash、Python 3 和已配置的真实 provider。工作区工具需要 macOS。`REVIEW_CONFIG` 可传配置文件绝对路径；未设置时沿用 CLI 默认。每次使用新的私有输出目录。

```bash
eval_dir=evals/quality-comments-20261118/comments
run_dir=$(mktemp -d)
bun run build
bash "$eval_dir/prepare-fixtures.sh" "$run_dir/fixtures"
bun "$eval_dir/verify-examples.mjs" "$run_dir/fixtures/cases.tsv"
bash "$eval_dir/replay.sh" "$run_dir/fixtures/cases.tsv" "$run_dir/reports"
```

MCP 可使用现有 pilot 检出，或从 pilot manifest 的同一公开镜像准备本地 Git 仓库，使原始 head 及四层范围可读。脚本按历史内容与 Git 元数据重建并校验同一个对照 SHA。

```bash
bash "$eval_dir/prepare-mcp.sh" "$run_dir/mcp" \
  .local/eval-repos/UniverseCitiz3n_msgraph-kb-mcp
bash "$eval_dir/replay.sh" "$run_dir/mcp/cases.tsv" "$run_dir/mcp-reports"
```

原始报告、任务状态和 stderr 位于私有输出目录；归档只保留公开或合成文件的内容证据、运行参数和 SHA-256。`reports.json` 使用可见的 `[U+001B]` 标记替代异常字符，并另外记录原报告摘要及字符位置。运行前可用归档的 prompt 和构建产物哈希确认比较条件；后续运行按当时实际版本记录。
