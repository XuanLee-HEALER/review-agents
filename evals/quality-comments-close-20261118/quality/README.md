# Quality 阻断标准回放

本轮收紧了 Quality 的阻断判定。报告须说明新增行为、可抵达的触发条件、受影响的调用方或恢复路径，以及具体后果。测试缺口须指出被遮住的新增回归或失效的必要检查。接口文档阻断沿用受支持的当前接入路径，要求兼容旧格式时需核实实际调用方或兼容承诺。

[冻结预期](expectations.md)在修改角色提示词前写定。原样本沿用上一轮的提交范围。审计归档变更在本轮新增，正、负对照的测试和提交消息一致，区别为写入成功后才移除源事件。探针独立于 reviewer，探针代码和预期均在 reviewer 工作区之外。

共享 runner 接入 Comments 查询预算后，使用最终 Quality 构建重跑全部 12 个样本。Butlers 缓存失败、Directory 硬配额、通知旧指南及审计归档数据丢失仍为阻断。修复对照未复报相应根因，Butlers 测试 ID 保持建议级。Catalog 的诊断和重复请求修复通过配对验收，保留旧配置和认证边界仍有漏报或等级偏差。[逐条裁决](adjudication.md) · [最终报告](final.json) · [接入查询预算前的报告](before-comments-budget.json) · [第一轮报告](round-1.json) · [第二轮报告](round-2.json)

## 复跑

从 `review-agents` 根目录运行。准备 Git、Bun、Python 3、依赖、macOS workspace 沙箱和可用的 provider 配置。Catalog、Butlers 和两个 Catalog 修复快照的准备步骤见[前一轮复跑说明](../../quality-comments-20261118/quality/README.md)。目录、通知和审计归档的合成样本由运行器重建。`REVIEW_CONFIG` 可覆盖默认凭据文件路径。

```sh
python3 -B evals/quality-comments-close-20261118/quality/replay.py .local/eval-results/quality-close-verify --verify-only
python3 -B evals/quality-comments-close-20261118/quality/replay.py .local/eval-results/quality-close-replay
```

每次运行使用新的私有输出目录。可以加 `--cases wellness wellness-repaired` 定向重跑，然后与同一候选提示词的其它报告一起裁决。脚本核对固定 base/head、任务实际配置、报告中的 provider 模型和 diff 分页覆盖。每个输入使用全新任务与独立、干净且随机命名的 detached worktree。原始任务、报告和进度日志保存在私有输出目录，公开证据删去本机路径。脚本重建 launcher，把 launcher、构建产物和提示词复制到私有输出目录并核对哈希，再以 `gpt-6.2-sol/high`、30 轮、120000 压缩阈值启动。Catalog、Butlers 和 Directory 沿用上一轮 `snapshot,workspace,web`，通知和审计归档运行 `snapshot,workspace`。脚本退出状态只表示计分证据的完整性，发现、等级和修复对照由调用方单独裁决。

## 独立行为探针

- Butlers 的暂时查询异常在原始 head 两次均拒绝，且只查一次。真实修复的第二次重新查询并通过身份检查。以连接器实际生成的多段 ID 输入时，base 和真实修复都已在后续资源解析中跳过。成功空结果在真实修复继续只查一次。
- Catalog 首次外部详情失败时，原始和性能修复均留下部分输出和零条告警，诊断修复留下部分输出和一条告警。性能修复移除了成功模型的重复请求，并保住外部标签。前端原始及诊断修复在第二次外部详情请求因网络错误被拒后返回空模型列表，性能修复保留两个模型。函数探针使用本地替身，未运行浏览器。
- Directory 的 200 行正例复现配额失败，负对照保留 16 行的分类上限并按不同 ID 区分相同文本。通知的原始请求示例返回 400，指南同步后的示例返回 201，单独措辞改动的示例仍返回 201。
- 审计归档使用实际导出的函数和内存存储替身。第一次写入被拒绝后，正例只剩 15 条待归档，重试无法找回另外 50 条。base 和修复对照保留全部 65 条并在重试中写出全部 ID。两个变更各自的原有成功路径和新增分批测试均通过。
