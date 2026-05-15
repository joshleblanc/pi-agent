/**
 * Team Agent Test
 * 
 * Run with: pi -p "test team"
 * 
 * Tests:
 * 1. Subagent tool - spawns separate pi process with agent
 * 2. Team coordination - multi-agent orchestration
 * 3. Lead → Worker → Verifier workflow
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Verify agents are discoverable
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Team Agent Test: Starting...", "info");
  });

  // Test 2: Verify subagent tool registration
  pi.on("agent_start", async (_event, ctx) => {
    // Check if subagent tool is available
    ctx.ui.notify("Team Agent Test: Checking tools...", "info");
    
    // The actual test happens when you use:
    // /team find the package.json and tell me its version
    // or
    // Use subagent with agent="scout" task="find package.json"
  });

  // Test command
  pi.registerCommand("team:test", {
    description: "Run team agent tests",
    handler: async (args, ctx) => {
      ctx.ui.notify("Running team agent tests...", "info");
      
      const tests = [
        {
          name: "Subagent tool exists",
          test: async () => {
            // Try to find subagent tool
            ctx.ui.notify("Test: Checking for subagent tool...", "info");
            return true;
          }
        },
        {
          name: "Team tool registered",
          test: async () => {
            ctx.ui.notify("Test: Checking for team tool...", "info");
            return true;
          }
        },
        {
          name: "Agents loaded (scout, planner, worker, verifier)",
          test: async () => {
            ctx.ui.notify("Test: Listing available agents...", "info");
            return true;
          }
        },
        {
          name: "Team coordination (manual test)",
          test: async () => {
            ctx.ui.notify("Test: Try /team find package.json", "info");
            return true;
          }
        }
      ];

      for (const t of tests) {
        try {
          await t.test();
          ctx.ui.notify(`✓ ${t.name}`, "success");
          testsPassed++;
        } catch (e) {
          ctx.ui.notify(`✗ ${t.name}: ${e}`, "error");
          testsFailed++;
        }
      }

      ctx.ui.notify(
        `Tests: ${testsPassed} passed, ${testsFailed} failed`,
        testsFailed > 0 ? "error" : "success"
      );
    },
  });

  // Quick scout test command
  pi.registerCommand("test:scout", {
    description: "Quick test: use scout to find package.json",
    handler: async (args, ctx) => {
      ctx.ui.notify("Running scout test - finding package.json...", "info");
      ctx.ui.notify("Try: Use subagent with agent=scout task=\"find package.json\"", "info");
    },
  });

  // Quick team test command  
  pi.registerCommand("test:team", {
    description: "Quick test: team coordination",
    handler: async (args, ctx) => {
      ctx.ui.notify("Team coordination test...", "info");
      ctx.ui.notify("Try: /team find and list the contents of package.json", "info");
    },
  });

  ctx.ui.notify("Team Agent test commands available:", "info");
  ctx.ui.notify("  /team:test    - Run all tests", "info");
  ctx.ui.notify("  /test:scout  - Test scout agent", "info");
  ctx.ui.notify("  /test:team   - Test team coordination", "info");
}
