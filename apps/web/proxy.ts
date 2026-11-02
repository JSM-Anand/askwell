import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Matchers mirror project.md §8. Prefix patterns end in `.*` so they fail closed.
// Clerk keys come from the environment (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY).
const PROTECTED_PATHS: RegExp[] = [
  /^\/dashboard.*$/,
  /^\/api\/projects.*$/,
  /^\/api\/knowledge.*$/,
  /^\/api\/conversations.*$/,
];

const PUBLIC_PATHS: RegExp[] = [
  /^\/$/,
  /^\/sign-in(\/.*)?$/,
  /^\/sign-up(\/.*)?$/,
  /^\/embed(\/.*)?$/,
  /^\/api\/widget\/.*$/,
  /^\/api\/clerk\/webhook$/,
  /^\/api\/posthog-config$/,
];

const OWNER_API_PATHS: RegExp[] = PROTECTED_PATHS.filter((re) => re.source.startsWith("^\\/api"));

export const isProtectedPath = (pathname: string): boolean =>
  PROTECTED_PATHS.some((re) => re.test(pathname));

export const isPublicPath = (pathname: string): boolean =>
  !isProtectedPath(pathname) && PUBLIC_PATHS.some((re) => re.test(pathname));

export const isOwnerApiPath = (pathname: string): boolean =>
  OWNER_API_PATHS.some((re) => re.test(pathname));

export default clerkMiddleware(
  async (auth, req) => {
    const { pathname } = req.nextUrl;
    if (!isProtectedPath(pathname)) return;

    if (isOwnerApiPath(pathname)) {
      const { isAuthenticated } = await auth();
      if (!isAuthenticated) {
        return NextResponse.json(
          { error: { code: "unauthorized", message: "Sign in to use this endpoint." } },
          { status: 401 },
        );
      }
      return;
    }

    await auth.protect();
  },
  { signInUrl: "/sign-in", signUpUrl: "/sign-up" },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
