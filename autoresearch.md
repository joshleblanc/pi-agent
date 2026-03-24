# Autoresearch: Ant Colony Windows Optimization

## Objective
Improve the ant colony system for Windows compatibility and reliability. Focus on:
1. Path handling (Windows uses backslashes)
2. Shell command execution (proper cmd.exe handling)
3. Lock mechanism (reduce CPU spin-wait overhead)
4. File system operations (Windows-specific edge cases)

## Metrics
- **Primary**: `load_ms` (ms, lower is better) — combined core operations
- **Secondary**: `nest_init_ms`, `lock_contention_ms`, `path_normalize_ms`, `shell_exec_ms`, `pheromone_ops_ms`, `task_operations_ms`, `concurrency_adapt_ms`, `import_graph_ms`

## How to Run
`npx tsx bench.js` — runs unit-style tests on colony modules

## Files in Scope
- `extensions/ant-colony/nest.ts` — filesystem operations, lock mechanism, pheromone batching, task batching
- `extensions/ant-colony/spawner.ts` — shell execution, path handling  
- `extensions/ant-colony/concurrency.ts` — adaptive concurrency (optimized CPU sampling)
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

## What's Been Tried (Cumulative Progress)

| Optimization | Improvement | Status |
|-------------|-------------|--------|
| Pheromone batching | 60% faster (13.8ms→5.5ms) | ✅ Kept |
| Windows lock jitter | Faster lock on Windows | ✅ Kept |
| Task write batching | 8% faster | ✅ Kept |
| ClaimNextTask pheromone skip | 19% faster | ✅ Kept |
| Import graph caching | Reduced fs access | ✅ Kept |
| Pheromone decay pre-calculation | 4% faster | ✅ Kept |
| CPU sampling optimization | 27% faster (0.37ms→0.27ms) | ✅ Kept |

## Current Results (10 experiments)
- **load_ms**: ~26ms average (baseline: 34ms, **24% improvement**)
- **pheromone_ops_ms**: 4.04ms (baseline: 13.8ms, **71% faster**)
- **task_operations_ms**: 21.85ms (baseline: ~28ms, **22% faster**)
- **concurrency_adapt_ms**: 0.27ms (baseline: 0.64ms, **58% faster**)
- **lock_contention_ms**: 0.33ms (minimal)
- **path_normalize_ms**: 0.20ms (minimal)
- **shell_exec_ms**: ~29ms (noisy, hard to optimize)
- **import_graph_ms**: 5.94ms (new test)

## Confidence Score
- **3.1× noise floor** — improvement is likely real

## Ideas for Future Optimization
- Optimize shell execution in spawner.ts drone (hard - Windows cmd.exe overhead)
- Improve queen.ts task wave scheduling
- Add caching layer for frequently accessed tasks
- Consider using Windows-specific APIs for better file locking
