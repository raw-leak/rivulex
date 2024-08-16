
export const RETRY = 3
export const RETRY_BACKOFF_TIME = 50
export const DEAD_LETTER = 'dead_letter';

// HOOKS
export const PUBLISHED_HOOK = "published" as const;
export const FAILED_HOOK = "failed" as const;
export const CONFIRMED_HOOK = "confirmed" as const;
export const REJECTED_HOOK = "rejected" as const;
export const TIMEOUT_HOOK = "timeout" as const;

// STATUS
export const TIMEOUT_STATUS = "TIMEOUT"
export const CONFIRMED_STATUS = "CONFIRMED"
export const FAILED_STATUS = "FAILED"
export const REJECTED_STATUS = "REJECTED"

