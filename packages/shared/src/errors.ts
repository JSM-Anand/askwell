export const ERROR_CODES = [
  "invalid_input",
  "unauthorized",
  "forbidden",
  "not_found",
  "plan_required",
  "limit_reached",
  "quota_exceeded",
  "rate_limited",
  "unsupported_file_type",
  "file_too_large",
  "prompt_injection",
  "internal_error",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** The HTTP status each error code is returned with. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  plan_required: 402,
  limit_reached: 402,
  quota_exceeded: 429,
  rate_limited: 429,
  unsupported_file_type: 400,
  file_too_large: 400,
  prompt_injection: 400,
  internal_error: 500,
};

export type ApiError = { error: { code: ErrorCode; message: string } };
