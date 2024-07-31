/**
 * Class representing a retrier for executing asynchronous functions with retries.
 */
export class Retrier {
    private retries: number;
    private delay: number;

    /**
     * Creates an instance of Retrier.
     * @param {number} retries - The number of retry attempts.
     * @param {number} delay - The delay in milliseconds between retry attempts.
     */
    constructor(retries: number, delay: number) {
        this.retries = retries;
        this.delay = delay;
    }

    /**
     * Executes an asynchronous function with retry logic.
     * @param {() => Promise<any>} asyncFunc - The asynchronous function to execute.
     * @returns {Promise<any>} - The result of the asynchronous function if it succeeds within the retry limit.
     * @throws {Error} - The error thrown by the asynchronous function if all retry attempts fail.
     */
    public async retry(asyncFunc: () => Promise<any>): Promise<any> {
        for (let attempt = 0; attempt <= this.retries; attempt++) {
            try {
                return await asyncFunc();
            } catch (error) {
                if (attempt === this.retries) {
                    throw error;
                }
                await this.sleep(this.delay);
            }
        }
    }

    /**
     * Sleeps for the specified duration.
     * @param {number} ms - The duration in milliseconds to sleep.
     * @returns {Promise<void>} - A promise that resolves after the specified duration.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
