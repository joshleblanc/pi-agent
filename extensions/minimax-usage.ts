/**
 * MiniMax Usage Extension
 *
 * Displays MiniMax usage for various plan types in the footer.
 * Supports: coding, image, speech, music, hailuo
 *
 * Usage:
 * - Copy to ~/.pi/agent/extensions/minimax-usage.ts
 * - Use /minimax-status to check all plan usages
 * - Use /minimax-coding, /minimax-image, /minimax-speech, /minimax-music, /minimax-hailuo for specific plans
 * - Or add to settings.json for auto-load:
 *   { "extensions": ["minimax-usage"] }
 * - For auto-enable on startup when using MiniMax:
 *   Extension auto-enables when you use a MiniMax model
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Context } from "@mariozechner/pi-coding-agent";

interface ModelRemain {
  start_time: number;
  end_time: number;
  remains_time: number;
  current_interval_total_count: number;
  current_interval_usage_count: number;
  model_name: string;
  group_name?: string;
}

interface UsageResponse {
  model_remains: ModelRemain[];
}

interface PlanInfo {
  name: string;
  modelPattern: RegExp;
  displayName: string;
  icon: string;
}

const PLAN_TYPES: PlanInfo[] = [
  { name: "coding", modelPattern: /^minimax-/i, displayName: "Coding", icon: "💻" },
  { name: "image", modelPattern: /image/i, displayName: "Image", icon: "🖼️" },
  { name: "speech", modelPattern: /speech|tts|voice/i, displayName: "Speech", icon: "🗣️" },
  { name: "music", modelPattern: /music|song/i, displayName: "Music", icon: "🎵" },
  { name: "hailuo", modelPattern: /hailuo|video/i, displayName: "Hailuo", icon: "🎬" },
];

const API_URL = "https://api.minimax.io/v1/api/openplatform/coding_plan/remains";
const CACHE_TTL = 60000; // 1 minute cache

let interval: number;
let enabled = true;
let cachedUsage: UsageResponse | null = null;
let lastFetchTime = 0;

export default function (pi: ExtensionAPI) {
  async function fetchUsage(ctx: Context): Promise<UsageResponse | null> {
    // Return cached data if fresh
    const now = Date.now();
    if (cachedUsage && now - lastFetchTime < CACHE_TTL) {
      return cachedUsage;
    }

    try {
      const apiKey = await ctx.modelRegistry.getApiKeyForProvider("minimax");
      if (!apiKey) return null;

      const response = await fetch(API_URL, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
      });

      if (!response.ok) return null;

      cachedUsage = await response.json();
      lastFetchTime = now;
      return cachedUsage;
    } catch(err) {
      console.error(err)
      return null;
    }
  }

  async function fetchCodingPlanUsage(ctx: Context) {
    if (!enabled) return;

    try {
      const usage = await fetchUsage(ctx);
      if (!usage) {
        disableExtension(ctx);
        return;
      }

      // Find coding plan (minimax-* models)
      const codingPlan = usage.model_remains.find(
        (m) => m.model_name && PLAN_TYPES[0].modelPattern.test(m.model_name)
      );

      if (codingPlan) {
        const percent = Math.abs(
          codingPlan.current_interval_usage_count - codingPlan.current_interval_total_count
        ) / codingPlan.current_interval_total_count;
        const timeRemainingMs = codingPlan.remains_time;

        const percentFormatted = (percent * 100).toFixed(2) + "%";
        const timeRemainingFormatted = humanizeTime(timeRemainingMs);

        const theme = ctx.ui.theme;
        const statusText =
          theme.fg("accent", "◉ ") +
          theme.fg("text", "MiniMax Coding") +
          theme.fg("dim", " | ") +
          theme.fg("success", percentFormatted) +
          theme.fg("dim", " | ") +
          theme.fg("warning", timeRemainingFormatted);

        ctx.ui.setStatus("coding-plan-percent", statusText);
      }
    } catch(err) {
      console.error(err)
      disableExtension(ctx);
    }
  }

  function disableExtension(ctx: Context) {
    if (!enabled) return;
    enabled = false;
    clearInterval(interval);
    ctx.ui.setStatus("coding-plan-percent", "");
  }

  function humanizeTime(ms: number): string {
    if (ms <= 0) return "0s";

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      return days + "d " + remainingHours + "h";
    } else if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return hours + "h " + remainingMinutes + "m";
    } else if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return minutes + "m " + remainingSeconds + "s";
    } else {
      return seconds + "s";
    }
  }

  function formatPlanUsage(plan: ModelRemain, planInfo: PlanInfo): string {
    const percent = Math.abs(
      plan.current_interval_usage_count - plan.current_interval_total_count
    ) / plan.current_interval_total_count;
    const percentFormatted = (percent * 100).toFixed(1) + "%";
    const used = plan.current_interval_usage_count;
    const total = plan.current_interval_total_count;
    const remaining = total - used;

    return `${planInfo.icon} ${planInfo.displayName}: ${percentFormatted} (${remaining}/${total}) - ${humanizeTime(plan.remains_time)}`;
  }

  // Enable on startup if using MiniMax model
  pi.on("session_start", async (_event, ctx) => {
    const model = ctx.model;
    if (model && model.provider === "minimax") {
      fetchCodingPlanUsage(ctx);
      interval = setInterval(() => {
        if (ctx.model?.provider === "minimax") {
          fetchCodingPlanUsage(ctx);
        }
      }, CACHE_TTL);
    }
  });

  pi.on("turn_end", async (_event, ctx) => {
    const apiKey = await ctx.modelRegistry.getApiKeyForProvider("minimax");
    if (ctx.model?.provider === "minimax" && apiKey?.startsWith("sk-cp")) {
      fetchCodingPlanUsage(ctx);
    }
  });

  pi.on("session_shutdown", () => {
    clearInterval(interval);
  });

  // Command: /minimax-status - Check all plan usages
  pi.registerCommand("minimax-status", {
    description: "Check all MiniMax plan usages",
    async handler(_args, ctx) {
      const usage = await fetchUsage(ctx);
      if (!usage) {
        ctx.ui.notify("Failed to fetch MiniMax usage", "error");
        return;
      }

      const lines: string[] = ["## MiniMax Plan Usage", ""];

      for (const planInfo of PLAN_TYPES) {
        const plan = usage.model_remains.find(
          (m) => m.model_name && planInfo.modelPattern.test(m.model_name)
        );

        if (plan) {
          lines.push(formatPlanUsage(plan, planInfo));
        } else {
          lines.push(`${planInfo.icon} ${planInfo.displayName}: Not found`);
        }
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // Command: /minimax-coding - Check coding plan usage
  pi.registerCommand("minimax-coding", {
    description: "Check MiniMax coding plan usage",
    async handler(_args, ctx) {
      const usage = await fetchUsage(ctx);
      if (!usage) {
        ctx.ui.notify("Failed to fetch MiniMax usage", "error");
        return;
      }

      const codingPlan = usage.model_remains.find(
        (m) => m.model_name && PLAN_TYPES[0].modelPattern.test(m.model_name)
      );

      if (codingPlan) {
        const planInfo = PLAN_TYPES[0];
        ctx.ui.notify(formatPlanUsage(codingPlan, planInfo), "info");
      } else {
        ctx.ui.notify("Coding plan not found", "warning");
      }
    },
  });

  // Command: /minimax-image - Check image plan usage
  pi.registerCommand("minimax-image", {
    description: "Check MiniMax image plan usage",
    async handler(_args, ctx) {
      const usage = await fetchUsage(ctx);
      if (!usage) {
        ctx.ui.notify("Failed to fetch MiniMax usage", "error");
        return;
      }

      const imagePlan = usage.model_remains.find(
        (m) => m.model_name && PLAN_TYPES[1].modelPattern.test(m.model_name)
      );

      if (imagePlan) {
        const planInfo = PLAN_TYPES[1];
        ctx.ui.notify(formatPlanUsage(imagePlan, planInfo), "info");
      } else {
        ctx.ui.notify("Image plan not found", "warning");
      }
    },
  });

  // Command: /minimax-speech - Check speech plan usage
  pi.registerCommand("minimax-speech", {
    description: "Check MiniMax speech plan usage",
    async handler(_args, ctx) {
      const usage = await fetchUsage(ctx);
      if (!usage) {
        ctx.ui.notify("Failed to fetch MiniMax usage", "error");
        return;
      }

      const speechPlan = usage.model_remains.find(
        (m) => m.model_name && PLAN_TYPES[2].modelPattern.test(m.model_name)
      );

      if (speechPlan) {
        const planInfo = PLAN_TYPES[2];
        ctx.ui.notify(formatPlanUsage(speechPlan, planInfo), "info");
      } else {
        ctx.ui.notify("Speech plan not found", "warning");
      }
    },
  });

  // Command: /minimax-music - Check music plan usage
  pi.registerCommand("minimax-music", {
    description: "Check MiniMax music plan usage",
    async handler(_args, ctx) {
      const usage = await fetchUsage(ctx);
      if (!usage) {
        ctx.ui.notify("Failed to fetch MiniMax usage", "error");
        return;
      }

      const musicPlan = usage.model_remains.find(
        (m) => m.model_name && PLAN_TYPES[3].modelPattern.test(m.model_name)
      );

      if (musicPlan) {
        const planInfo = PLAN_TYPES[3];
        ctx.ui.notify(formatPlanUsage(musicPlan, planInfo), "info");
      } else {
        ctx.ui.notify("Music plan not found", "warning");
      }
    },
  });

  // Command: /minimax-hailuo - Check hailuo/video plan usage
  pi.registerCommand("minimax-hailuo", {
    description: "Check MiniMax hailuo/video plan usage",
    async handler(_args, ctx) {
      const usage = await fetchUsage(ctx);
      if (!usage) {
        ctx.ui.notify("Failed to fetch MiniMax usage", "error");
        return;
      }

      const hailuoPlan = usage.model_remains.find(
        (m) => m.model_name && PLAN_TYPES[4].modelPattern.test(m.model_name)
      );

      if (hailuoPlan) {
        const planInfo = PLAN_TYPES[4];
        ctx.ui.notify(formatPlanUsage(hailuoPlan, planInfo), "info");
      } else {
        ctx.ui.notify("Hailuo plan not found", "warning");
      }
    },
  });
}
