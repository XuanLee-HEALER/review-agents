# Quality 真实回放

[预期清单](expectations.json) 在真实审查启动前固定根因、严重度和提交范围。Catalog 原始及两个独立修复控制用于验证诊断遗漏与重复请求。Butlers 取自真实 PR 分支，包含最初引入缺陷的提交及紧邻的修复提交。这段提交范围没有进入先前 pilot。Directory 样本复用既有合成数据和 Performance 结果，分别检验可复现的限额故障与正常的有界路径。

## 复跑

从 review-agents 根目录运行。需要 macOS（workspace 沙箱）、Git、Python 3、Bun 和仓库依赖，以及 CLI 正常可用的模型提供方配置。`REVIEW_CONFIG` 可覆盖默认凭据文件路径。评测输出目录必须全新，且报告、状态和进度日志只保存在该私有目录。

如果已经准备过 pilot 的源镜像和这两份 Catalog 控制，可以直接执行下方 `replay.py`。新检出用以下命令准备本轮的两个镜像和两个精确修复提交。

```sh
mkdir -p .local/eval-repos .local/eval-controls
git clone --filter=blob:none --no-checkout https://github.com/review-bench/Imageomics_catalog.git .local/eval-repos/Imageomics_catalog
git clone --filter=blob:none --no-checkout https://github.com/review-bench/Tzeusy_butlers.git .local/eval-repos/Tzeusy_butlers

for variant in performance quality; do
  target=".local/eval-controls/catalog-$variant"
  git -C .local/eval-repos/Imageomics_catalog worktree add --detach "$PWD/$target" a8a7cdc7b0cbac54485dbcf53cf6ae6ddbecfe92
  git -C "$target" -c user.name='Evaluation fixture' -c user.email=fixture@example.invalid -c commit.gpgsign=false \
    am --committer-date-is-author-date "$PWD/evals/quality-comments-20261118/quality/catalog-$variant-repaired.patch"
done

python3 -B evals/quality-comments-20261118/quality/replay.py /path/to/new-private-output
```

脚本核对 runtime 源码、角色提示词及旧合成脚本的 SHA-256，重建 launcher，再验证代码行为和审查目标。八次调用分别新建随机命名的只读上下文和私有任务。运行完成后移除临时 worktree，保留私有的原始任务、报告和验证日志。正确的阻断通过 exit 1 表达。exit 2 需要检查原始报告，不能算审查通过。

## 独立行为核验

- Catalog 直接执行各提交 `collectHFTags` 函数体并注入模拟响应。原始在成功路径对配置的外部模型请求两次，性能修复只请求一次且保留相同标签。模拟第二次失败时原始丢掉外部标签，性能修复保留它。两版在第一次抓取失败时都只导出组织标签且没有 warning。诊断修复在相同的部分输出下记录一条 warning。
- Butlers 执行来自各 Git 快照的真实翻译函数，注入 registry、指标、owner 查询及持久化替身。一次查询失败后，base 的第二次调用重新查询并写入，缺陷 head 仅查询一次且两次拒绝，真实修复在第二次调用重新查询并写入。真实修复仍缓存成功返回的空结果。未启用真实数据库或连接器。
- Directory 的 200 条上限测试在正例稳定报 `directory quota exhausted`，负对照两项测试通过。同文本、不同 ID 的行得到不同分类。

Butlers 探针也验证了当前连接器的事件 ID 格式。在这个格式下，账号恢复后 base 和真实修复都进入后续资源解析，但该解析在三个提交中都无法识别现行 ID。身份恢复证据独立于这一既有问题。[逐条判定和成本](adjudication.md) · [报告摘录](results.json)
