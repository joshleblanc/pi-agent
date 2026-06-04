# skill-creator commands — Windows PowerShell

Shell: Windows PowerShell 5.1+ or PowerShell 7+. Use these recipes only on `win32`.

Do not use bash syntax in PowerShell: no `mkdir -p`, no `cat <<EOF`, no `/tmp`, no `.sh` scripts, and do not assume `python3` exists. Prefer PowerShell cmdlets and `Join-Path`.

## list-skills

```powershell
Get-ChildItem (Join-Path $env:USERPROFILE ".pi\agent\skills") -Directory | Select-Object Name
```

There is no `mavis skill list` in pi — read `~/.pi/agent/skills/` directly.

## locate-skill-dir

Resolve the skill-creator install directory so subsequent commands can address bundled scripts. The skill ships in the pi user data dir at the canonical location:

```powershell
$SkillDir = Join-Path $env:USERPROFILE ".pi\agent\skills\skill-creator"
```

## run-lint

```powershell
node (Join-Path $SkillDir "scripts/lint-skill.js") "<path\to\new-skill\>"
```

Run after `locate-skill-dir`. Replace `<path\to\new-skill\>` with the absolute path of the skill you just authored.

## eval-scratch-dir

Pick a writable scratch directory for eval YAML and baseline outputs. Do NOT use `/tmp` — Windows does not have it.

```powershell
$EvalScratch = $env:TEMP
```

Use `$EvalScratch` everywhere the procedure mentions a scratch path.

## write-eval-yaml

```powershell
$SkillName  = "<new-skill-name>"
$SkillPath  = "<absolute-path-to-new-skill>"
$EvalPrompt = "<the eval prompt — keep user language>"
$EvalYaml   = Join-Path $EvalScratch "eval-$SkillName.yaml"

Copy-Item -Path (Join-Path $SkillDir "plans/eval-skill.template.yaml") `
          -Destination $EvalYaml -Force

# Use [String]::Replace (the instance .Replace method) — it is a LITERAL
# substring replace, so backslashes in Windows paths and `$` in prompts
# survive untouched. Do NOT use the `-replace` operator here: it treats
# the RHS as a regex replacement string, where `$1` / `$&` are backrefs
# and an `[regex]::Escape`'d backslash becomes a literal double backslash
# in the output.
$content = Get-Content $EvalYaml -Raw
$content = $content.Replace('<SKILL_NAME>',  $SkillName)
$content = $content.Replace('<SKILL_PATH>',  $SkillPath)
$content = $content.Replace('<EVAL_PROMPT>', $EvalPrompt)
Set-Content -Path $EvalYaml -Value $content -Encoding UTF8 -NoNewline
```

`.Replace(...)` is case-sensitive and takes literal strings — no escaping is required for regex metacharacters, backslashes, or `$`. The placeholders are uppercase tokens, so case-sensitive matching is correct. If a value contains a literal `<SKILL_NAME>` substring you do not want replaced, edit `$EvalYaml` by hand.

## run-eval

```powershell
# Invoke the pi `team` tool from inside a session with the plan YAML.
# (There is no `mavis team plan run` CLI in pi — the `team` tool is a runtime tool.)
team { plan_file: $EvalYaml }
```

If the `team` tool is not available in the current session, fall back to Path B (two parallel subagent calls per the SKILL.md procedure).

## baseline-output-paths

When the `team` tool is unavailable, write Path B subagent outputs under the same scratch dir:

```powershell
$EvalDir = Join-Path $EvalScratch "eval-$SkillName"
New-Item -ItemType Directory -Force -Path $EvalDir | Out-Null

$WithSkillOutput = Join-Path $EvalDir "with-skill.md"
$BaselineOutput  = Join-Path $EvalDir "baseline.md"
```

Pass `$WithSkillOutput` and `$BaselineOutput` to the subagent prompts.

## Safety notes

- Do not add cleanup snippets with `Remove-Item`; the eval scratch dir does not need to be cleaned up immediately. If cleanup is truly required, prefer the project's recoverable trash flow over `Remove-Item`.
- Use `py` or `python` for Python scripts on Windows; `python3` is not standard.
