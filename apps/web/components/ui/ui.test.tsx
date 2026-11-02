import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { GlassPanel } from "./GlassPanel";
import { Input } from "./Input";
import { Spinner } from "./Spinner";

describe("ui components", () => {
  it("renders Button variants", () => {
    const html = renderToStaticMarkup(
      <>
        <Button>Save</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="ghost">Skip</Button>
      </>,
    );
    expect(html).toContain("Save");
    expect(html).toContain("Cancel");
    expect(html).toContain("Skip");
    expect(html).toContain('type="button"');
  });

  it("renders GlassPanel children", () => {
    expect(renderToStaticMarkup(<GlassPanel>Inside</GlassPanel>)).toContain("Inside");
  });

  it("renders Input and marks it invalid", () => {
    const html = renderToStaticMarkup(<Input placeholder="Email" invalid />);
    expect(html).toContain('placeholder="Email"');
    expect(html).toContain('aria-invalid="true"');
  });

  it("renders EmptyState with icon, text and action", () => {
    const html = renderToStaticMarkup(
      <EmptyState icon={<i>*</i>} title="No chats" text="Nothing yet" action={<Button>Add</Button>} />,
    );
    expect(html).toContain("No chats");
    expect(html).toContain("Nothing yet");
    expect(html).toContain("Add");
  });

  it("renders Spinner with an accessible label", () => {
    expect(renderToStaticMarkup(<Spinner />)).toContain("Loading");
  });

  it("renders ErrorState as an alert", () => {
    const html = renderToStaticMarkup(<ErrorState message="Failed to load" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Failed to load");
  });
});
