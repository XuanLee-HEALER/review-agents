# 优化回归与 workbench 接入验收

2026-11-11。最终候选通过本轮预先定义的评测门槛，已接入 workbench。四个 agent 仍然只读、只提建议；核实、修改、提交和验证由调用方负责。

## 结果

| 角色 | v1 参考命中 | 最终参考命中 | 最终有依据的建议 |
|---|---:|---:|---:|
| quality | 2/3 | 3/3 | 9 |
| performance | 1/3 | 2/3 | 3 |
| simplify | 1/2 | 2/2 | 3 |
| comments | 3/3 | 3/3 | 5 |
| 合计 | 7/11 | 10/11 | 20 |

13 次基线评审全部完成，20 条建议中 12 条为明确可行动项，8 条为可选优化/文档补充。四组修复对照都在修复前发现了目标，修复后目标复报 0/4；对照仍可提出其它真实建议。四次重跑保留对应命中目标，没有再提出打包遗漏断言。最终证据集共 21 次运行、34 条逐项判定，未确认事实性误报或未决事实。

唯一未匹配参考是 performance/wallet 的字符串转字节冗余转换。该报告提出了关闭 Debug 时跳过整个诊断编码块的有效建议，并提及转换开销，但未直接建议消除该转换，按原有严格根因口径仍计为未命中；simplify 已命中这一参考。没有为了达标放宽匹配或删除参考。

一条 comments 建议的文件名周围含 NUL 占位字符：事实诊断正确，但原始措辞不能直接粘贴。判定中明确记录了这一表达缺陷，新 skill 要求调用方检查转义、反引号和不可见字符后重写文案。因此，“有依据”不等于输出可自动作为补丁执行，也不宣称所有输出文字完美。

## 优化与失败候选

- quality：追踪被吞掉的失败及诊断信息；区分未声明依赖造成的新环境不可复现与开发者本机是否已安装；识别重复维护同一当前契约的成本。
- performance：检查首次使用的全量构建、跨表示转换和静态可证明的重复工作；以规模/频率条件表达建议，不将缺少基准等同于不能提建议。
- simplify：跨变更文件比较共享工厂和查询契约，同时保持状态隔离、断言和特殊分支。
- comments：第三方规则需适用版本依据；多个工具共同作用的安装/构建/启动失败断言，要求实际产物或失败证据。没有证据时列明待核验步骤，不建议删除原有工作流。仓内行为及明确客户端契约仍可直接形成发现。

v2：收紧证据后无已确认事实性误报，但过度压制依赖和日志建议，总参考命中仍为 7/11，simplify 只有 1/2，未通过。

v3：增加显式 web 静态集合以读取上游实现契约，恢复正确建议，达到 10/11；但是 comments 的修复对照再次提出 npm 打包遗漏，虽然附带源码版本，仍被实验反驳，未通过。

v4：只改 comments 的组合工具链证据要求，重跑其全部六次基线/对照/重复用例。其它三个角色复用 v3 的 15 次运行，代码、配置和保存的角色提示词完全一致；验收脚本逐项核验。没有用续跑旧 task 来冒充新提示词测试。最终通过，不覆盖 v1/v2/v3 历史输出。

这是已见样本上的回归优化，不是新的盲测成绩。相对于 v1，工具配置也从 snapshot/workspace 改为显式加入 web，不能把全部收益归因于提示词。观察到的网络请求用于技术文档和依赖源码，没有发现检索 benchmark 或 PR 评审答案；记录见 [请求清单](pilot-document-requests.json)，上下文压缩会移除早期调用，清单不是完整网络审计。后续扩展应保留新来源的未见样本。

## 独立验证

- `bun run check`、`bun test`（12 通过、0 失败、76 个断言）、`bun run build` 均通过。
- 两个新 skill 以及 wrapup 通过 skill-creator 的 frontmatter 验证；四个 workbench 链接实际指向 canonical skills。旧名称 agent 文件现为兼容路由，不再指示自动修改。
- 实际 `bin/review-simplify`、`bin/review-comments` 对完成任务的回放与原报告固定 base/head、发现、轮数和 token 统计对应字段一致，没有额外模型轮次。原始模型评测由真实 CLI 执行，模拟服务集成测试另行解释。
- catalog 纯 mock 网络实验：重复请求 2→1，错误诊断 0→1，数据结果保持一致。
- [日志字段实验](../scripts/check-pilot-logging.py)：真实 Zap v1.27.1，JSON/console 编码器、nil/空值/非 ASCII 字节输入，对比 hex 的 ByteString→String 与手动 Base64→Binary，两者输出等价。依据也核对了 [JSON 编码器](https://raw.githubusercontent.com/uber-go/zap/v1.27.1/zapcore/json_encoder.go)、[console 编码器](https://raw.githubusercontent.com/uber-go/zap/v1.27.1/zapcore/console_encoder.go)。没有宣称完整上游测试通过或测得吞吐收益。
- [打包规则实验](../scripts/check-pilot-packaging.py)：npm 11.20.0 及官方分发的 npm 10.8.2 均包含 dist/index.js、dist/loader.js、dist/tools/get_api_details.js。保留 main/bin/ignore 配置，使用惰性占位编译文件。最终实验删除生命周期脚本，只验证打包规则，不宣称完整 Git/npx 安装成功。初次 npm10 探针即使传 ignore-scripts 仍调用 prepare，执行 tsc 后因占位目录无编译输入失败；随后显式移除脚本避免混淆。没有运行目标仓库业务代码。
- 八个原始评测仓库最终保持指定 HEAD、工作区干净。修复对照位于独立克隆。本轮没有访问生产或 fat，也未重新执行数据库专项测试。

## 已切换的工作台流程

根 CLAUDE.md、wrapup、feature、ship 已同步：业务评审 → quality/performance 两项并行审查 → code-simplification-review 建议及调用方落实 → 后端变更适用的 comment-normalization-review 建议及调用方落实。使用阶段当前提交 head，新任务隔离审查，核对实际模型、完整报告与限制；incomplete/error 不放行。保留现有业务口径裁决、行为等价性检查及生成文档验证。

simplifier/comment-refiner 旧名称入口已原位改为新 skill 的兼容路由；不再提供旧修改型代理路径。没有修改自动维护的 session 登记文件。通知投递和回执见 [接入记录](../docs/workbench-adoption.md)。

## 复算与证据

- [固定候选与源码哈希](reviewbench-pilot-v4.json)
- [运行报告与逐条判定](pilot-v4-adjudication.json)、[原始人工映射](pilot-v4-annotations.json)
- [指标](pilot-v4-metrics.json)、[验收结果](pilot-v4-acceptance.json)
- [预先定义的门槛及迭代决策](pilot-v2-plan.md)

```sh
PILOT_MANIFEST=evals/reviewbench-pilot-v4.json \
PILOT_ADJUDICATION=evals/pilot-v4-adjudication.json \
PILOT_METRICS=evals/pilot-v4-metrics.json python3 scripts/score-pilot.py
python3 scripts/accept-pilot.py v4
```

最终 21 次证据运行累计 4,890,823 tokens；多轮重复输入计入其中，不能当作单次上下文大小或直接折算费用。失败候选的额外执行成本没有藏入这一最终候选数字。单一执行代理作代码判定，无独立人工盲审；通过仅表示满足本轮建议型评审的回归门槛。
