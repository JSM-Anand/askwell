import type { WidgetAnimation, WidgetConfig, WidgetPosition } from "@askwell/shared";
import { isWidgetMessage } from "@askwell/shared/src/widget-messages";

// Not imported from "@askwell/shared": that entry pulls zod into the bundle.
const POSITIONS: readonly WidgetPosition[] = ["bottom-right", "bottom-left", "top-right", "top-left"];
const ANIMATIONS: readonly WidgetAnimation[] = ["fade", "slide", "scale"];

type Look = Pick<WidgetConfig, "buttonColor" | "position" | "label" | "animation">;

export type WidgetHandle = { host: HTMLElement; destroy: () => void };

function readLook(data: unknown): Look | null {
  if (typeof data !== "object" || data === null) return null;
  const { buttonColor, position, label, animation } = data as Record<string, unknown>;
  if (typeof buttonColor !== "string" || !/^#[0-9a-f]{6}$/i.test(buttonColor)) return null;
  if (typeof label !== "string") return null;
  if (!POSITIONS.includes(position as WidgetPosition)) return null;
  if (!ANIMATIONS.includes(animation as WidgetAnimation)) return null;
  return { buttonColor, position: position as WidgetPosition, label, animation: animation as WidgetAnimation };
}

/** Readable text color for a #rrggbb background. */
function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? "#000" : "#fff";
}

function css({ buttonColor, position, animation }: Look): string {
  const [v, h] = position.split("-") as [string, string];
  const hidden = animation === "slide" ? `translateY(${v === "top" ? "-" : ""}16px)` : animation === "scale" ? "scale(.9)" : "none";
  return (
    `:host{all:initial}*{box-sizing:border-box}` +
    `button{position:fixed;${v}:20px;${h}:20px;z-index:2147483647;font:600 14px system-ui,sans-serif;padding:12px 18px;border:0;border-radius:999px;cursor:pointer;background:${buttonColor};color:${textOn(buttonColor)};box-shadow:0 4px 16px #0004}` +
    `i{position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:#e11d48;border:2px solid #fff;display:none}` +
    `.u i{display:block}` +
    `iframe{position:fixed;${v}:80px;${h}:20px;z-index:2147483647;width:min(380px,calc(100vw - 40px));height:min(560px,calc(100vh - 100px));border:0;border-radius:16px;box-shadow:0 8px 32px #0005;background:#fff;opacity:0;visibility:hidden;transform:${hidden};transform-origin:${v === "top" ? "top" : "bottom"} ${h};transition:opacity .2s,transform .2s,visibility .2s}` +
    `iframe.o{opacity:1;visibility:visible;transform:none}` +
    `@media(prefers-reduced-motion:reduce){iframe{transition:none}}`
  );
}

function mount(origin: string, key: string, look: Look, doc: Document): WidgetHandle {
  const host = doc.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = css(look);
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = look.label;
  button.setAttribute("aria-expanded", "false");
  button.append(doc.createElement("i"));
  root.append(style, button);

  let open = false;
  let unread = 0;
  let frame: HTMLIFrameElement | undefined;

  const sync = () => {
    button.setAttribute("aria-expanded", String(open));
    button.classList.toggle("u", !open && unread > 0);
    frame?.classList.toggle("o", open);
  };

  const toggle = (next: boolean) => {
    open = next;
    if (open) {
      unread = 0;
      if (!frame) {
        frame = doc.createElement("iframe");
        frame.title = look.label;
        frame.src = `${origin}/embed?key=${encodeURIComponent(key)}&origin=${encodeURIComponent(location.origin)}`;
        root.append(frame);
        frame.getBoundingClientRect(); // commit the hidden state so the first open animates
      }
    }
    sync();
  };

  button.addEventListener("click", () => toggle(!open));

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== origin || !frame || event.source !== frame.contentWindow) return;
    const msg: unknown = event.data;
    if (!isWidgetMessage(msg)) return;
    if (msg.type === "close") toggle(false);
    else if (msg.type === "resize") frame.style.height = `${Math.max(200, Math.min(msg.height, innerHeight - 100))}px`;
    else {
      unread = msg.count;
      sync();
    }
  };
  addEventListener("message", onMessage);

  (doc.body ?? doc.documentElement).append(host);
  return {
    host,
    destroy: () => {
      removeEventListener("message", onMessage);
      host.remove();
    },
  };
}

/** Reads data-key and the app origin from the script tag, fetches the config, draws the button. Never throws. */
export async function start(
  script: HTMLScriptElement,
  doc: Document = document,
  getJson: typeof fetch = (input, init) => fetch(input, init),
): Promise<WidgetHandle | undefined> {
  try {
    const key = script.dataset.key;
    if (!key || !script.src) return;
    const origin = new URL(script.src).origin;
    const res = await getJson(`${origin}/api/widget/config?key=${encodeURIComponent(key)}`);
    if (res.status !== 200) return;
    const look = readLook(await res.json());
    if (!look) return;
    return mount(origin, key, look, doc);
  } catch {
    return;
  }
}
