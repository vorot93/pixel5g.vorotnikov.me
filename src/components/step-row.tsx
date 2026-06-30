import { component$, Slot } from "@builder.io/qwik";
export type StepState = "idle" | "active" | "running" | "done" | "error";
const MARK: Record<StepState, string> = { idle: "·", active: "▶", running: "…", done: "✓", error: "✗" };
export const StepRow = component$<{ n: number; title: string; state: StepState; detail?: string }>(
  ({ n, title, state, detail }) => (
    <div class={["flex items-center gap-3 rounded-lg border p-3",
      state === "active" ? "border-blue-400 bg-blue-50 dark:bg-blue-950" :
      state === "error" ? "border-red-400 bg-red-50 dark:bg-red-950" :
      state === "done" ? "border-gray-200 opacity-70" : "border-gray-200"]}>
      <span class="flex h-6 w-6 items-center justify-center rounded-full border text-xs">{MARK[state]}</span>
      <div class="flex-1">
        <div class="text-sm font-medium">{n}. {title}</div>
        {detail && <div class="text-xs text-gray-500">{detail}</div>}
      </div>
      <Slot />
    </div>
  ),
);
