---
name: visual-summary
description: >-
  Proactively create a visual summary HTML page when plain text cannot effectively convey the information.
  Use this skill when: the content involves diagrams (flowcharts, architecture, sequence diagrams),
  data comparisons (tables, charts), timelines, interactive demos, visual layouts, or any scenario
  where a simple webpage would communicate more clearly than markdown text.
  Also use when the user explicitly asks for a visual summary, a webpage, or says "show me" / "画个图" / "做个页面" / "可视化".
  This skill should be used proactively by the model — do not wait for the user to ask.
---

# Visual Summary Skill

## Workflow

Create a self-contained local HTML webpage and send it to the user.

1. Choose an output path:
   - If the user specified an output path, use it.
   - If the user provided an input file or directory and no output path, save the HTML next to the input when appropriate.
   - Otherwise, create a descriptive `.html` file in the current workspace or approved temp workspace.
2. Write one complete `index.html`-style document with all CSS and JavaScript inlined unless an external CDN is genuinely useful.
3. Verify the page is valid enough to open directly in a browser: no missing local assets, no broken relative references, responsive layout.
4. Send the created or modified `.html` file to the user with a `<media />` tag, for example:
   `<media type="file" src="/absolute/path/to/visual-summary.html" caption="Visual summary HTML page" />`

Do not upload the page to a hardcoded hosting service. If the user asks for a shareable URL, ask which hosting destination to use or use an explicitly configured project/user hosting flow.

When the user asks to revise, update, or tweak a page, edit the existing HTML file when it is available so the deliverable remains continuity-friendly. If the previous file is unavailable, create a new HTML file and mention that it is a refreshed copy.

CDN when needed: Tailwind (`cdn.tailwindcss.com`), Mermaid, Chart.js, D3.

---

## Design Philosophy

**Aesthetics is the goal, not decoration.** A page that "works" but looks cheap is a failure. The reader's eyes judge in 2 seconds before reading a single word. Treat beauty as a non-negotiable requirement equal to data correctness.

**Design for the reader.** You are guiding a human eye, not displaying your work. One H1, one core conclusion, F-pattern scanning. Empty space is a feature. Charts and inline SVG beat dense paragraphs for any structured comparison or hierarchy.

**Less is more.** Every element earns its place. No filler sections, no data slop (pointless stats/badges). When unsure between "add another card" or "let it breathe" — let it breathe.

---

## Rules

### 1. Pick the page mode FIRST

| Mode | When | Background | Font |
|---|---|---|---|
| **Data UI** | Dashboards, charts, tables | `#fafafa` / white | Sans (Outfit) |
| **Long-read / Report** | Research, design docs, architecture pages | Warm cream `#f7f5f0` | Sans body + **serif headlines** (DM Serif Display) |
| **Terminal** | Code demos, log viewers | `#1a1a2e` (NEVER `#000`) | Mono-prominent |

Wrong-mode = ugly page. Research report on dark slate → dashboard look. Dashboard with serif → poster look.

### 2. Color

**BANNED:** pure `#000`, purple/blue AI gradients, neon glows, oversaturated accents.

**Accent — pick ONE per page:**
- Data UI: `#10b981` / `#3b82f6` / `#f59e0b` / `#f43f5e` / `#6366f1`
- Report: `#2f6f5e` / `#c97b3f` / `#b06367`

Use at 5-10% opacity for backgrounds, 100% for headers/icons only.

**Report palette:** cream `#f7f5f0`, cards white + border `#e9e3d6`, text `#14171e` / `#3a4256` / `#7c7a72`. Optional: two corner radial gradients at 5% opacity.

### 3. Typography

**BANNED fonts:** Inter, Roboto, Arial, Fraunces, system defaults.

**Use:** `Outfit` (sans), `JetBrains Mono` (mono), `DM Serif Display` (Report headlines only).

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Report headlines: `font-serif text-3xl font-normal tracking-[-0.005em]`. Body always sans. Serif forbidden on Data UI.

### 4. Layout

**BANNED:** 3 equal cards in a row, centered-everything heroes, `border-l-4` accent cards, `h-screen`.

**Use:** `max-w-5xl mx-auto px-6 md:px-8`, `space-y-16`, CSS Grid 12-column, `min-h-[100dvh]`. Mobile: single-column below 768px, no horizontal scroll.

### 4.5 Density — CJK pages need tighter spacing

Most CSS frameworks assume Latin typography. CJK characters are square blocks with built-in visual mass — copying Latin defaults (`line-height: 1.7+`, body `16-17px`, section gap `80px+`, card padding `28-32px`) makes Chinese pages feel sparse, with the first screen showing only a hero and one card.

Calibrate: **does the first screen communicate the core idea, or is it just hero + breathing room?**

Working ranges for CJK-heavy text (adjust by content, not hard rules):
- Body: 14–15px, line-height 1.5–1.65
- Headlines: H1 28–34px, H2 22–26px
- Section gaps: 40–56px
- Paragraph margin-bottom: 8–12px
- Card padding: 16–22px

Latin-only pages can be more generous. Mixed CJK + Latin follows the CJK side.

### 5. Surfaces

`rounded-2xl`, `border border-zinc-200/50`. Diffusion shadows only: `shadow-[0_2px_8px_rgba(0,0,0,0.04)]` / `shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)]`. Hover: `hover:-translate-y-0.5 hover:shadow-md transition-all duration-200`.

### 6. Icons & diagrams — inline SVG only

**No emoji as icons, no ASCII art (`┌─┐ │ ├─`) for diagrams.** Use inline SVG from [lucide.dev](https://lucide.dev) with `currentColor`, `stroke-width="2"`, `viewBox="0 0 24 24"`. One icon per section header max.

For diagrams: use §8 patterns (arch-row, flow-node) or Mermaid for 4+ nodes. Never box-drawing characters.

### 7. Visualization — match tool to data

| Data shape | Tool |
|---|---|
| 2-8 comparisons | CSS bench bars (§8) or `<table>` |
| Time-series / >8 points | Chart.js |
| Hierarchy / modules | §8 arch-row or inline SVG |
| Process flow ≥4 nodes | Mermaid |
| Process flow 2-3 nodes | §8 flow-node |
| Key-value ≤6 rows | §8 kv-card |
| Roadmap / phases | §8 step-timeline |

**Rule:** don't import Chart.js/Mermaid for <5 data points or <4 nodes — hand-roll CSS/SVG.

Chart.js defaults: `font.family = "'Outfit'"`, `color = '#71717a'`, `borderColor = 'rgba(0,0,0,0.04)'`, `borderRadius: 6`.

### 8. Pattern Library

Copy-paste components. CSS vars assume Report palette.

**Bench bar:**
```html
<div class="bench-row">
  <span class="label">Name</span>
  <div class="bar-bg"><div class="bar-fill" style="width:42.5%"></div></div>
  <span class="val">42.5%</span>
</div>
```
```css
.bench-row { display: grid; grid-template-columns: 140px 1fr 60px; gap: 14px; align-items: center; padding: 7px 0; }
.bar-bg { height: 18px; background: var(--line-soft); border-radius: 6px; overflow: hidden; }
.bar-fill { height: 100%; background: linear-gradient(90deg, var(--primary), #4a8e7c); border-radius: 6px; }
```

**Step timeline:**
```css
.timeline { position: relative; }
.timeline::before { content: ""; position: absolute; left: 22px; top: 6px; bottom: 6px;
  width: 2px; background: linear-gradient(180deg, var(--primary), var(--accent)); }
.step { position: relative; padding-left: 60px; margin-bottom: 32px; }
.step-icon { position: absolute; left: 6px; top: 0; width: 36px; height: 36px;
  border-radius: 50%; background: white; border: 2px solid var(--primary);
  display: inline-flex; align-items: center; justify-content: center; }
```

**Arch row** (replaces ASCII trees): two-column grid `130px 1fr`, tier label left, blocks flow right.
```html
<div class="arch-row">
  <span class="arch-tier">Layer</span>
  <div class="arch-blocks">
    <span class="arch-block">Module <span class="desc-mini">description</span></span>
  </div>
</div>
```

**Flow node + arrow** (replaces ASCII boxes): two cards stacked, arrow row in middle with SVG arrowheads + protocol label.

**KV card:** two-column grid `110px 1fr`, dashed borders between rows. Better than tables for ≤6 rows.

---

## Anti-Slop Checklist

- [ ] 2-second test — first impression crafted, not generic?
- [ ] Reader gets core conclusion within one screen
- [ ] Enough whitespace — if "full", remove a section
- [ ] Page mode picked correctly (not dark dashboard for a report)
- [ ] No `#000`, no AI gradients, no neon, no Inter/Roboto/Arial
- [ ] No emoji icons — inline SVG with `currentColor`
- [ ] No ASCII art diagrams — using CSS/SVG patterns
- [ ] No 3-equal-cards, no `border-l-4` accent cards
- [ ] Didn't import Chart.js/Mermaid for <5 data points
- [ ] No filler, no round-number stats, no banned copy ("Elevate", "Seamless")
- [ ] Mobile responsive, every interactive element has hover state
- [ ] Created or updated a local `.html` file and sent it with `<media />`

---

## HTML Template — Long-read Report

Default when in doubt. For Data UI: swap cream→`#fafafa`, drop serif, simpler hero.

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #f7f5f0; --panel: #ffffff; --line: #e9e3d6; --line-soft: #f0ebdf;
      --text: #1f2533; --text-2: #3a4256; --muted: #7c7a72; --ink: #14171e;
      --primary: #2f6f5e; --accent: #c97b3f;
    }
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; }
    body {
      font-family: 'Outfit', -apple-system, 'PingFang SC', sans-serif;
      background: var(--bg); color: var(--text); line-height: 1.7;
      -webkit-font-smoothing: antialiased;
      background-image:
        radial-gradient(at 0% 0%, rgba(47,111,94,.05) 0%, transparent 45%),
        radial-gradient(at 100% 0%, rgba(201,123,63,.05) 0%, transparent 45%);
      background-attachment: fixed;
    }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 56px 28px 96px; }
    * { text-wrap: pretty; }
    header.hero {
      padding: 44px; border-radius: 22px;
      background: linear-gradient(135deg, #f9f6ee, #efece6);
      border: 1px solid var(--line); margin-bottom: 56px;
      box-shadow: 0 1px 0 rgba(255,255,255,.6) inset, 0 6px 24px -16px rgba(20,23,30,.12);
    }
    header.hero h1 {
      font-family: 'DM Serif Display', 'Source Han Serif SC', Georgia, serif;
      font-size: 38px; font-weight: 400; line-height: 1.2; margin: 12px 0;
      color: var(--ink);
    }
    h2 {
      font-family: 'DM Serif Display', serif;
      font-size: 28px; font-weight: 400; margin: 64px 0 22px;
      padding-bottom: 12px; border-bottom: 1px solid var(--line);
      color: var(--ink); display: flex; align-items: center; gap: 14px;
    }
    h2 .sec-num {
      width: 38px; height: 38px; border-radius: 10px; font-size: 13px;
      font-family: 'Outfit', sans-serif; font-weight: 700;
      background: linear-gradient(135deg, var(--primary), #1f4e42); color: #fff;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .card {
      background: var(--panel); border: 1px solid var(--line);
      border-radius: 14px; padding: 22px;
      box-shadow: 0 4px 14px -10px rgba(20,23,30,.08);
      transition: transform .15s, box-shadow .15s;
    }
    .card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px -18px rgba(20,23,30,.18); }
  </style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <h1>Page Title</h1>
    <p style="color: var(--text-2); max-width: 800px;">Core conclusion in one sentence.</p>
  </header>
  <h2><span class="sec-num">01</span>Section</h2>
</div>
</body>
</html>
```

## Example Output

> I made a visual summary — much clearer than text:
>
> `<media type="file" src="/absolute/path/to/visual-summary.html" caption="Visual summary HTML page" />`
