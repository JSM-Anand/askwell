"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { initAnalytics } from "../../lib/analytics/client";

export function PostHogProvider() {
  const pathname = usePathname();
  const { isLoaded, userId } = useAuth();
  const identified = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    void initAnalytics(pathname).then((posthog) => {
      if (cancelled || !posthog) return;
      if (userId && identified.current !== userId) {
        posthog.identify(userId); // Clerk user ID only, no properties
        identified.current = userId;
      } else if (!userId && identified.current) {
        posthog.reset();
        identified.current = null;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, isLoaded, userId]);

  return null;
}
