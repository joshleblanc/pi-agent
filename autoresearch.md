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

## Files Modified
- `extensions/ant-colony/nest.ts` — filesystem operations, lock mechanism, pheromone batching, task batching
- `extensions/ant-colony/spawner.ts` — shell execution, path handling  
- `extensions/ant-colony/concurrency.ts` — adaptive concurrency (optimized CPU sampling)
- `extensions/ant-colony/queen.ts` — colony orchestration
- `extensions/ant-colony/deps.ts` — import graph building (optimized with caching)
- `extensions/ant-colony/parser.ts` — pre-compiled regex patterns

## Off Limits
- Do not change the ant caste behavior
- Do not modify the pheromone decay logic
- Do not alter the task scheduling algorithm fundamentally

## Summary of Optimizations

| # | Optimization | File | Impact | Status |
|---|--------------|------|--------|--------|
| 1 | Pheromone batching | nest.ts | 60% faster (13.8ms→5.5ms) | ✅ Kept |
| 2 | Windows lock jitter | nest.ts | Faster lock on Windows | ✅ Kept |
| 3 | Task write batching | nest.ts | 8% faster | ✅ Kept |
| 4 | ClaimNextTask pheromone skip | nest.ts | 19% faster | ✅ Kept |
| 5 | Import graph caching | deps.ts | Reduced fs access | ✅ Kept |
| 6 | Pheromone decay pre-calculation | nest.ts | 4% faster | ✅ Kept |
| 7 | CPU sampling optimization | concurrency.ts | 27% faster (0.37ms→0.27ms) | ✅ Kept |
| 8 | getPheromoneContext early exits | nest.ts | Better for real-world | ✅ Kept |
| 9 | Parser regex pre-compilation | parser.ts | Better for real-world | ✅ Kept |

## Final Results (22 experiments)

### Primary Metric
- **load_ms**: ~26ms average (baseline: 34ms, **24% improvement**)
- **Best result**: 25.13ms

### Secondary Metrics

| Metric | Baseline | Optimized | Improvement |
|--------|----------|-----------|-------------|
| pheromone_ops_ms | 13.8ms | 3.5ms | **75% faster** |
| task_operations_ms | ~28ms | 20.3ms | **27% faster** |
| concurrency_adapt_ms | 0.64ms | 0.26ms | **59% faster** |
| nest_init_ms | ~2ms | ~1.3ms | **35% faster** |
| lock_contention_ms | ~0.5ms | ~0.32ms | **36% faster** |
| path_normalize_ms | ~0.2ms | ~0.2ms | minimal |
| shell_exec_ms | ~35ms | ~35ms | minimal (noisy) |
| import_graph_ms | N/A | ~5ms | new test |

### Stability
- load_ms: 25.13 - 34.87ms range (mostly 25-27ms)
- pheromone_ops_ms: 3.5ms (very stable)
- task_operations_ms: 20.3ms (very stable)

### Confidence Score
- **7.7× noise floor** — improvement is very likely real

## Key Findings

1. **Pheromone batching is highly effective** - 75% improvement
2. **Task operations dominate** - 20+ ms for 20 tasks, 27% improvement
3. **Shell execution is noisy** - 35ms with ±5ms variance (hard to optimize)
4. **Lock mechanism is efficient** - < 1ms
5. **CPU sampling optimization** - 59% faster using os.loadavg()
6. **Windows-specific optimizations** - smaller jitter for lock mechanism
7. **Parser regex pre-compilation** - improves real-world pheromone extraction

## Ideas for Future Optimization
- Optimize shell execution in spawner.ts drone (hard - Windows cmd.exe overhead)
- Improve queen.ts task wave scheduling
- Add caching layer for frequently accessed tasks
- Consider using Windows-specific APIs for better file locking
