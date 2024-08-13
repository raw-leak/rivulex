import { Trimmer } from '../../lib/core/trimmer';
import { RedisClient, Logger } from '../../lib/types';
import { TrimmerConfig } from '../../lib/config/trimmer.config';

describe('Trimmer Unit Tests', () => {
    let mockRedisClient: jest.Mocked<RedisClient>;
    let mockLogger: jest.Mocked<Logger>;
    let trimmer: Trimmer;
    let config: TrimmerConfig;

    beforeEach(() => {
        mockRedisClient = {
            xtrim: jest.fn(),
            get: jest.fn(),
            set: jest.fn(),
        } as unknown as jest.Mocked<RedisClient>;

        mockLogger = {
            log: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as unknown as jest.Mocked<Logger>;

        config = {
            streams: ['stream1', 'stream2'],
            clientId: 'test-client-id',
            group: 'test-group',
            intervalTime: 60_000,
            retentionPeriod: 30_000,
        };

        trimmer = new Trimmer(config, mockRedisClient, mockLogger);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('start method', () => {
        let scheduleInitialTrim, schedulePeriodicTrim;

        beforeEach(() => {
            scheduleInitialTrim = jest.spyOn(trimmer as any, 'scheduleInitialTrim').mockImplementation(jest.fn());
            schedulePeriodicTrim = jest.spyOn(trimmer as any, 'schedulePeriodicTrim').mockImplementation(jest.fn());

            trimmer.start();
        });

        it('should schedule initial trim with aprox interval between 0 and 10 seconds', () => {
            const lowerBound = 0;
            const upperBound = 10_000;

            expect(scheduleInitialTrim).toHaveBeenCalledTimes(1);
            expect(scheduleInitialTrim).toHaveBeenCalledWith(expect.any(Number));

            const scheduledInterval = (scheduleInitialTrim as jest.Mock).mock.calls[0][0];

            expect(scheduledInterval).toBeGreaterThanOrEqual(lowerBound);
            expect(scheduledInterval).toBeLessThanOrEqual(upperBound);
        });

        it('should schedule periodic trim with an approximate interval between -10 and +10 seconds of the interval period', () => {
            const lowerBound = 30_000;
            const upperBound = 90_000;

            expect(schedulePeriodicTrim).toHaveBeenCalledTimes(1);
            expect(schedulePeriodicTrim).toHaveBeenCalledWith(expect.any(Number));

            const scheduledInterval = (schedulePeriodicTrim as jest.Mock).mock.calls[0][0];

            expect(scheduledInterval).toBeGreaterThanOrEqual(lowerBound);
            expect(scheduledInterval).toBeLessThanOrEqual(upperBound);
        });
    });

    describe('stop method', () => {
        let stopInitialTrim: jest.SpyInstance, stopPeriodicTrim: jest.SpyInstance;

        beforeEach(() => {
            stopInitialTrim = jest.spyOn(trimmer as any, 'stopInitialTrim').mockImplementation(jest.fn());
            stopPeriodicTrim = jest.spyOn(trimmer as any, 'stopPeriodicTrim').mockImplementation(jest.fn());
            trimmer.stop();
        });

        it('should call clearTimeout, stopPeriodicTrim, and logStop methods', () => {
            expect(stopInitialTrim).toHaveBeenCalledTimes(1);
            expect(stopPeriodicTrim).toHaveBeenCalledTimes(1);
        });
    });

    describe('stopInitialTrim method', () => {
        it('should clear the initial trimming if it is set', () => {
            const timeoutId = setInterval(jest.fn(), 10_000);
            trimmer['timeoutId'] = timeoutId as any;

            (trimmer as any).stopInitialTrim();

            expect(trimmer['timeoutId']).toBeNull();
        });

        it('should do nothing if initial trimming is not set', () => {
            trimmer['timeoutId'] = null;

            (trimmer as any).stopInitialTrim();

            expect(trimmer['timeoutId']).toBeNull();
        });
    });

    describe('stopPeriodicTrim method', () => {
        it('should clear the interval if it is set', () => {
            const intervalId = setInterval(jest.fn(), 10_000);
            trimmer['intervalId'] = intervalId as any;

            (trimmer as any).stopPeriodicTrim();

            expect(trimmer['intervalId']).toBeNull();
        });

        it('should do nothing if interval is not set', () => {
            trimmer['intervalId'] = null;

            (trimmer as any).stopPeriodicTrim();

            expect(trimmer['intervalId']).toBeNull();
        });
    });

    describe('trimStream method', () => {
        let streamName: string;

        beforeEach(async () => {
            streamName = 'stream1';
            await (trimmer as any).trimStream(streamName);
        });

        it('should trim the stream using xtrim with the correct parameters', () => {
            expect(mockRedisClient.xtrim).toHaveBeenCalledTimes(1);
            expect(mockRedisClient.xtrim).toHaveBeenCalledWith(streamName, 'MINID', expect.any(String));
        });

        it('should store trimming information in Redis with the correct parameters', () => {
            expect(mockRedisClient.set).toHaveBeenCalledTimes(1);
            const expectedTrimmingInfo = {
                clientId: config.clientId,
                trimmedAt: expect.any(Number),
                intervalTime: config.intervalTime,
                retentionPeriod: config.retentionPeriod,
                minId: expect.any(String),
                group: config.group,
            };

            const [arg1, arg2, arg3, arg4] = mockRedisClient.set.mock.calls[0]

            expect(arg1).toBe(`${trimmer['trimmingBaseKey']}${streamName}`)
            expect(JSON.parse(arg2 as string)).toEqual(expectedTrimmingInfo)
            expect(arg3).toBe('EX')
            expect(arg4).toBe(60_000 / 1000)


        });
    });

    describe('shouldTrim method', () => {
        let streamName: string;

        beforeEach(() => {
            streamName = 'stream1';
        });

        it('should return true if there is no previous trimming information', async () => {
            mockRedisClient.get.mockResolvedValueOnce(null);
            const result = await (trimmer as any).shouldTrim(streamName);
            expect(result).toBe(true);
        });

        it('should return false and log the skipping message if trimming has been recently done', async () => {
            const trimmingInfo = {
                clientId: 'another-client',
                trimmedAt: Date.now(),
                intervalTime: config.intervalTime,
                retentionPeriod: config.retentionPeriod,
                minId: 'some-min-id',
                group: config.group,
            };

            mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(trimmingInfo));
            const result = await (trimmer as any).shouldTrim(streamName);
            expect(result).toBe(false);
        });
    });

    describe('trim method', () => {
        let shouldTrimSpy: jest.SpyInstance;
        let trimStreamSpy: jest.SpyInstance;

        beforeEach(() => {
            shouldTrimSpy = jest.spyOn(trimmer as any, 'shouldTrim').mockResolvedValue(true);
            trimStreamSpy = jest.spyOn(trimmer as any, 'trimStream').mockResolvedValue(undefined);
        });

        describe('when trim is executed with all streams need to be trimmed', () => {
            it('should trim all streams that need to be trimmed', async () => {
                await (trimmer as any).trim();

                expect(shouldTrimSpy).toHaveBeenCalledTimes(config.streams.length);
                config.streams.forEach(stream => {
                    expect(shouldTrimSpy).toHaveBeenCalledWith(stream);
                    expect(trimStreamSpy).toHaveBeenCalledWith(stream);
                });
            });
        });

        describe('when skipping trimming because no streams need to be trimmed', () => {
            it('should skip trimming for all streams when none need trimming', async () => {
                shouldTrimSpy.mockResolvedValue(false); // All streams should not be trimmed

                await (trimmer as any).trim();

                expect(shouldTrimSpy).toHaveBeenCalledTimes(config.streams.length);
                expect(trimStreamSpy).not.toHaveBeenCalled();
            });
        });

        describe('when trimming some streams and skipping some others', () => {
            it('should trim only the streams that need to be trimmed', async () => {
                shouldTrimSpy
                    .mockResolvedValueOnce(true)  // First stream needs trimming
                    .mockResolvedValueOnce(false); // Second stream does not need trimming

                await (trimmer as any).trim();

                expect(shouldTrimSpy).toHaveBeenCalledTimes(config.streams.length);

                expect(trimStreamSpy).toHaveBeenCalledTimes(1);
                expect(trimStreamSpy).toHaveBeenCalledWith(config.streams[0]);
                expect(trimStreamSpy).not.toHaveBeenCalledWith(config.streams[1]);
            });
        });

        describe('when error happens during trimming', () => {
            it('should log an error if trimming a stream fails', async () => {
                const error = new Error('Test Error');
                trimStreamSpy.mockRejectedValueOnce(error);

                await (trimmer as any).trim();

                expect(mockLogger.error).toHaveBeenCalledWith(
                    `trimming of ${config.streams[0]} stream has failed with error:`,
                    error
                );

                // Ensure the process continues for the next stream
                expect(trimStreamSpy).toHaveBeenCalledTimes(2);
            });
        });

        describe('when multiple streams with mixed outcomes occurs', () => {
            it('should handle multiple streams with mixed outcomes (success and failure)', async () => {
                const error = new Error('Test Error');
                shouldTrimSpy
                    .mockResolvedValueOnce(true)  // First stream needs trimming
                    .mockResolvedValueOnce(true); // Second stream needs trimming
                trimStreamSpy
                    .mockResolvedValueOnce(undefined) // First stream trims successfully
                    .mockRejectedValueOnce(error);    // Second stream fails to trim

                await (trimmer as any).trim();

                expect(trimStreamSpy).toHaveBeenCalledTimes(2);
                expect(mockLogger.error).toHaveBeenCalledWith(
                    `trimming of ${config.streams[1]} stream has failed with error:`,
                    error
                );
            });
        });

        describe('when there are no streams', () => {
            it('should handle case when no streams are configured', async () => {
                trimmer['streams'] = []; // Set streams to an empty array

                await (trimmer as any).trim();

                expect(shouldTrimSpy).not.toHaveBeenCalled();
                expect(trimStreamSpy).not.toHaveBeenCalled();
            });
        });

        describe('when trimming a stream that just has been trimmed', () => {
            it('should skip trimming a stream that was recently trimmed by another instance', async () => {
                shouldTrimSpy.mockResolvedValue(false); // Simulate recent trimming by another instance

                await (trimmer as any).trim();

                expect(trimStreamSpy).not.toHaveBeenCalled();
            });
        });
    });
});
