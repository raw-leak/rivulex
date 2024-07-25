import { Backoff } from '../../lib/utils/backoff';

describe('Backoff', () => {
    let backoff: Backoff;
    let mockDelayFunction: jest.Mock;

    beforeEach(() => {
        mockDelayFunction = jest.fn().mockImplementation(() => Promise.resolve());
        backoff = new Backoff({ minInterval: 1000, maxInterval: 16000 }, mockDelayFunction);
    });

    describe('constructor', () => {
        it('should initialize with the correct min and max intervals', () => {
            expect(backoff.getMinInterval()).toBe(1000);
            expect(backoff.getMaxInterval()).toBe(16000);
            expect(backoff.getCurrentInterval()).toBe(1000);
        });
    });

    describe('reset method', () => {
        it('should reset the current interval to the minimum interval', () => {
            backoff['currentInterval'] = 8000;  // Simulate a changed interval
            backoff.reset();
            expect(backoff.getCurrentInterval()).toBe(1000);
        });
    });

    describe('increase method', () => {
        it('should double the current interval if it is less than the max interval', () => {
            backoff['currentInterval'] = 2000;
            backoff.increase();
            expect(backoff.getCurrentInterval()).toBe(4000);
        });

        it('should not exceed the maximum interval', () => {
            backoff['currentInterval'] = 16000;
            backoff.increase();
            expect(backoff.getCurrentInterval()).toBe(16000);
        });

        it('should cap the interval to maxInterval even if doubling exceeds maxInterval', () => {
            backoff['currentInterval'] = 9000;
            backoff.increase();
            expect(backoff.getCurrentInterval()).toBe(16000);
        });
    });

    describe('wait method', () => {
        it('should call the delay function with the correct interval', async () => {
            await backoff.wait();
            expect(mockDelayFunction).toHaveBeenCalledWith(1000);
        });

        it('should call the delay function with the correct interval after several increases', async () => {
            backoff.increase();
            backoff.increase();
            await backoff.wait();
            expect(mockDelayFunction).toHaveBeenCalledWith(4000);
        });

        it('should call the delay function with the max interval if increased beyond min interval', async () => {
            backoff['currentInterval'] = 16000;
            await backoff.wait();
            expect(mockDelayFunction).toHaveBeenCalledWith(16000);
        });
    });

    describe('Edge Cases', () => {
        it('should handle reset correctly after multiple increases', () => {
            backoff.increase();
            backoff.increase();
            backoff.reset();
            expect(backoff.getCurrentInterval()).toBe(1000);
        });

        it('should call the delay function with the correct interval after reset', async () => {
            backoff.increase();
            backoff.reset();
            await backoff.wait();
            expect(mockDelayFunction).toHaveBeenCalledWith(1000);
        });
    });
});
