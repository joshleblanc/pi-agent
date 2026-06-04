---
name: worktree-management
description: "Git worktree workflow for isolated development. Load ONLY when the user has explicitly opted into worktree mode (UI WorktreeToggle ON, or the project's AGENTS.md mandates worktree workflow). Covers: worktree creation, branch naming, development workflow, invasive testing, merge/cleanup. Do NOT load by default — code edits, bug fixes, feature work, and file changes go directly in the workspace unless the user or project has opted in."
---

# Worktree Management

## Core Rule (no exceptions)

**All code changes must happen in a worktree. The main codebase directory stays on the project's default branch (e.g. `main`, `master`, `dev`, `trunk`), always clean. Unless the user explicitly asks you to commit to the default branch, never commit there directly — always use a feature/fix branch.**

- Edit one line → worktree
- Fix a bug → worktree
- Add a test → worktree
- Any git-tracked file edit → worktree

**Violating this rule pollutes the reference baseline.**

## Architecture

```
Main directory (/path/to/project/)           ← always on the project's default branch, clean
  └── stable services run here (if applicable)

Dev worktree (/path/to/project/.worktrees/feature-xxx/)
  └── edit code + run tests here
```

**Why?** Projects with watch-mode dev servers restart on file changes. Editing in a separate worktree avoids disrupting running services.

## Detect the Default Branch

Different projects use different default branches (`main`, `master`, `dev`, `trunk`, etc.). Detect it before creating the worktree — don't hardcode `main`.

```bash
# Preferred: ask the remote
git remote show origin | sed -n 's/^ *HEAD branch: //p'

# Fallback: read the symbolic ref
git symbolic-ref --short refs/remotes/origin/HEAD | sed 's@^origin/@@'
```

If the project documents a different base branch (e.g. `dev` for feature work, `main` for hotfix), follow the project convention. When in doubt, ask the user.

## Creating a Worktree

### Branch Naming (mandatory)

- `feature/<kebab-case-name>` — new features
- `fix/<kebab-case-name>` — bug fixes

Examples: `feature/user-auth`, `fix/login-redirect`

### Commands

```bash
# Always fetch first
git fetch origin

# Resolve the project root — MUST use absolute path to prevent cwd drift
PROJECT_ROOT=$(git rev-parse --show-toplevel)

# Resolve the base branch (see "Detect the Default Branch" above)
BASE=$(git remote show origin | sed -n 's/^ *HEAD branch: //p')

# Create worktree from the base branch
git worktree add "$PROJECT_ROOT/.worktrees/feature-xxx" -b feature/xxx "origin/$BASE"
cd "$PROJECT_ROOT/.worktrees/feature-xxx"

# Install dependencies (if applicable)
npm install  # or pnpm install, yarn, etc.
```

All worktrees go under `$PROJECT_ROOT/.worktrees/`. **Always resolve the project root with `git rev-parse --show-toplevel` first — never rely on cwd being the project root, or the worktree will land in the wrong directory.**

## Development Workflow

```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT/.worktrees/feature-xxx"

# Edit code...

# Validate
npm run typecheck     # if applicable
npm test              # run tests
```

Key rules:
- Don't read/write files across worktrees
- Each worktree handles one task
- Start a dev server in the worktree only when you need to verify runtime behavior

## Invasive Testing (for testers)

Create a test worktree from the feature branch:

```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel)
git worktree add "$PROJECT_ROOT/.worktrees/test-feat-invasive" feature/xxx
```

In the test worktree, freely modify source code for:
- **Fault injection** — simulate I/O failures, network errors
- **Probe insertion** — add counters and logging to critical paths
- **Boundary testing** — extreme inputs, empty states, huge payloads
- **Race detection** — add random delays to async operations, then trigger concurrent access

Record findings in a handoff document. **Never commit invasive code** — keep the conclusions, discard the modifications.

```bash
# Cleanup after testing
PROJECT_ROOT=$(git rev-parse --show-toplevel)
git worktree remove "$PROJECT_ROOT/.worktrees/test-feat-invasive"
```

## Before Creating a PR/MR

```bash
# Sync with the latest base branch (use the same branch you created the worktree from)
git fetch origin
git rebase "origin/$BASE"
# Resolve conflicts if any, then push
```

**Don't skip this** — stale branches cause merge conflicts and CI failures.

## Cleanup

```bash
# After PR/MR is merged
PROJECT_ROOT=$(git rev-parse --show-toplevel)
git worktree remove "$PROJECT_ROOT/.worktrees/feature-xxx"
git branch -d feature/xxx
git worktree prune
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Dependency install fails | Delete node_modules/lock file, reinstall |
| Port conflict | Specify a different port via env var |
| Services restart unexpectedly | You're editing in the main directory — use a worktree |
| Stale worktree references | `git worktree prune` |
| Rebase conflicts | Resolve → `git add` → `git rebase --continue` |

## Next Step: Push & Create PR/MR

After completing your work in the worktree:

1. Commit your changes
2. Push the branch: `git push -u origin <branch-name>`
3. Open a PR/MR following the project's convention (`gh pr create`, `glab mr create`, etc.)
4. Track CI and code review through to merge — don't declare the work done until the change has actually landed on the base branch

If the project provides a dedicated PR/MR workflow skill (one that handles CI tracking, reviewer pings, merge confirmation, post-merge cleanup), load it after creating the PR/MR. Discover what's available via the project's `AGENTS.md` or skill listing — don't hardcode skill names that may not exist in this environment.
