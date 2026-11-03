export type PostHogConfig = { key: string; host: string };

const VARS = ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"] as const;
const warned = new Set<string>();

// Dynamic env[name] access on purpose: Next inlines NEXT_PUBLIC_* at build time
// for dot access, and this must be read at request time.
export function readPostHogConfig(
  env: Record<string, string | undefined> = process.env,
): PostHogConfig | null {
  const [key, host] = VARS.map((name) => {
    const value = env[name]?.trim();
    if (!value && env.NODE_ENV === "development" && !warned.has(name)) {
      warned.add(name);
      console.error(
        `${name} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${name} is configured`,
      );
    }
    return value;
  });
  return key && host ? { key, host } : null;
}
