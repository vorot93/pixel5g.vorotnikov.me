import { component$ } from "@builder.io/qwik";
export const LogPanel = component$<{ lines: string[] }>(({ lines }) => (
  <pre class="mt-4 max-h-64 overflow-auto rounded bg-black/80 p-3 font-mono text-xs text-gray-200">
    {lines.length ? lines.join("\n") : "> waiting…"}
  </pre>
));
