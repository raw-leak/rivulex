import EventEmitter from 'node:events';
import { Redis } from 'ioredis';
import { Channel } from '../../lib/channel/channel';
import { Publisher } from '../../lib/core/publisher';
import { Processor } from '../../lib/processor/processor';
import { ChannelsHandlers, Event } from '../../lib/types';
import { LiveConsumer, LiveConsumerConfig } from '../../lib/consumers/live.consumer';

const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
} as any

interface Payload {
    id: number
}

interface CustomHeader {
    id: number
}

interface ExpectParams {
    handlerCallCount: number
    publishedCount: number
}

interface TestCase {
    description: string
    actionsHandlers: Record<string, jest.Mock>
    expectParams: Record<string, ExpectParams>
}

describe('LiveConsumer Unit Tests', () => {
    let config: LiveConsumerConfig, processor: Processor, redisClient: Redis;
    let retries: number, processTimeout: number, processConcurrency: number;
    let liveConsumer: LiveConsumer;
    let eventEmitter: EventEmitter;

    beforeAll(() => {
        retries = 3
        processTimeout = 200
        processConcurrency = 100
        eventEmitter = new EventEmitter()
        redisClient = new Redis({ port: 6379, host: "localhost" });
        processor = new Processor({
            group: 'test-group',
            retries,
            processTimeout,
            processConcurrency
        }, redisClient, mockLogger, eventEmitter);
        config = {
            clientId: 'test-client-id',
            streams: ['test-channel'],
            group: 'test-group',
            fetchBatchSize: 1,
            blockTime: 1,
        };
    });

    describe('when initiating LiveConsumer', () => {
        describe('when initiating LiveConsumer without required params', () => {
            it('should throw error when required parameters are missing', () => {
                expect(() => {
                    new LiveConsumer(config, undefined as any, processor, mockLogger);
                }).toThrow('Missing required "redis" parameter');

                expect(() => {
                    new LiveConsumer({ ...config, streams: [] }, redisClient, processor, mockLogger);
                }).toThrow('Missing required "streams" parameter');

                expect(() => {
                    new LiveConsumer({ ...config, group: '' }, redisClient, processor, mockLogger);
                }).toThrow('Missing required "group" parameter');
            });
        });
    });

    describe('when consuming events with LoveConsumer', () => {
        afterAll((done) => {
            redisClient.quit(done);
        });

        afterEach(async () => {
            jest.clearAllMocks();
            await redisClient.flushall();
            liveConsumer.stop();
        })

        test.each<TestCase>([
            {
                description: 'should process the action with the correct handler',
                actionsHandlers: {
                    'test-action-1': jest.fn(async (event: Event<any, any>) => {
                        await event.ack();
                    }),
                    'test-action-2': jest.fn(async (event: Event<any, any>) => {
                        await event.ack();
                    })
                },
                expectParams: {
                    'test-action-1': {
                        handlerCallCount: 10,
                        publishedCount: 10,
                    },
                    'test-action-2': {
                        handlerCallCount: 10,
                        publishedCount: 10,
                    },
                },
            },
            {
                description: 'should handle an event handler that throws an error',
                actionsHandlers: {
                    'test-action-error-1': jest.fn(async (_: Event<any, any>) => {
                        throw new Error('Handler failed');
                    }),
                    'test-action-error-2': jest.fn(async (_: Event<any, any>) => {
                        throw new Error('Handler failed');
                    }),
                },
                expectParams: {
                    'test-action-error-1': {
                        handlerCallCount: 10,
                        publishedCount: 10,
                    },
                    'test-action-error-2': {
                        handlerCallCount: 10,
                        publishedCount: 10,
                    },
                },
            },
            {
                description: 'should handle processing timeout',
                actionsHandlers: {
                    'test-action-timeout-1': jest.fn(async (event: Event<any, any>) => {
                        return new Promise((resolve) => setTimeout(resolve, processTimeout + 1_000));
                    }),
                    'test-action-timeout-2': jest.fn(async (event: Event<any, any>) => {
                        return new Promise((resolve) => setTimeout(resolve, processTimeout + 1_000));
                    }),
                },
                expectParams: {
                    'test-action-timeout-1': {
                        handlerCallCount: 5,
                        publishedCount: 5,
                    },
                    'test-action-timeout-2': {
                        handlerCallCount: 5,
                        publishedCount: 5,

                    },
                },
            },
        ])("$description", (async ({ actionsHandlers, expectParams }) => {
            await createGroup(config.streams[0], config.group);

            const channel = new Channel();
            for (const action in actionsHandlers) {
                channel.action(action, actionsHandlers[action])
            }

            const channelsHandlers: ChannelsHandlers = new Map();
            channelsHandlers.set(config.streams[0], channel);

            liveConsumer = new LiveConsumer(config, redisClient, processor, mockLogger);

            const publisher = new Publisher({ group: "test-group", defaultStream: config.streams[0] }, redisClient, mockLogger);

            await Promise.all(Object.keys(actionsHandlers).map(async (action) => {
                for (let index = 0; index < expectParams[action].publishedCount; index++) {
                    await publisher.publish<Payload, CustomHeader>(action, { id: index }, { id: index })
                }
            }))

            await liveConsumer.consume(channelsHandlers);

            await new Promise((resolve) => setTimeout(resolve, 2_000));

            for (const action in expectParams) {
                const eventHandler = actionsHandlers[action];
                expect(eventHandler).toHaveBeenCalledTimes(expectParams[action].handlerCallCount)

                for (let index = 0; index < expectParams[action].handlerCallCount; index++) {
                    expect(eventHandler).toHaveBeenCalledWith(expect.objectContaining({
                        id: expect.any(String),
                        ack: expect.any(Function),
                        headers: expect.objectContaining({
                            id: index,
                            group: config.group,
                            timestamp: expect.any(String)
                        }),
                        action: action,
                        payload: { id: index },
                        stream: config.streams[0],
                        attempt: 0
                    }));
                }
            }
        }))

        async function createGroup(channel: string, group: string) {
            try {
                await redisClient.xgroup('CREATE', channel, group, '0', 'MKSTREAM');
            } catch (_) { }
        }
    });
});


