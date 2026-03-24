/**
 * Ant Colony Windows Benchmark - Enhanced
 * Measures path handling, lock mechanism, shell execution, and colony operations
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { Nest } from "./extensions/ant-colony/nest.ts";
import { defaultConcurrency, adapt } from "./extensions/ant-colony/concurrency.ts";

const COLONY_DIR = path.join(process.cwd(), "extensions", "ant-colony");

// Metrics storage
const metrics = {
  load_ms: 0,
  nest_init_ms: 0,
  lock_contention_ms: 0,
  path_normalize_ms: 0,
  shell_exec_ms: 0,
  pheromone_ops_ms: 0,
  task_operations_ms: 0,
  concurrency_adapt_ms: 0,
  errors: [],
};

// ═══════════════════════════════════════════════════════════
// Test 1: Nest Initialization
// ═══════════════════════════════════════════════════════════
async function testNestInit() {
  const start = performance.now();
  const testColonyId = "bench-" + Date.now();
  
  try {
    const testDir = path.join(os.tmpdir(), "ant-colony-bench-" + Date.now());
    fs.mkdirSync(path.join(testDir, ".ant-colony", testColonyId, "tasks"), { recursive: true });
    
    const nest = new Nest(testDir, testColonyId);
    
    metrics.nest_init_ms = performance.now() - start;
    
    // Cleanup
    nest.destroy();
    
  } catch (e) {
    metrics.errors.push("Nest init error: " + e);
  }
}

// ═══════════════════════════════════════════════════════════
// Test 2: Lock Mechanism
// ═══════════════════════════════════════════════════════════
async function testLockMechanism() {
  const start = performance.now();
  const lockFile = path.join(os.tmpdir(), "ant-colony-test-lock-" + Date.now() + ".json");
  
  const MAX_WAIT = 1000;
  const startTime = Date.now();
  
  try {
    while (true) {
      try {
        fs.writeFileSync(lockFile, process.pid + ":" + Date.now(), { flag: "wx" });
        break;
      } catch {
        if (Date.now() - startTime > MAX_WAIT) {
          break;
        }
        const jitter = 1 + Math.random() * 3;
        const until = Date.now() + jitter;
        while (Date.now() < until) { /* spin */ }
      }
    }
    
    metrics.lock_contention_ms = performance.now() - start;
  } catch (e) {
    metrics.errors.push("Lock test error: " + e);
  } finally {
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
  }
}

// ═══════════════════════════════════════════════════════════
// Test 3: Path Normalization
// ═══════════════════════════════════════════════════════════
async function testPathNormalization() {
  const start = performance.now();
  const testPaths = [
    "C:\\Users\\test\\project\\src\\file.ts",
    "C:\\Users\\test\\project\\src\\..\\lib\\util.ts",
    "./extensions/ant-colony/nest.ts",
    ".\\extensions\\ant-colony\\spawner.ts",
    "\\\\UNC\\path\\to\\share",
    "C:/mixed/slashes/tsconfig.json",
    "C:\\Program Files\\nodejs\\node.exe",
    "C:\\Users\\jlebl\\.pi\\agent\\extensions\\ant-colony\\nest.ts",
  ];
  
  let errors = 0;
  for (const p of testPaths) {
    try {
      path.resolve(p);
      path.join(p, "subdir");
      path.dirname(p);
      path.relative(p, path.join(p, "..", "sibling"));
      path.normalize(p);
      path.isAbsolute(p);
      path.parse(p);
    } catch (e) {
      errors++;
      metrics.errors.push("Path error for \"" + p + "\": " + e);
    }
  }
  
  metrics.path_normalize_ms = performance.now() - start;
  return errors;
}

// ═══════════════════════════════════════════════════════════
// Test 4: Shell Execution
// ═══════════════════════════════════════════════════════════
async function testShellExecution() {
  const isWindows = process.platform === "win32";
  const start = performance.now();
  
  try {
    const shell = isWindows ? "cmd.exe" : "/bin/sh";
    const shellFlag = isWindows ? "/c" : "-c";
    
    const testCmd = isWindows ? "echo test" : "echo test";
    const output = execSync(shell + " " + shellFlag + " \"" + testCmd + "\"", {
      cwd: os.tmpdir(),
      encoding: "utf-8",
      timeout: 5000,
      stdio: "pipe"
    });
    
    if (!output.trim()) {
      metrics.errors.push("Shell exec returned empty output");
    }
    
    metrics.shell_exec_ms = performance.now() - start;
  } catch (e) {
    metrics.shell_exec_ms = performance.now() - start;
    metrics.errors.push("Shell exec error: " + e);
  }
}

// ═══════════════════════════════════════════════════════════
// Test 5: Pheromone Operations
// ═══════════════════════════════════════════════════════════
async function testPheromoneOps() {
  const start = performance.now();
  const testDir = path.join(os.tmpdir(), "ant-colony-pher-" + Date.now());
  
  try {
    fs.mkdirSync(path.join(testDir, ".ant-colony", "bench", "tasks"), { recursive: true });
    
    const nest = new Nest(testDir, "bench");
    
    // Simulate pheromone drops
    for (let i = 0; i < 50; i++) {
      nest.dropPheromone({
        id: "p-" + i,
        type: "discovery",
        antId: "bench",
        antCaste: "scout",
        taskId: "t-1",
        content: "Test pheromone content " + i,
        files: ["test.ts"],
        strength: 1.0,
        createdAt: Date.now(),
      });
    }
    
    // Flush any remaining batched pheromones
    if (typeof nest.flushPheromoneBatch === "function") {
      nest.flushPheromoneBatch();
    }
    
    // Read pheromones back
    const pheromones = nest.getAllPheromones();
    
    if (pheromones.length === 0) {
      metrics.errors.push("No pheromones read back");
    }
    
    metrics.pheromone_ops_ms = performance.now() - start;
    
    // Cleanup
    nest.destroy();
    
  } catch (e) {
    metrics.errors.push("Pheromone ops error: " + e);
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// ═══════════════════════════════════════════════════════════
// Test 6: Task Operations (with batching)
// ═══════════════════════════════════════════════════════════
async function testTaskOps() {
  const start = performance.now();
  const testDir = path.join(os.tmpdir(), "ant-colony-task-" + Date.now());
  
  try {
    fs.mkdirSync(path.join(testDir, ".ant-colony", "bench", "tasks"), { recursive: true });
    
    const nest = new Nest(testDir, "bench");
    
    // Initialize with state
    nest.init({
      id: "bench",
      goal: "Benchmark test",
      status: "working",
      tasks: [],
      ants: [],
      pheromones: [],
      concurrency: {
        current: 2,
        min: 1,
        max: 8,
        optimal: 3,
        history: [],
      },
      metrics: {
        tasksTotal: 0,
        tasksDone: 0,
        tasksFailed: 0,
        antsSpawned: 0,
        totalCost: 0,
        totalTokens: 0,
        startTime: Date.now(),
        throughputHistory: [],
      },
      maxCost: null,
      modelOverrides: {},
      createdAt: Date.now(),
      finishedAt: null,
    });
    
    // Add many tasks with batching
    for (let i = 0; i < 20; i++) {
      nest.writeTask({
        id: "t-" + i,
        parentId: null,
        title: "Task " + i,
        description: "Benchmark task " + i,
        caste: "worker",
        status: "pending",
        priority: (i % 5) + 1,
        files: ["file" + (i % 5) + ".ts"],
        claimedBy: null,
        result: null,
        error: null,
        spawnedTasks: [],
        createdAt: Date.now(),
        startedAt: null,
        finishedAt: null,
      });
    }
    
    // Flush pending writes
    if (typeof nest.flushTaskWrites === "function") {
      nest.flushTaskWrites();
    }
    
    // Claim and complete some tasks
    for (let i = 0; i < 5; i++) {
      const claimed = nest.claimNextTask("worker", "bench");
      if (claimed) {
        nest.updateTaskStatus(claimed.id, "done", "Completed");
      }
    }
    
    // Flush pending writes again
    if (typeof nest.flushTaskWrites === "function") {
      nest.flushTaskWrites();
    }
    
    // Test getAllTasks
    const allTasks = nest.getAllTasks();
    
    metrics.task_operations_ms = performance.now() - start;
    
    // Cleanup
    nest.destroy();
    
  } catch (e) {
    metrics.errors.push("Task ops error: " + e);
  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// ═══════════════════════════════════════════════════════════
// Test 7: Concurrency Adaptation
// ═══════════════════════════════════════════════════════════
async function testConcurrencyAdapt() {
  const start = performance.now();
  
  const config = defaultConcurrency();
  
  // Simulate multiple rounds of adaptation
  for (let round = 0; round < 100; round++) {
    config.history.push({
      timestamp: Date.now(),
      concurrency: config.current,
      cpuLoad: 0.3 + Math.random() * 0.3,
      memFree: 2 * 1024 * 1024 * 1024,
      throughput: 0.5 + Math.random() * 0.5,
    });
    if (config.history.length > 30) {
      config.history.shift();
    }
    
    const next = adapt(config, 5);
    Object.assign(config, next);
  }
  
  metrics.concurrency_adapt_ms = performance.now() - start;
}

// ═══════════════════════════════════════════════════════════
// Main Benchmark Runner
// ═══════════════════════════════════════════════════════════
async function runBenchmark() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("Ant Colony Windows Benchmark");
  console.log("Platform: " + process.platform);
  console.log("Node: " + process.version);
  console.log("Timestamp: " + new Date().toISOString());
  console.log("═══════════════════════════════════════════════════════\n");
  
  const overallStart = performance.now();
  
  // Run all tests
  console.log("Running nest initialization test...");
  await testNestInit();
  
  console.log("Running lock mechanism test...");
  await testLockMechanism();
  
  console.log("Running path normalization test...");
  const pathErrors = await testPathNormalization();
  
  console.log("Running shell execution test...");
  await testShellExecution();
  
  console.log("Running pheromone operations test...");
  await testPheromoneOps();
  
  console.log("Running task operations test...");
  await testTaskOps();
  
  console.log("Running concurrency adaptation test...");
  await testConcurrencyAdapt();
  
  const total_ms = performance.now() - overallStart;
  
  // Output results
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("RESULTS");
  console.log("═══════════════════════════════════════════════════════");
  
  // Primary metric (core operations)
  const primaryMs = (metrics.nest_init_ms || 0) + (metrics.pheromone_ops_ms || 0) + (metrics.task_operations_ms || 0);
  console.log("\nMETRIC load_ms=" + primaryMs.toFixed(2));
  
  // Secondary metrics
  console.log("METRIC nest_init_ms=" + (metrics.nest_init_ms || 0).toFixed(2));
  console.log("METRIC lock_contention_ms=" + (metrics.lock_contention_ms || 0).toFixed(2));
  console.log("METRIC path_normalize_ms=" + (metrics.path_normalize_ms || 0).toFixed(2));
  console.log("METRIC shell_exec_ms=" + (metrics.shell_exec_ms || 0).toFixed(2));
  console.log("METRIC pheromone_ops_ms=" + (metrics.pheromone_ops_ms || 0).toFixed(2));
  console.log("METRIC task_operations_ms=" + (metrics.task_operations_ms || 0).toFixed(2));
  console.log("METRIC concurrency_adapt_ms=" + (metrics.concurrency_adapt_ms || 0).toFixed(2));
  console.log("METRIC total_ms=" + total_ms.toFixed(2));
  console.log("METRIC path_errors=" + pathErrors);
  console.log("METRIC error_count=" + metrics.errors.length);
  
  // Errors
  if (metrics.errors.length > 0) {
    console.log("\n--- ERRORS ---");
    for (const e of metrics.errors) {
      console.log("  ERROR: " + e);
    }
  }
  
  console.log("\n═══════════════════════════════════════════════════════");
  
  // Exit with error code if there were critical errors
  const criticalErrors = metrics.errors.filter(e => 
    e.includes("init error") || e.includes("Task ops error")
  );
  process.exit(criticalErrors.length > 0 ? 1 : 0);
}

runBenchmark().catch((e) => {
  console.error("Benchmark crashed:", e);
  process.exit(1);
});
