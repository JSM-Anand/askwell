import { cleanSecret } from "../../lib/env/clean-secret";

/** What a public key looks like (project.md §6.3: `pk_` + random). Anything else is not put in a script tag. */
const PUBLIC_KEY = /^pk_[A-Za-z0-9_-]{1,100}$/;

/**
 * `LANDING_WIDGET_KEY` from the environment, cleaned, or null if it is unset or not a public key.
 * The page then keeps the static demo and still renders.
 */
export function landingWidgetKey(raw: string | undefined): string | null {
  const key = cleanSecret(raw);
  return PUBLIC_KEY.test(key) ? key : null;
}
