// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import type { Plan, WidgetConfig } from "@askwell/shared";
import { CustomizeView } from "./CustomizeView";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const bodyOf = (call: number) => JSON.parse((fetchMock.mock.calls[call] as [string, RequestInit])[1].body as string);

const view = (plan: Plan = "pro", config: Partial<WidgetConfig> = {}) =>
  render(<CustomizeView projectId={PROJECT} plan={plan} initialConfig={{ ...DEFAULT_WIDGET_CONFIG, ...config }} />);

const previewButton = () => document.querySelector('[data-preview="button"]') as HTMLElement;
const previewPanel = () => document.querySelector('[data-preview="panel"]') as HTMLElement;
const colorField = () => screen.getByLabelText("Button color") as HTMLInputElement;
const labelField = () => screen.getByLabelText("Button label") as HTMLInputElement;
const headerField = () => screen.getByLabelText("Header text") as HTMLInputElement;
const badgeField = () => screen.getByLabelText(/Powered by Askwell/) as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: /Save changes|Saving…/ }) as HTMLButtonElement;
// An input inside a disabled <fieldset> is disabled for the user and for :disabled, but its own `.disabled`
// property stays false, so ask the browser's question: is it disabled?
const isDisabled = (el: HTMLElement) => el.matches(":disabled");
const type = async (field: HTMLElement, text: string) => {
  await userEvent.clear(field);
  await userEvent.type(field, text);
};

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockReset();
});

describe("the preview follows the form", () => {
  it("starts from the saved settings", () => {
    view("pro", { buttonColor: "#112233", label: "Help me", headerText: "Support", position: "top-left", animation: "scale", showBadge: false });
    expect(previewButton().textContent).toBe("Help me");
    expect(getComputedStyle(previewButton()).backgroundColor).toBe("rgb(17, 34, 51)");
    expect(document.querySelector('[data-preview="header"]')?.textContent).toBe("Support");
    expect(previewButton().dataset.position).toBe("top-left");
    expect(previewPanel().dataset.animation).toBe("scale");
    expect(document.querySelector('[data-preview="badge"]')).toBeNull();
  });

  it("changes the button label as it is typed", async () => {
    view();
    await type(labelField(), "Chat with Sam");
    expect(previewButton().textContent).toBe("Chat with Sam");
  });

  it("changes the button color from the hex field, and keeps the text readable", async () => {
    view();
    await type(colorField(), "#ffff00");
    expect(getComputedStyle(previewButton()).backgroundColor).toBe("rgb(255, 255, 0)");
    expect(getComputedStyle(previewButton()).color).toBe("rgb(0, 0, 0)");
    await type(colorField(), "#112233");
    expect(getComputedStyle(previewButton()).color).toBe("rgb(255, 255, 255)");
  });

  it("changes the button color from the color picker too, and the hex field follows", () => {
    view();
    fireEvent.change(screen.getByLabelText("Pick a button color"), { target: { value: "#00ff80" } });
    expect(getComputedStyle(previewButton()).backgroundColor).toBe("rgb(0, 255, 128)");
    expect(colorField().value).toBe("#00ff80");
  });

  it("moves the button and the panel to the chosen corner", async () => {
    view();
    const corners: [string, string][] = [["Top left", "top-left"], ["Top right", "top-right"], ["Bottom left", "bottom-left"], ["Bottom right", "bottom-right"]];
    for (const [label, position] of corners) {
      await userEvent.click(screen.getByLabelText(label));
      expect(previewButton().dataset.position).toBe(position);
      expect(previewPanel().dataset.position).toBe(position);
    }
  });

  it("changes the open animation", async () => {
    view();
    await userEvent.click(screen.getByLabelText("Slide"));
    expect(previewPanel().dataset.animation).toBe("slide");
    await userEvent.click(screen.getByLabelText("Scale"));
    expect(previewPanel().dataset.animation).toBe("scale");
  });

  it("plays the opening animation again when the animation or the corner changes, and on Replay", async () => {
    view();
    const first = previewPanel();
    await userEvent.click(screen.getByLabelText("Scale"));
    const afterAnimation = previewPanel();
    expect(afterAnimation).not.toBe(first); // a new element: the animation starts over
    await userEvent.click(screen.getByLabelText("Top left"));
    const afterCorner = previewPanel();
    expect(afterCorner).not.toBe(afterAnimation);
    await userEvent.click(screen.getByRole("button", { name: "Replay animation" }));
    expect(previewPanel()).not.toBe(afterCorner);
  });

  it("does not replay the animation for an unrelated change, such as the label", async () => {
    view();
    const panel = previewPanel();
    await type(labelField(), "Help");
    expect(previewPanel()).toBe(panel);
  });

  it("changes the header text", async () => {
    view();
    await type(headerField(), "Ask Sam anything");
    expect(document.querySelector('[data-preview="header"]')?.textContent).toBe("Ask Sam anything");
  });

  it("shows and hides the Powered by badge with the toggle", async () => {
    view();
    expect(document.querySelector('[data-preview="badge"]')?.textContent).toBe("Powered by Askwell");
    await userEvent.click(badgeField());
    expect(document.querySelector('[data-preview="badge"]')).toBeNull();
    await userEvent.click(badgeField());
    expect(document.querySelector('[data-preview="badge"]')).not.toBeNull();
  });

  it("keeps drawing the last good value while a field is half typed or empty", async () => {
    view("pro", { buttonColor: "#112233", label: "Saved label" });
    await type(colorField(), "#ff");
    expect(getComputedStyle(previewButton()).backgroundColor).toBe("rgb(17, 34, 51)");
    await userEvent.clear(labelField());
    expect(previewButton().textContent).toBe("Saved label");
  });

  it("shows label and header text as text, never HTML", async () => {
    view();
    await type(labelField(), "<b>bold</b>");
    expect(previewButton().textContent).toBe("<b>bold</b>");
    expect(document.querySelector("[data-preview=button] b")).toBeNull();
  });
});

describe("Free: the form is visible but locked", () => {
  it("shows the upgrade prompt with a link to billing", () => {
    view("free");
    expect(screen.getByText(/Customize is a Pro feature\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Upgrade to Pro" }).getAttribute("href")).toBe("/dashboard/billing");
  });

  it("shows every field, all disabled, and a disabled Save", () => {
    view("free");
    for (const field of [colorField(), labelField(), headerField(), badgeField(), screen.getByLabelText("Pick a button color"), screen.getByLabelText("Top left"), screen.getByLabelText("Slide")]) {
      expect(isDisabled(field as HTMLElement), field.outerHTML.slice(0, 60)).toBe(true);
    }
    expect(isDisabled(saveButton())).toBe(true);
  });

  it("can't be changed, and sends nothing", async () => {
    view("free");
    await userEvent.type(labelField(), "x");
    await userEvent.click(screen.getByLabelText("Top left"));
    fireEvent.submit(screen.getByRole("form", { name: "Widget settings" }));
    expect(labelField().value).toBe(DEFAULT_WIDGET_CONFIG.label);
    expect(previewButton().dataset.position).toBe("bottom-right");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still shows a preview, of how the widget looks to visitors now", () => {
    view("free");
    expect(previewButton().textContent).toBe(DEFAULT_WIDGET_CONFIG.label);
    expect(screen.getByText(/how your widget looks to visitors now/)).toBeTruthy();
  });

  it("has no prompt for Pro", () => {
    view("pro");
    expect(screen.queryByText(/Customize is a Pro feature/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Upgrade to Pro" })).toBeNull();
    expect(isDisabled(labelField())).toBe(false);
  });
});

describe("a 402 from the server", () => {
  it("shows the same upgrade prompt and locks the form, even though the page thought the plan was Pro", async () => {
    fetchMock.mockResolvedValueOnce(reply(402, { error: { code: "plan_required", message: "Customizing the widget is a Pro feature." } }));
    view("pro");
    await type(labelField(), "Help");
    await userEvent.click(saveButton());

    await screen.findByText(/Customize is a Pro feature\./);
    expect(screen.getByRole("link", { name: "Upgrade to Pro" }).getAttribute("href")).toBe("/dashboard/billing");
    expect(isDisabled(labelField())).toBe(true);
    expect(isDisabled(saveButton())).toBe(true);
  });

  it("does not show a generic error as well", async () => {
    fetchMock.mockResolvedValueOnce(reply(402, { error: { code: "plan_required", message: "x" } }));
    view("pro");
    await type(labelField(), "Help");
    await userEvent.click(saveButton());
    await screen.findByText(/Customize is a Pro feature\./);
    expect(screen.queryByText("That didn't save")).toBeNull();
  });
});

describe("Save", () => {
  const saved = (over: Partial<WidgetConfig> = {}) => reply(200, { config: { ...DEFAULT_WIDGET_CONFIG, ...over } });

  it("starts disabled: nothing has changed", () => {
    view();
    expect(saveButton().disabled).toBe(true);
  });

  it("sends only the field that changed", async () => {
    fetchMock.mockResolvedValueOnce(saved({ buttonColor: "#ff0000" }));
    view();
    await type(colorField(), "#ff0000");
    await userEvent.click(saveButton());
    await screen.findByText(/Saved\./);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT}/config`);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe("PATCH");
    expect(bodyOf(0)).toEqual({ buttonColor: "#ff0000" });
  });

  it("sends several changed fields, and no unchanged ones", async () => {
    fetchMock.mockResolvedValueOnce(saved({ label: "Help", position: "top-left", showBadge: false }));
    view();
    await type(labelField(), "Help");
    await userEvent.click(screen.getByLabelText("Top left"));
    await userEvent.click(badgeField());
    await userEvent.click(saveButton());
    await screen.findByText(/Saved\./);
    expect(bodyOf(0)).toEqual({ label: "Help", position: "top-left", showBadge: false });
  });

  it("sends the trimmed text", async () => {
    fetchMock.mockResolvedValueOnce(saved({ label: "Help" }));
    view();
    await type(labelField(), "  Help  ");
    await userEvent.click(saveButton());
    await screen.findByText(/Saved\./);
    expect(bodyOf(0)).toEqual({ label: "Help" });
  });

  it("sends false when the badge is hidden (it is a value, not 'unchanged')", async () => {
    fetchMock.mockResolvedValueOnce(saved({ showBadge: false }));
    view();
    await userEvent.click(badgeField());
    await userEvent.click(saveButton());
    await screen.findByText(/Saved\./);
    expect(bodyOf(0)).toEqual({ showBadge: false });
  });

  it("shows a success toast, and treats what was saved as the new baseline", async () => {
    fetchMock.mockResolvedValueOnce(saved({ label: "Help" })).mockResolvedValueOnce(saved({ label: "Help", headerText: "Support" }));
    view();
    await type(labelField(), "Help");
    await userEvent.click(saveButton());
    await screen.findByText(/Saved\. Your widget shows the change/);
    expect(saveButton().disabled).toBe(true); // nothing differs from the saved config now

    await type(headerField(), "Support");
    await userEvent.click(saveButton());
    await waitForCalls(2);
    expect(bodyOf(1)).toEqual({ headerText: "Support" }); // the label is not sent again
  });

  it("is disabled and says Saving… while it works", async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    view();
    await type(labelField(), "Help");
    await userEvent.click(saveButton());
    expect(screen.getByRole("button", { name: "Saving…" }).hasAttribute("disabled")).toBe(true);
    await act(async () => finish(saved({ label: "Help" })));
    await screen.findByText(/Saved\./);
  });

  it("uses what the server returns as the saved config", async () => {
    fetchMock.mockResolvedValueOnce(saved({ label: "Help", buttonColor: "#00ff00" }));
    view();
    await type(labelField(), "Help");
    await userEvent.click(saveButton());
    await screen.findByText(/Saved\./);
    expect(getComputedStyle(previewButton()).backgroundColor).toBe("rgb(0, 255, 0)");
  });

  it("hides the toast after a few seconds, and it can be dismissed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockResolvedValue(saved({ label: "Help" }));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    view();
    await user.clear(labelField());
    await user.type(labelField(), "Help");
    await user.click(saveButton());
    await screen.findByText(/Saved\./);
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.queryByText(/Saved\./)).toBeNull();

    await user.clear(labelField());
    await user.type(labelField(), "More help");
    await user.click(saveButton());
    await screen.findByText(/Saved\./);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Saved\./)).toBeNull();
  });
});

describe("validation errors show next to the field", () => {
  it("flags a bad hex color as it is typed, and sends nothing", async () => {
    view();
    await type(colorField(), "red");
    expect(screen.getByText("Use a hex color like #1a2b3c.")).toBeTruthy();
    expect(colorField().getAttribute("aria-invalid")).toBe("true");
    expect(colorField().getAttribute("aria-describedby")).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
    await userEvent.click(saveButton());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flags an empty label and header, each next to its own field", async () => {
    view();
    await userEvent.clear(labelField());
    await userEvent.clear(headerField());
    expect(screen.getByText("Enter a label.")).toBeTruthy();
    expect(screen.getByText("Enter a header.")).toBeTruthy();
    expect(labelField().getAttribute("aria-invalid")).toBe("true");
    expect(headerField().getAttribute("aria-invalid")).toBe("true");
    expect(colorField().getAttribute("aria-invalid")).toBeNull();
  });

  it("clears the message once the value is valid", async () => {
    view();
    await type(colorField(), "red");
    expect(screen.getByText("Use a hex color like #1a2b3c.")).toBeTruthy();
    await type(colorField(), "#00ff00");
    expect(screen.queryByText("Use a hex color like #1a2b3c.")).toBeNull();
  });

  it("limits the label and header length in the field itself", () => {
    view();
    expect(labelField().maxLength).toBe(40);
    expect(headerField().maxLength).toBe(60);
  });

  it("does not shout about fields the owner hasn't touched", () => {
    view();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("when the server says no", () => {
  it("shows a message for a 400 and keeps what was typed", async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: { code: "invalid_input", message: "Send at least one valid widget setting." } }));
    view();
    await type(labelField(), "Help");
    await userEvent.click(saveButton());
    await screen.findByText("That didn't save");
    expect(screen.getByText(/Some settings aren't valid/)).toBeTruthy();
    expect(labelField().value).toBe("Help");
    expect(saveButton().disabled).toBe(false);
  });

  it("shows the message for any other error, and lets the owner try again", async () => {
    fetchMock.mockResolvedValueOnce(reply(500, { error: { code: "internal_error", message: "Something went wrong." } })).mockResolvedValueOnce(reply(200, { config: { ...DEFAULT_WIDGET_CONFIG, label: "Help" } }));
    view();
    await type(labelField(), "Help");
    await userEvent.click(saveButton());
    await screen.findByText("Something went wrong.");
    await userEvent.click(saveButton());
    await screen.findByText(/Saved\./);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("can dismiss the error", async () => {
    fetchMock.mockResolvedValueOnce(reply(500, { error: { code: "internal_error", message: "Something went wrong." } }));
    view();
    await type(labelField(), "Help");
    await userEvent.click(saveButton());
    await screen.findByText("Something went wrong.");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Something went wrong.")).toBeNull();
  });
});

async function waitForCalls(n: number) {
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(n));
}
