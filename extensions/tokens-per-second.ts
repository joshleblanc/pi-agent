/**
 * Tokens Per Second Extension - displays tokens/second in the footer.
 *
 * Automatically enabled on startup. Shows cumulative average tok/s
 * based on completed messages.
 *
 * The footer displays:
 * - ↑{input tokens} ↓{output tokens} ${total cost} | {tps} tok/s {time} | {model}
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let totalOutputTokens = 0;
  let totalStreamingTime = 0;
  // Per-message streaming state. startMs = 0 means "no assistant stream in flight".
  let startMs = 0;
  let ttftMs = 0;

  const resetInFlight = () => {
    startMs = 0;
    ttftMs = 0;
  };

  const reset = (ctx: ExtensionContext) => {
    totalOutputTokens = 0;
    totalStreamingTime = 0;
    resetInFlight();
    update(ctx);
  };

  const update = (ctx: ExtensionContext) => {
    if (!ctx.hasUI) return;
    const theme = ctx.ui.theme;

    ctx.ui.setStatus("tps", theme.fg("accent", `${getAverageTps()} tok/s`));
    ctx.ui.setStatus("streaming-time", theme.fg("accent", `${totalStreamingTime.toFixed(2)}s`));
  };

  const getAverageTps = (): string => {
    if (totalStreamingTime > 0 && totalOutputTokens > 0) {
      return (totalOutputTokens / totalStreamingTime).toFixed(2);
    }
    return "--";
  };

  pi.on("session_start", async (_event, ctx) => {
    reset(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    reset(ctx);
  });

  pi.on("message_start", async (event: any, _ctx: ExtensionContext) => {
    // Only track assistant streams; user/toolResult messages have no decode phase.
    if (event.message.role !== "assistant") return;
    startMs = Date.now();
    ttftMs = 0;
  });

  pi.on("message_update", async (_event: any, _ctx: ExtensionContext) => {
    if (!startMs) return;
    // First streaming chunk arrival defines TTFT.
    if (ttftMs === 0) {
      ttftMs = Date.now() - startMs;
    }
  });

  pi.on("message_end", async (event: any, ctx: ExtensionContext) => {
    if (event.message.role !== "assistant") return;
    if (!startMs) return; // No paired message_start observed — skip.

    const outputTokens = event.message.usage?.output || 0;

    // Skip non-streamed responses (no chunk updates observed): they conflate
    // prefill/network with decode and would poison the decode-TPS average.
    if (!outputTokens || ttftMs === 0) {
      resetInFlight();
      return;
    }

    const elapsedSec = (Date.now() - startMs - ttftMs) / 1000;
    if (elapsedSec > 0) {
      totalOutputTokens += outputTokens;
      totalStreamingTime += elapsedSec;
    }

    resetInFlight();
    update(ctx);
  });
}
