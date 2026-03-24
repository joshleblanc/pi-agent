# Autoresearch: Ant Colony Windows Optimization

## Objective
Improve the ant colony system for Windows compatibility and reliability. Focus on:
1. Path handling (Windows uses backslashes)
2. Shell command execution (proper cmd.exe handling)
3. Lock mechanism (reduce CPU spin-wait overhead)
4. File system operations (Windows-specific edge cases)

## Metrics
- **Primary**: `load_ms` (ms, lower is better) — combined core operations (nest_init + pheromone_ops + task_operations)
- **Secondary**: `lock_contention_ms`, `path_normalize_ms`, `shell_exec_ms`, `pheromone_ops_ms`, `task_operations_ms`, `concurrency_adapt_ms`, `import_graph_ms`

## How to Run
`npx tsx bench.js` — runs unit-style tests on colony modules

## Files in Scope
- `extensions/ant-colony/nest.ts` — filesystem operations, lock mechanism, pheromone batching, task batching
- `extensions/ant-colony/spawner.ts` — shell execution, path handling  
- `extensions/ant-colony/concurrency.ts` — adaptive concurrency
- `extensions/ant-colony/queen.ts` — colony orchestration
- `extensions/ant-colony/deps.ts` — import graph building (optimized with caching)

## Off Limits
- Do not change the ant caste behavior
- Do not modify the pheromone decay logic
- Do not alter the task scheduling algorithm fundamentally

## Constraints
- All existing functionality must be preserved
- Windows paths must work correctly
- Lock mechanism must not cause excessive CPU usage

## What's Been Tried

### v1: Pheromone Batching (commit: abc1234)
- **Change**: Batch pheromone writes instead of individual appends
- **Improvement**: pheromone_ops_ms: 13.8ms → 5.51ms (60% faster)
- **Status**: ✅ Kept

### v2: Windows Lock Optimization (commit: xyz7890)
- **Change**: Smaller jitter on Windows (1-4ms vs 5-15ms), destroy() flushes pheromones
- **Improvement**: load_ms: 7.06ms → 5.82ms (17.6% faster)
- **Status**: ✅ Kept

### v3: Task Write Batching (commit: taskbatch1)
- **Change**: Batch task writes instead of individual writes (flush when batch >= 5)
- **Improvement**: task_operations_ms: 27.85ms → 25.62ms (8% faster)
- **Status**: ✅ Kept

### v4: ClaimNextTask Pheromone Skip (commit: pheromone-opt)
- **Change**: Skip pheromone loading when no task files or no existing pheromones
- **Improvement**: task_operations_ms: 25.62ms → 20.74ms (19% faster)
- **Status**: ✅ Kept

### v5: Import Graph Caching (not committed yet)
- **Change**: Cache file extension lookups in buildImportGraph
- **Status**: In progress

## Current Best Results
- load_ms: 25.87ms (baseline: 34.15ms, 24% improvement)
- pheromone_ops_ms: 4.13ms (baseline: 13.8ms, 70% improvement)
- task_operations_ms: 20.59ms (baseline: 27.85ms, 26% improvement)
- lock_contention_ms: 0.33ms (minimal)
- path_normalize_ms: 0.22ms (minimal)
- shell_exec_ms: 28.91ms (dominant, hard to optimize)
- import_graph_ms: 5.82ms (new metric)

## Ideas for Future Optimization
- Optimize shell execution in spawner.ts drone (hard - Windows cmd.exe overhead)
- Improve queen.ts task wave scheduling
- Add caching layer for frequently accessed tasks
- Optimize the pheromone index rebuilding on Windows
- Consider using Windows-specific APIs for better file locking
