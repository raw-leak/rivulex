import { Redis } from 'ioredis';

import { Channel } from '../../lib/channel/channel';
import { Publisher } from '../../lib/core/publisher';
import { Processor } from '../../lib/processor/processor';
import { ChannelsHandlers, Done, Event } from '../../lib/types';
import { LiveConsumer, LiveConsumerConfig } from '../../lib/consumers/live.consumer';

const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
} as any

describe('LiveConsumer', () => {
    var redisClient = new Redis({ port: 6379, host: "localhost" })
    const logger: any = mockLogger;

    const config: LiveConsumerConfig = {
        clientId: 'test-client-id',
        channels: ['test-channel'],
        group: 'test-group',
        retries: 3,
        count: 1,
        block: 0,
    };

    afterAll(() => {
        redisClient.quit()
    })

    afterEach(async () => {
        jest.clearAllMocks();
        await redisClient.flushall()
    });

    describe('when initiating LiveConsumer', () => {
        describe('when initiating LiveConsumer without required params', () => {
            it('should throw error when required parameters are missing', () => {
                expect(() => {
                    new LiveConsumer(config, undefined as any, logger);
                }).toThrow('Missing required "redis" parameter');

                expect(() => {
                    new LiveConsumer({ ...config, channels: [] }, redisClient, logger);
                }).toThrow('Missing required "channel" parameter');

                expect(() => {
                    new LiveConsumer({ ...config, group: '' }, redisClient, logger);
                }).toThrow('Missing required "group" parameter');
            });

        });
        describe('when initiating LiveConsumer with all required params', () => {
            const liveConsumer = new LiveConsumer(config, redisClient, logger);

            it('should initialize LiveConsumer with provided config', () => {
                expect(liveConsumer).toBeDefined();
                expect(liveConsumer['redis']).toBe(redisClient);
                expect(liveConsumer['clientId']).toBe(config.clientId);
                expect(liveConsumer['channels']).toEqual(config.channels);
                expect(liveConsumer['group']).toBe(config.group);
                expect(liveConsumer['count']).toBe(config.count);
                expect(liveConsumer['block']).toBe(config.block);
                expect(liveConsumer['processor']).toBeInstanceOf(Processor);
            });
        });
    });

    describe('when consuming multiple live events', () => {
        it('should process the action with right associated handlers', async () => {
            const action1 = "test-action-1"
            const payload1 = { id: "1" }
            const customHeader1 = { header: "1" }

            const action2 = "test-action-2"
            const payload2 = { id: "2" }
            const customHeader2 = { header: "1" }

            const stream = config.channels[0]

            const handler1 = jest.fn(async (_: Event, done: Done) => {
                await done();
            });

            const handler2 = jest.fn(async (_: Event, done: Done) => {
                await done();
            });

            await createGroup(stream, config.group)

            const liveConsumer = new LiveConsumer(config, redisClient.duplicate(), mockLogger);

            const channel = new Channel();
            channel.action(action1, handler1);
            channel.action(action2, handler2);

            const channelsHandlers: ChannelsHandlers = new Map()
            channelsHandlers.set(stream, channel)

            await liveConsumer.consume(channelsHandlers);
            const publisher = new Publisher({ group: "test-group", channel: stream }, redisClient.duplicate(), mockLogger)

            const eventId1 = await publisher.publish(action1, payload1, customHeader1)
            const eventId2 = await publisher.publish(action2, payload2, customHeader2)

            await new Promise((resolve) => setTimeout(resolve, 1000));

            await liveConsumer.stop();

            expect(handler1).toHaveBeenCalledTimes(1);
            const [event1, done1] = handler1.mock.calls[0] as [Event<{ id: string }, { header: string }>, Function]

            expect(done1).toBeInstanceOf(Function)

            expect(event1.id).toEqual(eventId1)
            expect(event1.action).toEqual(action1)
            expect(event1.payload).toEqual(payload1)
            expect(event1.attempt).toEqual(0)
            expect(event1.headers.header).toEqual(customHeader1.header)
            expect(event1.headers.group).toEqual(config.group)
            expect(event1.headers.timestamp).toBeDefined()

            expect(event1.headers.rejected).toBeUndefined()
            expect(event1.headers.rejectedGroup).toBeUndefined()
            expect(event1.headers.rejectedTimestamp).toBeUndefined()

            expect(handler2).toHaveBeenCalledTimes(1);
            const [event2, done2] = handler2.mock.calls[0] as [Event<{ id: string }, { header: string }>, Function]

            expect(done2).toBeInstanceOf(Function)

            expect(event2.id).toEqual(eventId2)
            expect(event2.action).toEqual(action2)
            expect(event2.payload).toEqual(payload2)
            expect(event2.attempt).toEqual(0)
            expect(event2.headers.header).toEqual(customHeader2.header)
            expect(event2.headers.group).toEqual(config.group)
            expect(event2.headers.timestamp).toBeDefined()

            expect(event2.headers.rejected).toBeUndefined()
            expect(event2.headers.rejectedGroup).toBeUndefined()
            expect(event2.headers.rejectedTimestamp).toBeUndefined()
        });
    });

    async function createGroup(channel, group) {
        try {
            await redisClient.xgroup('CREATE', channel, group, '0', 'MKSTREAM')
        } catch (_) { }
    }
});