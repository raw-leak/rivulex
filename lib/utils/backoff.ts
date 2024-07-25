/**
 * Class representing a backoff mechanism with dynamic interval adjustment.
 */
export class Backoff {
    private minInterval: number;
    private maxInterval: number;
    private currentInterval: number;
    private delayFunction: (ms: number) => Promise<void>;

    /**
     * Creates an instance of Backoff.
     * @param {Object} params - The parameters for the backoff mechanism.
     * @param {number} params.minInterval - The minimum interval in milliseconds.
     * @param {number} params.maxInterval - The maximum interval in milliseconds.
     * @param {Function} [delayFunction=Backoff.defaultDelayFunction] - Optional delay function for waiting, defaulting to using setTimeout.
     */
    constructor(
        { minInterval, maxInterval }: { minInterval: number, maxInterval: number },
        delayFunction: (ms: number) => Promise<void> = Backoff.defaultDelayFunction
    ) {
        this.minInterval = minInterval;
        this.maxInterval = maxInterval;
        this.currentInterval = minInterval;
        this.delayFunction = delayFunction;
    }

    /**
     * Default delay function using setTimeout.
     * @param {number} ms - The duration in milliseconds to wait.
     * @returns {Promise<void>} A promise that resolves after the specified duration.
     */
    static defaultDelayFunction(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Resets the current interval to the minimum interval.
     */
    reset() {
        this.currentInterval = this.minInterval;
    }

    /**
     * Increases the current interval by doubling it, but not exceeding the maximum interval.
     */
    increase() {
        if (this.currentInterval < this.maxInterval) {
            this.currentInterval = Math.min(this.currentInterval * 2, this.maxInterval);
        }
    }

    /**
     * Waits for the duration of the current interval before resolving.
     * @returns {Promise<void>} A promise that resolves after the current interval.
     */
    async wait() {
        if (this.currentInterval > 0) {
            await this.delayFunction(this.currentInterval);
        }
    }

    /**
     * Gets the minimum interval.
     * @returns {number} The minimum interval in milliseconds.
     */
    getMinInterval() {
        return this.minInterval;
    }

    /**
     * Gets the maximum interval.
     * @returns {number} The maximum interval in milliseconds.
     */
    getMaxInterval() {
        return this.maxInterval;
    }

    /**
     * Gets the current interval.
     * @returns {number} The current interval in milliseconds.
     */
    getCurrentInterval() {
        return this.currentInterval;
    }
}
