/**
 * WHAT IS THIS FILE?
 *
 * SSR entry point used by the static adapter to pre-render the application at
 * build time. All pages are rendered outside the browser and emitted as static
 * HTML to dist/.
 *
 * - pnpm build (static pre-render via adapters/static)
 *
 */
import {
  renderToStream,
  type RenderToStreamOptions,
} from "@builder.io/qwik/server";
import Root from "./root";

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    ...opts,
    containerAttributes: {
      lang: "en-us",
      ...opts.containerAttributes,
    },
    serverData: {
      ...opts.serverData,
    },
  });
}
