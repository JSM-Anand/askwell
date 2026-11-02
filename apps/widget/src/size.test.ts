// @vitest-environment node
import { build } from "esbuild";
import { expect, it } from "vitest";

const MAX_BYTES = 5 * 1024;

it("bundles to under 5 kb minified (no zod, no shared index)", async () => {
  const result = await build({
    entryPoints: [new URL("./index.ts", import.meta.url).pathname],
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2020",
    outfile: "widget.js",
    write: false,
  });
  const code = result.outputFiles[0]!.text;
  expect(code).not.toContain("ZodError");
  expect(new TextEncoder().encode(code).length).toBeLessThan(MAX_BYTES);
});
