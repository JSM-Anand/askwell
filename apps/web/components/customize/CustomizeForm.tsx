"use client";

import { useId } from "react";
import { APP_NAME, MAX_WIDGET_HEADER_LENGTH, MAX_WIDGET_LABEL_LENGTH } from "@askwell/shared";
import type { WidgetAnimation, WidgetConfig, WidgetPosition } from "@askwell/shared";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { FieldErrors, FieldName } from "./customize-state";

export type CustomizeFormProps = {
  draft: WidgetConfig;
  /** The color the picker shows: the draft's, or the last valid one while the hex text is half-typed. */
  pickerColor: string;
  errors: FieldErrors;
  /** Locked: the form is visible but nothing can be changed (Free, or the server answered 402). */
  disabled: boolean;
  saving: boolean;
  canSave: boolean;
  onChange: (patch: Partial<WidgetConfig>) => void;
  onSubmit: () => void;
};

const POSITIONS: { value: WidgetPosition; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
];

const ANIMATIONS: { value: WidgetAnimation; label: string }[] = [
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "scale", label: "Scale" },
];

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="text-sm text-danger">
      {message}
    </p>
  ) : null;
}

function Choice({
  name,
  value,
  label,
  checked,
  onSelect,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-raised px-3 text-sm has-[:checked]:border-fg has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} className="size-4 accent-current" />
      {label}
    </label>
  );
}

export function CustomizeForm({ draft, pickerColor, errors, disabled, saving, canSave, onChange, onSubmit }: CustomizeFormProps) {
  const id = useId();
  const field = (name: FieldName) => `${id}-${name}`;
  const describedBy = (name: FieldName) => (errors[name] ? `${field(name)}-error` : undefined);

  return (
    <form
      aria-label="Widget settings"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-5 border-0 p-0">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={field("buttonColor")} className="text-sm font-medium">
            Button color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick a button color"
              value={pickerColor}
              onChange={(event) => onChange({ buttonColor: event.target.value })}
              className="size-10 shrink-0 cursor-pointer rounded-md border border-border bg-surface-raised p-1 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <Input
              id={field("buttonColor")}
              value={draft.buttonColor}
              onChange={(event) => onChange({ buttonColor: event.target.value.trim() })}
              invalid={Boolean(errors.buttonColor)}
              aria-describedby={describedBy("buttonColor")}
              placeholder="#000000"
              spellCheck={false}
              autoComplete="off"
              className="font-mono"
            />
          </div>
          <FieldError id={`${field("buttonColor")}-error`} message={errors.buttonColor} />
        </div>

        <fieldset className="flex min-w-0 flex-col gap-1.5 border-0 p-0" aria-describedby={describedBy("position")}>
          <legend className="mb-1.5 text-sm font-medium">Button position</legend>
          <div className="grid grid-cols-2 gap-2">
            {POSITIONS.map((option) => (
              <Choice key={option.value} name={field("position")} value={option.value} label={option.label} checked={draft.position === option.value} onSelect={() => onChange({ position: option.value })} />
            ))}
          </div>
          <FieldError id={`${field("position")}-error`} message={errors.position} />
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={field("label")} className="text-sm font-medium">
            Button label
          </label>
          <Input
            id={field("label")}
            value={draft.label}
            onChange={(event) => onChange({ label: event.target.value })}
            maxLength={MAX_WIDGET_LABEL_LENGTH}
            invalid={Boolean(errors.label)}
            aria-describedby={describedBy("label")}
            autoComplete="off"
          />
          <FieldError id={`${field("label")}-error`} message={errors.label} />
        </div>

        <fieldset className="flex min-w-0 flex-col gap-1.5 border-0 p-0" aria-describedby={describedBy("animation")}>
          <legend className="mb-1.5 text-sm font-medium">Open animation</legend>
          <div className="grid grid-cols-3 gap-2">
            {ANIMATIONS.map((option) => (
              <Choice key={option.value} name={field("animation")} value={option.value} label={option.label} checked={draft.animation === option.value} onSelect={() => onChange({ animation: option.value })} />
            ))}
          </div>
          <FieldError id={`${field("animation")}-error`} message={errors.animation} />
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={field("headerText")} className="text-sm font-medium">
            Header text
          </label>
          <Input
            id={field("headerText")}
            value={draft.headerText}
            onChange={(event) => onChange({ headerText: event.target.value })}
            maxLength={MAX_WIDGET_HEADER_LENGTH}
            invalid={Boolean(errors.headerText)}
            aria-describedby={describedBy("headerText")}
            autoComplete="off"
          />
          <FieldError id={`${field("headerText")}-error`} message={errors.headerText} />
        </div>

        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
          <input type="checkbox" checked={draft.showBadge} onChange={(event) => onChange({ showBadge: event.target.checked })} className="size-4 accent-current" />
          Show the “Powered by {APP_NAME}” badge
        </label>
      </fieldset>

      <div className="mt-5">
        <Button type="submit" disabled={disabled || saving || !canSave}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
