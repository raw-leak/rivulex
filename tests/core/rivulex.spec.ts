import { Rivulex } from '../../lib/core/rivulex';
import { Publisher } from '../../lib/core/publisher';
import { Subscriber } from '../../lib/core/subscriber';
import { Trimmer } from '../../lib/core/trimmer';
import { Redis } from '../../lib/redis/redis';
import { Logger } from '../../lib/types';
import { RivulexPublisherConfig, RivulexSubscriberConfig, RivulexTrimmerConfig } from '../../lib/config/rivulex.config';

jest.mock('../../lib/core/publisher');
jest.mock('../../lib/core/subscriber');
jest.mock('../../lib/core/trimmer');
jest.mock('../../lib/redis/redis');

describe('Rivulex Class', () => {
    let mockLogger: Logger;
    let mockRedisClient: jest.Mocked<ReturnType<typeof Redis.connect>>;

    beforeEach(() => {
        mockLogger = {
            log: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as unknown as Logger;

        mockRedisClient = {} as jest.Mocked<ReturnType<typeof Redis.connect>>;
        (Redis.connect as jest.Mock).mockReturnValue(mockRedisClient);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('publisher method', () => {
        let config: RivulexPublisherConfig;

        beforeEach(() => {
            config = {
                redis: { host: 'localhost', port: 6379 },
                defaultStream: 'test-stream',
                group: 'test-group',
            };
        });

        describe('when creating publisher provided config and custom logger', () => {
            it('should create a new Publisher instance with the provided config and logger', () => {
                const publisher = Rivulex.publisher(config, mockLogger);

                expect(publisher).toBeInstanceOf(Publisher);

                expect(Redis.connect).toHaveBeenCalledWith(config.redis);
                expect(Publisher).toHaveBeenCalledWith(config, mockRedisClient, mockLogger);
            });
        });

        describe('when creating publisher provided config and and not providing custom logger', () => {
            it('should use console as default logger if none is provided', () => {
                const publisher = Rivulex.publisher(config);

                expect(publisher).toBeInstanceOf(Publisher);

                expect(Redis.connect).toHaveBeenCalledWith(config.redis);
                expect(Publisher).toHaveBeenCalledWith(config, mockRedisClient, console);
            });
        });
    });

    describe('subscriber method', () => {
        let config: RivulexSubscriberConfig;

        beforeEach(() => {
            config = {
                redis: { host: 'localhost', port: 6379 },
                group: 'test-group',
            };
        });

        describe('when creating a new Subscriber instance provided config and custom logger', () => {
            it('should create a new Subscriber instance with the provided config and logger', () => {
                const subscriber = Rivulex.subscriber(config, mockLogger);

                expect(subscriber).toBeInstanceOf(Subscriber)

                expect(Redis.connect).toHaveBeenCalledWith(config.redis);
                expect(Subscriber).toHaveBeenCalledWith(config, mockRedisClient, mockLogger);
            });
        });

        describe('when creating a new Subscriber instance provided config and not providing custom logger', () => {
            it('should use console as default logger if none is provided', () => {
                const subscriber = Rivulex.subscriber(config);

                expect(subscriber).toBeInstanceOf(Subscriber)

                expect(Redis.connect).toHaveBeenCalledWith(config.redis);
                expect(Subscriber).toHaveBeenCalledWith(config, mockRedisClient, console);
            });
        });
    });

    describe('trimmer method', () => {
        let config: RivulexTrimmerConfig;

        beforeEach(() => {
            config = {
                redis: { host: 'localhost', port: 6379 },
                streams: ['stream1', 'stream2'],
                group: 'test-group',
                retentionPeriod: 60000,
                intervalTime: 30000,
            };
        });

        describe('when creating a new Trimmer instance with the provided config and custom logger', () => {
            it('should create a new Trimmer instance with the provided config and logger', () => {
                const trimmer = Rivulex.trimmer(config, mockLogger);

                expect(trimmer).toBeInstanceOf(Trimmer)

                expect(Redis.connect).toHaveBeenCalledWith(config.redis);
                expect(Trimmer).toHaveBeenCalledWith(config, mockRedisClient, mockLogger);
            });
        });

        describe('when creating a new Trimmer instance with the provided config and not providing no custom logger', () => {
            it('should use console as default logger if none is provided', () => {
                const trimmer = Rivulex.trimmer(config);

                expect(trimmer).toBeInstanceOf(Trimmer)


                expect(Redis.connect).toHaveBeenCalledWith(config.redis);
                expect(Trimmer).toHaveBeenCalledWith(config, mockRedisClient, console);
            });
        });
    });
});
