import { Retrier } from '../../lib/utils/retrier';

describe('Retrier', () => {
    let retrier: Retrier;

    beforeEach(() => {
        retrier = new Retrier(3, 10);
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    test('should resolve if async function succeeds on first attempt', async () => {
        const asyncFunc = jest.fn().mockResolvedValue('success');

        const result = await retrier.retry(asyncFunc);

        expect(result).toBe('success');
        expect(asyncFunc).toHaveBeenCalledTimes(1);
    });

    test('should retry and resolve if async function succeeds within retry limit', async () => {
        const asyncFunc = jest.fn()
            .mockRejectedValueOnce(new Error('failure'))
            .mockRejectedValueOnce(new Error('failure'))
            .mockResolvedValue('success');

        const result = await retrier.retry(asyncFunc);

        expect(result).toBe('success');
        expect(asyncFunc).toHaveBeenCalledTimes(3);
    });

    test('should reject if async function fails after all retries', async () => {
        const asyncFunc = jest.fn().mockRejectedValue(new Error('failure'));

        await expect(retrier.retry(asyncFunc)).rejects.toThrow('failure');
        expect(asyncFunc).toHaveBeenCalledTimes(4);
    });
});
