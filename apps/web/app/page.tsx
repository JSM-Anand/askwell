import { DemoPanel } from "../components/landing/DemoPanel";
import { Footer } from "../components/landing/Footer";
import { Hero } from "../components/landing/Hero";
import { HowItWorks } from "../components/landing/HowItWorks";
import { InstallSnippet } from "../components/landing/InstallSnippet";
import { Pricing } from "../components/landing/Pricing";

export default function Home() {
  return (
    <div data-surface="dark" className="min-h-screen overflow-x-clip bg-surface text-fg">
      <main>
        <Hero />
        <HowItWorks />
        <DemoPanel />
        <Pricing />
        <InstallSnippet />
      </main>
      <Footer />
    </div>
  );
}
