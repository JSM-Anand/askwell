import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { APP_NAME } from "@askwell/shared";
import { metadata } from "./layout";
import Home from "./page";

describe("home page", () => {
  it("shows APP_NAME", () => {
    expect(renderToStaticMarkup(<Home />)).toContain(APP_NAME);
  });

  it("uses APP_NAME as the title", () => {
    expect(metadata.title).toBe(APP_NAME);
  });
});
