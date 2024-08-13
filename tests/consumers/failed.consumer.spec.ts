import { Redis } from 'ioredis';
import { Channel } from '../../lib/channel/channel';
import { Publisher } from '../../lib/core/publisher';
import { Processor } from '../../lib/processor/processor';
import { ChannelsHandlers, Event } from '../../lib/types';
import { FailedConsumer, FailedConsumerConfig } from '../../lib/consumers/failed.consumer';

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
    rejected: boolean
    rejectedGroup: string
    rejectedTimestamp: string
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

describe('FailedConsumer Unit Tests', () => {
    let config: FailedConsumerConfig, processor: Processor, redisClient: Redis;
    let retries: number, processTimeout: number, processConcurrency: number;
    let failedConsumer: FailedConsumer;

    beforeAll(() => {
        retries = 3
        processTimeout = 200
        processConcurrency = 100

        redisClient = new Redis({ port: 6379, host: "localhost" });
        processor = new Processor({
            group: 'test-group',
            retries,
            processTimeout,
            processConcurrency,
        }, redisClient, mockLogger);
        config = {
            clientId: 'test-client-id',
            group: 'test-group',
            fetchBatchSize: 100,
            streams: ['test-channel'],
            ackTimeout: 100,
        };
    });



    describe('when initiating FailedConsumer', () => {
        describe('when initiating FailedConsumer without required params', () => {
            it('should throw error when required parameters are missing', () => {
                expect(() => {
                    new FailedConsumer(config, undefined as any, processor, mockLogger);
                }).toThrow('Missing required "redis" parameter');

                expect(() => {
                    new FailedConsumer({ ...config, streams: [] }, redisClient, processor, mockLogger);
                }).toThrow('Missing required "streams" parameter');

                expect(() => {
                    new FailedConsumer({ ...config, group: '' }, redisClient, processor, mockLogger);
                }).toThrow('Missing required "group" parameter');
            });
        });
    });

    describe('when consuming events with FailedConsumer', () => {

        afterAll((done) => {
            redisClient.quit(done);
        });

        afterEach(async () => {
            jest.clearAllMocks();
            failedConsumer.stop();
            await redisClient.flushall();
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

            const publisher = new Publisher({ group: "test-group", defaultStream: config.streams[0] }, redisClient, mockLogger);

            await Promise.all(Object.keys(actionsHandlers).map(async (action) => {
                for (let index = 0; index < expectParams[action].publishedCount; index++) {
                    await publisher.publish<Payload, CustomHeader>(action, { id: index }, { id: index, rejected: true, rejectedGroup: config.group, rejectedTimestamp: new Date().toISOString() })
                }
            }))

            await makeLiveEventsFailed(config.group, config.clientId, config.streams[0], config.fetchBatchSize)

            failedConsumer = new FailedConsumer(config, redisClient, processor, mockLogger);

            const channelsHandlers: ChannelsHandlers = new Map();
            channelsHandlers.set(config.streams[0], channel);

            await failedConsumer.consume(channelsHandlers);

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
                        attempt: 1
                    }));
                }
            }
        }))

        async function createGroup(stream: string, group: string) {
            try {
                await redisClient.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
            } catch (_) { }
        }
    });

    async function createFailedEvents(params: { stream: string, actions: string[], group: string, clientId: string }): Promise<Record<string, { id: string, action: string, stream: string, payload: Record<string, string>, headers: Record<string, string> }>> {
        const publisher = new Publisher({ group: params.group, defaultStream: params.stream }, redisClient.duplicate(), mockLogger)
        const events = {}

        for (const action of params.actions) {
            for (let i = 0; i < 30; i++) {
                const payload = { id: i }
                const headers = { id: i, rejected: true, rejectedGroup: params.group, rejectedTimestamp: new Date().toISOString() }
                const id = await publisher.publish(action, payload, headers)
                events[id] = { id, action, stream: params.stream, payload, headers }
            }
        }

        await redisClient.xreadgroup("GROUP", params.group, params.clientId, "COUNT", 30 * params.actions.length, "STREAMS", params.stream, ">")

        return events
    }

    async function makeLiveEventsFailed(group: string, clientId: string, stream: string, fetchBatchSize: number) {
        try {
            const a = await redisClient.xreadgroup("GROUP", group, clientId, "COUNT", fetchBatchSize, "STREAMS", stream, ">")
        } catch (_) { }
    }
});


