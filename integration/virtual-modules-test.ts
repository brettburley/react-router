import { expect } from "@playwright/test";
import type { Files } from "./helpers/vite.js";
import { test, viteConfig, build, createProject } from "./helpers/vite.js";

const js = String.raw;

const customVirtualModulesFiles: Files = async ({ port }) => ({
  "vite.config.ts": js`
    import { defineConfig } from "vite";
    import { reactRouterVitePlugin } from "@react-router/dev/vite";

    // Custom plugin to override virtual modules
    function customEntryPlugin() {
      return {
        name: "custom-entry-plugin",
        resolveId(id) {
          if (id === "virtual:react-router/root") {
            return "virtual:custom-root";
          }
          if (id === "virtual:react-router/routes") {
            return "virtual:custom-routes";
          }
          if (id === "virtual:react-router/entry.client") {
            return "virtual:custom-entry-client";
          }
          if (id === "virtual:react-router/entry.server") {
            return "virtual:custom-entry-server";
          }
        },
        load(id) {
          if (id === "virtual:custom-root") {
            return 'export * from "./app/custom/root.tsx";';
          }
          if (id === "virtual:custom-routes") {
            return 'export { default } from "./app/custom/app-routes.ts";';
          }
          if (id === "virtual:custom-entry-client") {
            return 'export * from "./app/custom/entry.client.tsx";';
          }
          if (id === "virtual:custom-entry-server") {
            return 'export * from "./app/custom/entry.server.tsx";';
          }
        },
      };
    }

    export default defineConfig({
      plugins: [customEntryPlugin(), ...reactRouterVitePlugin()],
      server: { port: ${port} },
    });
  `,
  "react-router.config.ts": js`
    export default {};
  `,
  "app/root.tsx": js`
    import { Links, Meta, Outlet, Scripts } from "react-router";

    export default function Root() {
      return (
        <html lang="en">
          <head>
            <Meta />
            <Links />
          </head>
          <body>
            <div id="content">
              <h1>Default Root</h1>
              <Outlet />
            </div>
            <Scripts />
          </body>
        </html>
      );
    }
  `,
  "app/routes.ts": js`
    import { type RouteConfig, index } from "@react-router/dev/routes";

    export default [
      index("index.tsx"),
    ] satisfies RouteConfig;
  `,
  "app/custom/root.tsx": js`
    import { Links, Meta, Outlet, Scripts } from "react-router";

    export default function Root() {
      return (
        <html lang="en">
          <head>
            <Meta />
            <Links />
          </head>
          <body>
            <div id="content">
              <h1>Custom Virtual Root</h1>
              <Outlet />
            </div>
            <Scripts />
          </body>
        </html>
      );
    }
  `,
  "app/custom/app-routes.ts": js`
    import { type RouteConfig, index } from "@react-router/dev/routes";

    export default [
      index("index.tsx"),
    ] satisfies RouteConfig;
  `,
  "app/index.tsx": js`
    export default function IndexRoute() {
      return <div id="hydrated" onClick={() => {}}>Custom IndexRoute</div>
    }
  `,
  "app/custom/entry.client.tsx": js`
    import { HydratedRouter } from "react-router/dom";
    import { startTransition, StrictMode } from "react";
    import { hydrateRoot } from "react-dom/client";

    window.__customVirtualClientEntryExecuted = true;

    startTransition(() => {
      hydrateRoot(
        document,
        <StrictMode>
          <HydratedRouter discover={"none"} />
        </StrictMode>
      );
    });
  `,
  "app/custom/entry.server.tsx": js`
    import * as React from "react";
    import { ServerRouter } from "react-router";
    import { renderToString } from "react-dom/server";

    export default function handleRequest(
      request,
      responseStatusCode,
      responseHeaders,
      remixContext
    ) {
      let markup = renderToString(
        <ServerRouter context={remixContext} url={request.url} />
      );
      responseHeaders.set("Content-Type", "text/html");
      responseHeaders.set("X-Custom-Virtual-Server-Entry", "true");
      return new Response('<!DOCTYPE html>' + markup, {
        headers: responseHeaders,
        status: responseStatusCode,
      });
    }
  `,
});

const defaultVirtualModulesFiles: Files = async ({ port }) => ({
  "vite.config.ts": await viteConfig.basic({ port }),
  "react-router.config.ts": js`
    export default {};
  `,
  "app/root.tsx": js`
    import { Links, Meta, Outlet, Scripts } from "react-router";

    export default function Root() {
      return (
        <html lang="en">
          <head>
            <Meta />
            <Links />
          </head>
          <body>
            <div id="content">
              <h1>Default Root</h1>
              <Outlet />
            </div>
            <Scripts />
          </body>
        </html>
      );
    }
  `,
  "app/routes.ts": js`
    import { type RouteConfig, index } from "@react-router/dev/routes";

    export default [
      index("index.tsx"),
    ] satisfies RouteConfig;
  `,
  "app/index.tsx": js`
    export default function IndexRoute() {
      return <div id="hydrated" onClick={() => {}}>Default IndexRoute</div>
    }
  `,
});

test.describe("Virtual Modules", () => {
  test("uses default virtual modules when no overrides", async ({ page, dev }) => {
    let { port } = await dev(defaultVirtualModulesFiles);
    await page.goto(`http://localhost:${port}/`);

    // Verify default files are being used
    await expect(page.locator("h1")).toHaveText("Default Root");
    await expect(page.locator("#content div")).toHaveText("Default IndexRoute");
  });

  test("allows overriding virtual modules with custom plugin", async ({ page, dev, request }) => {
    let { port } = await dev(customVirtualModulesFiles);
    const response = await page.goto(`http://localhost:${port}/`);

    // Verify custom virtual modules are being used
    await expect(page.locator("h1")).toHaveText("Custom Virtual Root");
    await expect(page.locator("#content div")).toHaveText("Custom IndexRoute");

    // Verify custom client entry is being used
    expect(
      await page.evaluate(() => (window as any).__customVirtualClientEntryExecuted)
    ).toBe(true);

    // Verify custom server entry is used by checking for the custom header
    expect(response?.headers()["x-custom-virtual-server-entry"]).toBe("true");
  });
});
