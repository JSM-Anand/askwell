import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@askwell/shared";
import { isWidgetMessage } from "@askwell/shared/src/widget-messages";
import { start, type WidgetHandle } from "./loader";

const APP = "http://localhost:3000";
const config = (patch: Partial<WidgetConfig> = {}): WidgetConfig => ({ ...DEFAULT_WIDGET_CONFIG, ...patch });

function scriptTag(key: string | null = "pk_test"): HTMLScriptElement {
  const s = document.createElement("script");
  s.src = `${APP}/widget.js`;
  if (key !== null) s.dataset.key = key;
  return s;
}

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

let handle: WidgetHandle | undefined;
const run = async (getJson: typeof fetch, script = scriptTag()) => (handle = await start(script, document, getJson));
const shadow = () => handle!.host.shadowRoot!;
const button = () => shadow().querySelector("button")!;
const frame = () => shadow().querySelector("iframe");

function post(data: unknown, origin = APP, source: MessageEventSource | null = frame()?.contentWindow ?? null) {
  window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "<p>host page</p>";
});

afterEach(() => handle?.destroy());

describe("when the config can't be used", () => {
  it("renders nothing for a non-200 response", async () => {
    expect(await run(reply({ error: { code: "not_found", message: "x" } }, 404))).toBeUndefined();
    expect(document.body.children).toHaveLength(1);
  });

  it("renders nothing, and throws nothing, when fetch rejects", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    expect(await run(failing)).toBeUndefined();
    expect(document.body.children).toHaveLength(1);
  });

  it("renders nothing for a malformed config", async () => {
    expect(await run(reply({ ...config(), buttonColor: "red; background:url(x)" }))).toBeUndefined();
    expect(await run(reply({ ...config(), position: "middle" }))).toBeUndefined();
    expect(await run(reply("nope"))).toBeUndefined();
    expect(document.body.children).toHaveLength(1);
  });

  it("does not fetch without a data-key", async () => {
    const getJson = reply(config());
    expect(await run(getJson, scriptTag(null))).toBeUndefined();
    expect(getJson).not.toHaveBeenCalled();
  });
});

describe("button", () => {
  it("asks the app origin from the script src for the key's config", async () => {
    const getJson = reply(config());
    await run(getJson, scriptTag("pk_a b"));
    expect(getJson).toHaveBeenCalledWith(`${APP}/api/widget/config?key=pk_a%20b`);
  });

  it("uses the label, color and corner from the config", async () => {
    await run(reply(config({ label: "Help", buttonColor: "#ff0000", position: "top-left" })));
    const css = shadow().querySelector("style")!.textContent!;
    expect(button().textContent).toBe("Help");
    expect(css).toContain("background:#ff0000");
    expect(css).toContain("top:20px;left:20px");
  });

  it("renders the label as text, not HTML", async () => {
    await run(reply(config({ label: "<img src=x onerror=alert(1)>" })));
    expect(shadow().querySelector("img")).toBeNull();
    expect(button().textContent).toContain("<img");
  });

  it("leaves the host page alone: nothing in head, one added element in body", async () => {
    await run(reply(config()));
    expect(document.head.children).toHaveLength(0);
    expect(document.body.children).toHaveLength(2);
    expect(document.body.firstElementChild?.textContent).toBe("host page");
  });
});

describe("panel", () => {
  it("opens an iframe on click and hides it on the second click", async () => {
    await run(reply(config({ animation: "slide" })));
    expect(frame()).toBeNull();
    button().click();
    expect(frame()?.src).toBe(`${APP}/embed?key=pk_test&origin=${encodeURIComponent(location.origin)}`);
    expect(frame()?.classList.contains("o")).toBe(true);
    expect(shadow().querySelector("style")!.textContent).toContain("translateY(16px)");
    button().click();
    expect(frame()?.classList.contains("o")).toBe(false);
  });

  it("handles close, resize and unread from the panel", async () => {
    await run(reply(config()));
    button().click();

    post({ type: "resize", height: 400 });
    expect(frame()!.style.height).toBe("400px");

    post({ type: "close" });
    expect(frame()!.classList.contains("o")).toBe(false);

    post({ type: "unread", count: 2 });
    expect(button().classList.contains("u")).toBe(true);
    button().click();
    expect(button().classList.contains("u")).toBe(false);
  });
});

describe("messages from anywhere else", () => {
  beforeEach(async () => {
    await run(reply(config()));
    button().click();
  });

  it("ignores a message from another origin", () => {
    post({ type: "close" }, "https://evil.example");
    expect(frame()!.classList.contains("o")).toBe(true);
    post({ type: "resize", height: 300 }, "https://evil.example");
    expect(frame()!.style.height).toBe("");
  });

  it("ignores a message that does not come from the iframe", () => {
    post({ type: "close" }, APP, window);
    expect(frame()!.classList.contains("o")).toBe(true);
  });

  it("ignores malformed messages from the right origin", () => {
    for (const data of [null, "close", { type: "nope" }, { type: "resize", height: "tall" }, { type: "unread", count: -1 }]) {
      post(data);
    }
    expect(frame()!.classList.contains("o")).toBe(true);
    expect(frame()!.style.height).toBe("");
  });
});

describe("isWidgetMessage", () => {
  it("accepts the three message shapes", () => {
    expect(isWidgetMessage({ type: "close" })).toBe(true);
    expect(isWidgetMessage({ type: "resize", height: 320 })).toBe(true);
    expect(isWidgetMessage({ type: "unread", count: 0 })).toBe(true);
  });

  it("rejects everything else", () => {
    for (const v of [undefined, 1, [], { type: "resize" }, { type: "resize", height: 0 }, { type: "resize", height: Infinity }, { type: "unread", count: 1.5 }]) {
      expect(isWidgetMessage(v)).toBe(false);
    }
  });
});
