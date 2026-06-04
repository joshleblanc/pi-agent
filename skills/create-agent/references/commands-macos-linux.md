# create-agent commands — macOS / Linux

Shell: bash or zsh. Use these recipes only on `darwin` / `linux`.

Do not use PowerShell syntax: no `Join-Path`, no `New-Item`, no `Remove-Item`. Prefer POSIX tools and `mkdir -p`.

## scaffold-builtin-role (Path 1)

```bash
EXT_DIR="$HOME/.pi/agent/extensions/team-agent"
mkdir -p "$EXT_DIR"
touch "$EXT_DIR/<name>.md"
```

Then edit the file (use the body schema in the SKILL.md step 3).

## scaffold-extension (Path 2)

```bash
EXT_DIR="$HOME/.pi/agent/extensions/<name>"
mkdir -p "$EXT_DIR"
touch "$EXT_DIR/index.ts"
```

Then edit `index.ts` (use the schema in the SKILL.md step 4).

## cwd

When the procedure asks for the current working directory:

```bash
PROJECT_DIR="$PWD"
```

## verify-builtin-role

There is no `mavis agent info` or `mavis agent list`. Use the filesystem:

```bash
ls "$HOME/.pi/agent/extensions/team-agent/"*.md
```

If your new file is in the list, the path is right. You still need to **restart pi** for the loader to pick it up.

## delete-builtin-role

The role should be deleted cleanly. There is no `mavis-trash` — just remove the file and restart.

```bash
rm "$HOME/.pi/agent/extensions/team-agent/<name>.md"
```

There is no project-rein path — pi has no `.harness/` concept.
