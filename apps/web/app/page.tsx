import { headers } from "next/headers";
import { connection } from "next/server";
import { DemoPanel } from "../components/landing/DemoPanel";
import { Footer } from "../components/landing/Footer";
import { Hero } from "../components/landing/Hero";
import { HowItWorks } from "../components/landing/HowItWorks";
import { InstallSnippet } from "../components/landing/InstallSnippet";
import { LandingWidget } from "../components/landing/LandingWidget";
import { Pricing } from "../components/landing/Pricing";
import { resolveAppOrigin } from "../components/install/app-origin";
import { landingWidgetKey } from "../components/landing/landing-widget";

export default async function Home() {
  // LANDING_WIDGET_KEY is per-environment config: read it when the request comes in, not at build time.
  await connection();
  const widgetKey = landingWidgetKey(process.env.LANDING_WIDGET_KEY);

  let origin: string | null = null;
  if (widgetKey) {
    const requestHeaders = await headers();
    origin = resolveAppOrigin({
      envUrl: process.env.NEXT_PUBLIC_APP_URL,
      host: requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
      proto: requestHeaders.get("x-forwarded-proto"),
    });
  }

  return (
    <div data-surface="dark" className="min-h-screen overflow-x-clip bg-surface text-fg">
      <main>
        <Hero />
        <HowItWorks />
        <DemoPanel live={widgetKey !== null} />
        <Pricing />
        <InstallSnippet />
      </main>
      <Footer />
      {widgetKey && origin ? <LandingWidget widgetKey={widgetKey} origin={origin} /> : null}
    </div>
  );
}
