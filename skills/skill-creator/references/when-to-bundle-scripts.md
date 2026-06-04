# When to Bundle Scripts — 何时建脚本 vs 用其他机制

> 一个常见错误是"看到能写脚本就写脚本"。pi 已经有多种机制处理不同类型的工作；先判断**这件事本质上是什么**，再决定用什么。

## 决策树

```
有一个动作要在 skill 里反复执行 →
│
├─ 这是确定性的本地计算（无需 LLM 判断）？
│   ├─ 是 → 写 Node.js 脚本（放 scripts/）
│   └─ 否 → 继续往下
│
├─ pi CLI 已经支持了？
│   ├─ 是 → 直接调用 pi xxx 命令，不写脚本
│   └─ 否 → 继续往下
│
├─ 涉及多 agent 协作 / 评审 / 对比？
│   ├─ 是 → 写 Team Engine plan template（放 plans/）
│   └─ 否 → 继续往下
│
├─ 涉及跨 session 状态传递？
│   ├─ 是 → 用 scratchpad（不写文件）
│   └─ 否 → 继续往下
│
└─ 是判断性 / 创造性工作？
    └─ 让 LLM 在 SKILL.md 的 procedure 里直接做，不用脚本
```

## 各类工作对应的机制

### 用脚本（scripts/*.js）

适合：**纯本地确定性计算 / 校验 / 格式化**

例：
- `lint-skill.js` — 校验 SKILL.md 格式、frontmatter
- 文件解析、统计、转换

**判断标准**：跑同样输入永远得同样输出，不需要 LLM 介入。

**约束**：用 Node.js + 内置 fs，禁止依赖第三方 npm 包。

### 用 pi CLI

适合：**pi 已封装的能力**

例：
- 列已有 skill → `pi skill list`
- 看 session 状态 → `pi session list`
- 查 plan 状态 → `pi team plan status <id>`

**判断标准**：动作是否已经是 pi 的标准 API。是的话直接调用，不要包脚本。

### 用 Team Engine plan template（plans/*.yaml）

适合：**多 agent 协作 / 对比评审 / 需要 verify 闭环**

例：
- skill 评测：producer / baseline / compare 三 task
- 多角度审查：3 个 reviewer 并发独立审一个文档

**判断标准**：动作是否需要"派活给多个 worker + 等结果 + 汇总"。是的话用 Team Engine 表达，不要在脚本里手动编排 subagent。

### 用 scratchpad

适合：**跨 session 信息传递**

例：
- skill iterate 过程中 cycle N 的反馈传给 cycle N+1
- 多个 worker 共享中间状态

**判断标准**：信息是否需要被多个 session 看到。是的话写 scratchpad 文件，不要塞进 agent memory（agent memory 是经验沉淀，不是临时进度）。

### 让 LLM 直接做

适合：**判断性 / 创造性 / 需要理解上下文的工作**

例：
- 给 skill 起名字
- 写 description
- 决定该 reuse 还是 create
- 评判两个 skill 输出哪个更好

**判断标准**：换个输入就要换种处理方式 → 让 LLM 在 SKILL.md procedure 里直接做。

## 反例：错误地建了脚本

### 反例 A：写脚本扫已有 skill

```js
// scan-existing-skills.js — 不必要
const skills = fs.readdirSync('~/.pi/skills/');
const matches = skills.filter(s => s.includes(query));
```

**问题**：`pi skill list | grep <query>` 一行搞定，不需要脚本。

### 反例 B：写脚本跑 eval

```js
// run-eval.js — 不必要
spawn('pi', ['skill', 'run', skillPath, prompt]);
spawn('pi', ['prompt', prompt]);  // baseline
compareOutputs();
```

**问题**：这是典型的 producer/baseline/compare 工作流，应该写 Team Engine plan template。脚本里手动 spawn worker 等于在重写 Team Engine。

### 反例 C：写脚本汇总迭代反馈

```js
// summarize-iteration.js — 不必要
const feedback = JSON.parse(fs.readFileSync('feedback.json'));
const summary = aggregateByCategory(feedback);
fs.writeFileSync('summary.md', summary);
```

**问题**：这是判断性工作（什么是"重要反馈"，什么是"噪声"），应该让 LLM 在 SKILL.md procedure 里读 CycleReport + scratchpad 直接处理。

## Anthropic 的"看 transcript 找重复造轮子"提示

Anthropic 官方 skill-creator 提到一个有用的判断方法：**跑完几轮 eval 后，看 worker transcript，如果发现多个 worker 独立写了同一个辅助函数，那才说明这个动作该 bundle 成脚本**。

换句话说：
- 脚本不是预先决定要写的，是从迭代中**发现**该写的
- 第一版 skill 不要急着写脚本，先用 LLM 直接做，看哪些动作真的高频且确定性
- 高频 + 确定性的部分才下沉到脚本

## 总结：奥卡姆剃刀清单

写脚本前问：
- [ ] pi CLI 已经支持了吗？
- [ ] 涉及多 agent 吗（→ plan template）？
- [ ] 涉及跨 session 吗（→ scratchpad）？
- [ ] LLM 自己做就行吗（→ procedure 里直接写）？
- [ ] 真的是确定性本地计算吗？

5 个问题都答完，最后一个还是 "是"，才写脚本。
