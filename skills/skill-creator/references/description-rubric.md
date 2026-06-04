# Description Rubric — 写好 description 的 4 要素

> `description` 是 LLM 决定打不打开 skill 的唯一依据。写不好 → 该用没用（漏触发），或不该用却用了（误触发）。本文档列 4 要素 + 用 pi 现有 skill 做正反例。

## 4 要素

每条 description 必须能让另一个 LLM 同时回答这 4 个问题：

1. **What**：这个 skill 能做什么（一句话，能力边界）
2. **When**：用户会怎么说才该触发（含具体短语/关键词）
3. **Near misses**：什么相邻请求**不该**触发它
4. **适度 pushy**：扩大召回的同时给出明确边界，避免"模糊不愿用"

## 例 1：plan-mode vs team 的边界

这两个 skill 容易冲突：用户说"讨论一下方案"——是 plan-mode 还是 team？

**plan-mode**：
> Requirements clarification and solution direction. Load this skill when you need to discuss requirements, evaluate options, or align on approach with the user — before dispatching detailed planning to a specialist agent. Covers: technical designs, product specs, UI concepts, business/legal/financial decisions. Trigger: 'let's discuss', 'what's the approach', 'help me think through', 'requirements', 'design direction'.

**team**：
> Use ONLY for genuinely complex work: multi-file code changes (>200 lines or 3+ files), deep multi-angle research, or tasks requiring adversarial produce-verify cycles. Simple and medium tasks the orchestrator handles directly — do NOT load this for them.

**为什么这两条都写得好**：
- plan-mode 用 `before dispatching detailed planning to a specialist agent` 划清边界——它是"讨论阶段"
- team 用 `Simple and medium tasks the orchestrator handles directly — do NOT load this for them` 显式拒绝小任务
- 两条 description 互相留出了对方的领地，不会同时触发

## 例 2：minimax-docx vs minimax-pptx 的近义区分

两个 skill 都处理 Office 文档，但文件类型和交付物不同：

**minimax-docx**：
> Create, inspect, edit, repair, and verify Microsoft Word DOCX documents. Use this skill for formal Word deliverables, tracked document structure, WordprocessingML-level edits, rendering DOCX pages for visual QA, extracting text/styles/tables/images/comments, or preserving DOCX layout and section/header/footer behavior.

**minimax-pptx**：
> Read, inspect, generate, and edit PowerPoint PPTX presentations. Use this skill for extracting slide text, speaker notes, comments, embedded images, screenshots, metadata audits, creating new decks with PptxGenJS, imitating a reference deck's visual style, or editing an existing PPTX while preserving layout.

**写得好的点**：
- 两条都先声明文件类型（DOCX / PPTX），模型能用扩展名和交付物快速路由
- `minimax-docx` 把 Word 特有的 section/header/footer、WordprocessingML、page render QA 写进边界
- `minimax-pptx` 把 slide、speaker notes、screenshots、PptxGenJS、reference deck imitation 写进边界
- 两条 description 不再用"Office 文件"这种泛化说法，避免任何 Office 请求都触发同一个 skill

## 反例：什么是写得不好的 description

**反例 A**（太抽象，触发不稳定）：
```
description: A useful skill for working with files.
```
问题：什么文件？什么操作？模型不知道什么时候该用。

**反例 B**（只堆关键词，没有 when 和边界）：
```
description: PDF, text, extract, OCR, parse, document, file
```
问题：可能任何提到 PDF 的请求都触发，包括其实该用 `minimax-docx` 或其他相邻 skill 的。

**反例 C**（把"什么时候不该用"漏掉）：
```
description: Use this skill to handle PDF files.
```
问题：用户说"生成 PDF 报告"也会触发它。

## 自检清单

写完 description 后用这 4 个问题自查：

- [ ] 一句话说出做什么了吗？
- [ ] 给了 ≥ 2 个具体触发短语吗（含中英文如果用户混用）？
- [ ] 显式列了"不该触发"的相邻情况吗？
- [ ] 适度 pushy（用 "load this skill when" / "trigger on" 等明确语气），但没夸大能力？

## "适度 pushy" 的尺度

**太弱**：`Can be useful for X` → LLM 看了不知道是不是该用
**正确**：`Use this skill when X. Triggers on phrases like Y / Z` → 明确召回意图
**过度**：`MUST always use this skill for any X-related task` → 把模型限死，反而过拟合

参考 pi 现有 skill 的 description（如 `lark-tools`）的写法：
> Use this skill **whenever** the user mentions anything related to Feishu or Lark, including but not limited to: ...

`whenever` + `including but not limited to` 是适度 pushy 的范例：扩大召回 + 留扩展空间。
