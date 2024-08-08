
// Mock classes and functions
const createGroup = jest.fn((...args) => {
    const callback = args[args.length - 1];
    if (callback) {
        callback(null);
    }
});

const initLiveConsumer = jest.fn();
const consumeLiveConsumer = jest.fn();
const initFailedConsumer = jest.fn();
const consumeFailedConsumer = jest.fn();
const initProcessor = jest.fn();
const initTrimmer = jest.fn();
const startTrimmer = jest.fn();

class MockLiveConsumer {
    constructor(...args) {
        initLiveConsumer(...args);
    }

    consume(...args) {
        consumeLiveConsumer(...args);
    }
}

class MockFailedConsumer {
    constructor(...args) {
        initFailedConsumer(...args);
    }

    consume(...args) {
        consumeFailedConsumer(...args);
    }
}

class MockProcessor {
    constructor(...args) {
        initProcessor(...args);
    }
}

class MockTrimmer {
    constructor(...args) {
        initTrimmer(...args);
    }

    start(...args) {
        startTrimmer(...args);
    }
}

// Mock the actual modules after defining mock classes
jest.mock('../../lib/consumers/live.consumer', () => ({
    LiveConsumer: MockLiveConsumer
}));

jest.mock('../../lib/consumers/failed.consumer', () => ({
    FailedConsumer: MockFailedConsumer
}));

jest.mock('../../lib/processor/processor', () => ({
    Processor: MockProcessor
}));

jest.mock('../../lib/core/trimmer', () => ({
    Trimmer: MockTrimmer
}));

import { Subscriber } from '../../lib/core/subscriber';
import { Channel } from '../../lib/channel/channel';
import { RedisClient } from '../../lib/types';

describe('Subscriber Unit Tests with Mock Classes', () => {
    let mockRedisClient: jest.Mocked<RedisClient>;
    let mockLogger: Console;
    let subscriber: Subscriber;

    beforeEach(() => {
        mockRedisClient = {
            xgroup: createGroup,
        } as unknown as jest.Mocked<RedisClient>;

        mockLogger = {
            log: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as any;

        subscriber = new Subscriber({
            clientId: 'test-client-id',
            group: 'test-group',
            ackTimeout: 10000,
            fetchBatchSize: 50,
            retries: 5,
            blockTime: 60000,
            processTimeout: 333,
            processConcurrency: 123,
            trimmer: {
                clientId: 'test-client-id',
                group: 'trimmer-test-group',
                streams: [],
                retentionPeriod: 555,
                intervalTime: 666
            }
        }, mockRedisClient, mockLogger);
    });

    afterEach(() => {
        initLiveConsumer.mockClear()
        consumeLiveConsumer.mockClear()
        initFailedConsumer.mockClear()
        consumeFailedConsumer.mockClear()
        initProcessor.mockClear()
        initTrimmer.mockClear()
        startTrimmer.mockClear()
        createGroup.mockClear()
    })

    describe('stream method', () => {
        it('should return a Channel instance for a given stream name', () => {
            const streamName = 'test-stream';
            const channel = subscriber.stream(streamName);
            expect(channel).toBeInstanceOf(Channel);
            expect(subscriber['channelsHandlers'].has(streamName)).toBe(true);
        });

        it('should return the same Channel instance for the same stream name', () => {
            const streamName = 'test-stream';
            const channel1 = subscriber.stream(streamName);
            const channel2 = subscriber.stream(streamName);
            expect(channel1).toBe(channel2);
        });
    });

    describe('streamAction method', () => {
        it('should add a handler to the correct channel', () => {
            const streamName = 'test-stream';
            const action = 'test-action';
            const handler = jest.fn();

            subscriber.streamAction(streamName, action, handler);

            const channel = subscriber.channelsHandlers.get(streamName) as Channel
            expect(channel).toBeDefined();
            expect(channel).toBeInstanceOf(Channel);

            const registeredHandler = channel.handlers[action]
            expect(registeredHandler).toBeDefined();
        });
    });

    describe('listen method', () => {
        let stream;

        beforeEach(async () => {
            stream = "tes-stream-listem"
            subscriber.stream(stream).action("test-action", () => { })
            await subscriber.listen();
        })

        it('should initialize LiveConsumer with right parameters', async () => {
            expect(initLiveConsumer).toHaveBeenCalledTimes(1)
            let [params, redisClient, logger] = initLiveConsumer.mock.calls[0]

            expect(params).toEqual({
                clientId: 'test-client-id',
                streams: [stream],
                group: 'test-group',
                blockTime: 60000,
                fetchBatchSize: 50
            });
            expect(redisClient).toBeDefined()
            expect(logger).toBeDefined()
        });

        it('should start consuming FailedConsumer', async () => {
            expect(consumeFailedConsumer).toHaveBeenCalled();
        });

        it('should initialize FailedConsumer with right parameters', async () => {
            expect(initFailedConsumer).toHaveBeenCalledTimes(1)
            let [params, redisClient, logger] = initFailedConsumer.mock.calls[0]

            expect(params).toEqual({
                clientId: 'test-client-id',
                streams: [stream],
                group: 'test-group',
                ackTimeout: 10000,
                fetchBatchSize: 50
            });
            expect(redisClient).toBeDefined()
            expect(logger).toBeDefined()
        });

        it('should start consuming LiveConsumer', async () => {
            expect(consumeLiveConsumer).toHaveBeenCalledTimes(1)
        });

        it('should initialize Processor with right arguments', async () => {
            expect(initProcessor).toHaveBeenCalledTimes(1)
            let [params, redisClient, logger] = initProcessor.mock.calls[0]

            expect(params).toEqual({
                group: 'test-group',
                retries: 5,
                processTimeout: 333,
                processConcurrency: 123
            });
            expect(redisClient).toBeDefined()
            expect(logger).toBeDefined()
        });

        it('should initialize Trimmer with right arguments', async () => {
            expect(initTrimmer).toHaveBeenCalledTimes(1)
            let [params, redisClient, logger] = initTrimmer.mock.calls[0]

            expect(params).toEqual({
                clientId: 'test-client-id',
                group: 'trimmer-test-group',
                streams: [],
                retentionPeriod: 555,
                intervalTime: 666
            });
            expect(redisClient).toBeDefined()
            expect(logger).toBeDefined()
        });

        it('should start Trimmer', async () => {
            expect(startTrimmer).toHaveBeenCalledTimes(1)
        });

        it('should call createGroup to set up the Redis groups', async () => {
            expect(createGroup).toHaveBeenCalledTimes(1)
        });
    });
});
