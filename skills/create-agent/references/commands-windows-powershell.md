# create-agent commands — Windows PowerShell

Shell: Windows PowerShell 5.1+ or PowerShell 7+. Use these recipes only on `win32`.

Do not use bash syntax in PowerShell: no `mkdir -p`, no `$(pwd)`, no `rm -rf`. Prefer PowerShell cmdlets and `Join-Path`.

## scaffold-builtin-role (Path 1)

Create the agent file inside the team-agent extension folder. Run from any directory — the path is absolute.

```powershell
$ExtDir = Join-Path $env:USERPROFILE ".pi\agent\extensions\team-agent"
$AgentPath = Join-Path $ExtDir "<name>.md"
New-Item -ItemType Directory -Force -Path $ExtDir | Out-Null
New-Item -ItemType File -Force -Path $AgentPath | Out-Null
```

Then edit the file (use the body schema in the SKILL.md step 3).

## scaffold-extension (Path 2)

```powershell
$ExtDir = Join-Path $env:USERPROFILE ".pi\agent\extensions\<name>"
New-Item -ItemType Directory -Force -Path $ExtDir | Out-Null
New-Item -ItemType File -Force -Path (Join-Path $ExtDir "index.ts") | Out-Null
```

Then edit `index.ts` (use the schema in the SKILL.md step 4).

## cwd

When the procedure asks for the current working directory:

```powershell
$ProjectDir = $PWD.Path
```

## verify-builtin-role

There is no `mavis agent info` or `mavis agent list`. Use the filesystem:

```powershell
Get-ChildItem (Join-Path $env:USERPROFILE ".pi\agent\extensions\team-agent") -Filter "*.md"
```

If your new file is in the list, the path is right. You still need to **restart pi** for the loader to pick it up.

## delete-builtin-role

The role should be deleted cleanly. There is no `mavis-trash` — just remove the file and restart.

```powershell
Remove-Item (Join-Path $env:USERPROFILE ".pi\agent\extensions\team-agent\<name>.md")
```

There is no project-rein path — pi has no `.harness/` concept.
