export class Backoff {
    max: number;
    count: number;

    minInterval: number;
    maxInterval: number;


    constructor({ max }: { max: number }) {
        this.max = max;
        this.count = 0;
    }

    reset() {
        this.count = 0;
    }

    increase() {
        if (this.count < this.max) {
            this.count += 1;
        }
    }

    async wait() {
        if (this.count > 0) {
            const timeout = this.count * 1000;
            await new Promise((resolve) => setTimeout(resolve, timeout));
        }
    }
}
