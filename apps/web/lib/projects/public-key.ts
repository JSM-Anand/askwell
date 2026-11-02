import { randomBytes } from "node:crypto";

/** A new public project key: `pk_` + 24 random bytes as hex. It only identifies a project; it grants no owner rights. */
export function generatePublicKey(): string {
  return `pk_${randomBytes(24).toString("hex")}`;
}
