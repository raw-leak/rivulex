
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

// Mock the actual modules after defining mock classes
jest.mock('../../lib/consumers/live.consumer', () => ({
    LiveConsumer: MockLiveConsumer
}));

jest.mock('../../lib/consumers/failed.consumer', () => ({
    FailedConsumer: MockFailedConsumer
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
        } as any;

        subscriber = new Subscriber({
            clientId: 'test-client-id',
            group: 'test-group',
            timeout: 10000,
            count: 50,
            retries: 5,
            block: 60000,
        }, mockRedisClient, mockLogger);
    });

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
        it('should initialize LiveConsumer and FailedConsumer with correct arguments', async () => {
            await subscriber.listen();

            // live
            expect(initLiveConsumer).toHaveBeenCalledTimes(1)
            let [params, redisClient, logger] = initLiveConsumer.mock.calls[0]

            expect(params).toEqual({
                clientId: 'test-client-id',
                channels: [...subscriber['channelsHandlers'].keys()],
                group: 'test-group',
                retries: 5,
                block: 60000,
                count: 50
            });
            expect(redisClient).toBeDefined()
            expect(logger).toBeDefined()
            expect(consumeLiveConsumer).toHaveBeenCalledWith(subscriber['channelsHandlers']);

            // failed
            expect(initFailedConsumer).toHaveBeenCalledTimes(1)
            let [_params, _redisClient, _logger] = initFailedConsumer.mock.calls[0]

            expect(_params).toEqual({
                clientId: 'test-client-id',
                channels: [...subscriber['channelsHandlers'].keys()],
                group: 'test-group',
                timeout: 10000,
                retries: 5,
                count: 50
            });
            expect(_redisClient).toBeDefined()
            expect(_logger).toBeDefined()
            expect(consumeFailedConsumer).toHaveBeenCalledWith(subscriber['channelsHandlers']);
        });

        it('should call createGroup to set up the Redis groups', async () => {
            const createGroupSpy = jest.spyOn(subscriber as any, 'createGroup');
            await subscriber.listen();
            expect(createGroupSpy).toHaveBeenCalled();
        });
    });
});
