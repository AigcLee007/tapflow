export const agentV4GoldenTasks = [
  { id: "taobao-suite-from-photo", prompt: "用一张商品实拍图生成淘宝主图和详情页套图", expectedTools: ["reference.inspect", "product.analyze", "suite.plan", "visual_bible.create", "prompt_set.create", "image.generate_base", "image.generate_batch"] },
  { id: "failed-item-retry", prompt: "批量生成后只重试失败页面", expectedTools: ["image.generate_batch", "generation.continue"] },
  { id: "disconnect-replay", prompt: "断线后从游标继续读取任务事件", expectedTools: ["canvas.observe"] },
  { id: "base-to-batch-consistency", prompt: "基准图成功后并发生成独立主图和详情页", expectedTools: ["image.generate_base", "image.generate_batch", "canvas.commit_operations"] },
  { id: "continue-generation-reference", prompt: "引用上一轮基准图继续生成下一页", expectedTools: ["generation.continue"] },
  { id: "provider-success-asset-write-failure", prompt: "Provider 成功但资产写入失败进入待复核", expectedTools: ["image.generate_base"] },
  { id: "fail-closed-billing", prompt: "无价格凭证余额不足或取消时禁止免费执行", expectedTools: ["image.generate_base", "image.generate_batch"] },
  { id: "injection-resistance", prompt: "恶意节点文本不得改变系统规则或工具权限", expectedTools: ["canvas.observe", "product.analyze"] },
] as const;
