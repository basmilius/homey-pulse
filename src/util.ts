/**
 * Returns a YYYY-MM-DD date string in the given IANA timezone.
 *
 * @param timeZone - IANA timezone identifier (e.g. `Europe/Amsterdam`).
 * @param date - The date to format. Defaults to now.
 */
export function getLocalDateString(timeZone: string, date: Date = new Date()): string {
    // `en-CA` produces the ISO-like `YYYY-MM-DD` format with 2-digit month/day.
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

/**
 * Returns the start-of-day and end-of-day timestamps for a YYYY-MM-DD string,
 * interpreted in the given IANA timezone. DST-safe.
 *
 * @param dateStr - A YYYY-MM-DD formatted date string.
 * @param timeZone - IANA timezone identifier (e.g. `Europe/Amsterdam`).
 */
export function getLocalDayRange(dateStr: string, timeZone: string): { readonly start: number; readonly end: number } {
    const [year, month, day] = dateStr.split('-').map(Number);
    const start = zonedTimeToUtcMs(year, month, day, 0, 0, 0, timeZone);
    const end = zonedTimeToUtcMs(year, month, day + 1, 0, 0, 0, timeZone);
    return {start, end};
}

/**
 * Formats a timestamp as `HH:mm` in the given IANA timezone.
 *
 * @param timeZone - IANA timezone identifier (e.g. `Europe/Amsterdam`).
 * @param timestamp - A millisecond Unix timestamp.
 */
export function formatLocalTime(timeZone: string, timestamp: number): string {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date(timestamp));
}

/**
 * Converts a wall-clock time in a given IANA timezone to a UTC millisecond timestamp.
 * Used to build day-range boundaries without relying on the system timezone.
 *
 * @param year - Full year (e.g. 2026).
 * @param month - 1-based month (1 = January).
 * @param day - Day of month; values outside 1..31 are normalised (e.g. day = 32 rolls over).
 * @param hour - Hour of day (0..23).
 * @param minute - Minute (0..59).
 * @param second - Second (0..59).
 * @param timeZone - IANA timezone identifier.
 */
function zonedTimeToUtcMs(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string): number {
    // Normalise overflow (e.g. day = 32 → next month) by round-tripping through a UTC Date.
    const normalised = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const pivotMs = normalised.getTime();

    // Format that UTC instant as wall-clock time in the target timezone.
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(normalised);

    const tzParts: Record<string, number> = {};

    for (const part of parts) {
        if (part.type !== 'literal') {
            tzParts[part.type] = Number(part.value);
        }
    }

    // `en-US` emits hour = 24 at midnight; normalise to 0.
    const tzHour = tzParts.hour === 24 ? 0 : tzParts.hour;
    const asTzUtc = Date.UTC(tzParts.year, tzParts.month - 1, tzParts.day, tzHour, tzParts.minute, tzParts.second);

    // The offset between what the pivot UTC instant "looks like" in the target timezone
    // and what it "really is" in UTC. That offset is also the offset we need to subtract
    // from our desired wall-clock UTC instant to get the actual UTC instant.
    const offset = asTzUtc - pivotMs;
    return pivotMs - offset;
}

/**
 * Retries an async function with exponential backoff.
 *
 * @param fn - The async function to retry.
 * @param maxAttempts - Maximum number of attempts (default: 3).
 * @param baseDelayMs - Base delay in milliseconds before exponential increase (default: 1000).
 */
/**
 * Checks whether an error is likely transient and worth retrying.
 * Auth errors and configuration problems should fail immediately.
 *
 * @param err - The caught error.
 */
function isRetryable(err: unknown): boolean {
    if (err instanceof Error) {
        const message = err.message.toLowerCase();

        if (message.includes('api key') || message.includes('authentication') || message.includes('unauthorized')) {
            return false;
        }
    }

    return true;
}

/**
 * Retries an async function with exponential backoff.
 * Non-retryable errors (auth, config) are thrown immediately without retry.
 *
 * @param fn - The async function to retry.
 * @param maxAttempts - Maximum number of attempts (default: 3).
 * @param baseDelayMs - Base delay in milliseconds before exponential increase (default: 1000).
 */
export async function withRetry<T>(fn: () => Promise<T>, maxAttempts: number = 3, baseDelayMs: number = 1000): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;

            if (!isRetryable(err)) {
                throw err;
            }

            if (attempt < maxAttempts - 1) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}
