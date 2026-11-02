import { APP_NAME } from "@askwell/shared";
import { CtaLink } from "./CtaLink";
import { Reveal } from "./Reveal";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="px-4 pb-20 pt-16 sm:pt-24">
      <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <p className="rounded-full border border-glass-border bg-glass px-3 py-1 text-xs text-fg-muted backdrop-blur-(--blur-glass)">
          AI support chat for any website
        </p>
        <h1 id="hero-title" className="text-4xl font-semibold tracking-tight sm:text-6xl">
          Answer every visitor question, automatically.
        </h1>
        <p className="max-w-xl text-base text-fg-muted sm:text-lg">
          Add your product info, paste one script tag, and {APP_NAME} answers your visitors from
          what you know.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <CtaLink href="/sign-up">Start free</CtaLink>
          <CtaLink href="#how-it-works" variant="secondary">
            See how it works
          </CtaLink>
        </div>
      </Reveal>
    </section>
  );
}
