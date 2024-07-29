import { Redis } from 'ioredis';

import { ChannelsHandlers, Event } from '../../lib/types';
import { Channel } from '../../lib/channel/channel';
import { Publisher } from '../../lib/core/publisher';
import { Processor } from '../../lib/processor/processor';
import { FailedConsumerConfig, FailedConsumer } from '../../lib/consumers/failed.consumer';

const mockLogger = {
    log: jest.fn(),
} as any

// TODO: fix as it fails when executed with all tests but success when executed separately
describe.skip('FailedConsumer', () => {
    const redisClient = new Redis({ port: 6379, host: "localhost" });
    const logger: any = mockLogger;

    const config: FailedConsumerConfig = {
        clientId: 'test-client-id',
        channels: ['test-channel'],
        group: 'test-group',
        count: 20,
        retries: 3,
        timeout: 1,
    };

    afterAll((done) => {
        redisClient.quit(done)
    })

    beforeEach(async () => {
        jest.clearAllMocks();
        await redisClient.flushall()
    });

    describe('when initiating FailedConsumer', () => {
        describe('when initiating FailedConsumer without required params', () => {
            it('should throw error when required parameters are missing', () => {
                expect(() => {
                    new FailedConsumer(config, undefined as any, logger);
                }).toThrow('Missing required "redis" parameter');

                expect(() => {
                    new FailedConsumer({ ...config, channels: [] }, redisClient, logger);
                }).toThrow('Missing required "channel" parameter');

                expect(() => {
                    new FailedConsumer({ ...config, group: '' }, redisClient, logger);
                }).toThrow('Missing required "group" parameter');
            });

        });
        describe('when initiating FailedConsumer with all required params', () => {
            const failedConsumer = new FailedConsumer(config, redisClient, logger);

            it('should initialize FailedConsumer with provided config', () => {
                expect(failedConsumer).toBeDefined();
                expect(failedConsumer['redis']).toBe(redisClient);
                expect(failedConsumer['clientId']).toBe(config.clientId);
                expect(failedConsumer['channels']).toEqual(config.channels);
                expect(failedConsumer['group']).toBe(config.group);
                expect(failedConsumer['count']).toBe(config.count);
                expect(failedConsumer['timeout']).toBe(config.timeout);
                expect(failedConsumer['retries']).toBe(config.retries);
                expect(failedConsumer['processor']).toBeInstanceOf(Processor);
            });
        });
    });

    describe('when consuming multiple failed events', () => {
        it('should process the action with right associated handlers', async () => {
            const group = config.group
            const clientId = config.clientId

            // stream 1
            const stream1 = "test-stream-1"
            const stream1Action1 = "stream1-action1"
            const stream1Action2 = "stream1-action2"
            await createGroup(stream1, group)
            const eventsStream1 = await createFailedEvents({ group, clientId, stream: stream1, actions: [stream1Action1, stream1Action2] })
            const stream1Handler1 = jest.fn(async (event: Event<any, any>) => await event.ack());
            const stream1Handler2 = jest.fn(async (event: Event<any, any>) => await event.ack());

            const stream1Channel = new Channel();
            stream1Channel.action(stream1Action1, stream1Handler1);
            stream1Channel.action(stream1Action2, stream1Handler2);

            // stream 2
            const stream2 = "test-stream-2"
            const stream2Action1 = "stream2-action1"
            const stream2Action2 = "stream2-action2"
            await createGroup(stream2, group)
            const eventsStream2 = await createFailedEvents({ group, clientId, stream: stream2, actions: [stream2Action1, stream2Action2], })
            const stream2Handler1 = jest.fn(async (event: Event<any, any>) => await event.ack());
            const stream2Handler2 = jest.fn(async (event: Event<any, any>) => await event.ack());

            const stream2Channel = new Channel();
            stream2Channel.action(stream2Action1, stream2Handler1);
            stream2Channel.action(stream2Action2, stream2Handler2);

            // consumer
            const failedConsumer = new FailedConsumer({ ...config, channels: [stream1, stream2] }, redisClient.duplicate(), mockLogger);

            const channelsHandlers: ChannelsHandlers = new Map()
            channelsHandlers.set(stream1, stream1Channel)
            channelsHandlers.set(stream2, stream2Channel)

            await failedConsumer.consume(channelsHandlers);

            await new Promise((resolve) => setTimeout(resolve, 3000));

            await failedConsumer.stop();

            const countStream1 = Object.keys(eventsStream1).length / 2
            const countStream2 = Object.keys(eventsStream2).length / 2

            expect(stream1Handler1).toHaveBeenCalledTimes(countStream1);
            expect(stream1Handler2).toHaveBeenCalledTimes(countStream1);
            expect(stream2Handler1).toHaveBeenCalledTimes(countStream2);
            expect(stream2Handler2).toHaveBeenCalledTimes(countStream2);

            for (const call of stream1Handler1.mock.calls) {
                const [event] = call as [Event<{ id: string }, { id: string }>]

                const eventRef = eventsStream1[event.id]
                expect(eventRef).toBeDefined()

                expect(event.ack).toBeInstanceOf(Function)

                expect(event.id).toEqual(eventRef.id)
                expect(event.action).toEqual(eventRef.action)
                expect(event.payload).toEqual(eventRef.payload)
                expect(event.attempt).toEqual(1)
                expect(event.headers.id).toEqual(eventRef.headers.id)
                expect(event.headers.group).toEqual(group)
                expect(event.headers.timestamp).toBeDefined()

                expect(event.headers.rejected).toBeTruthy()
                expect(event.headers.rejectedGroup).toEqual(group)
                expect(event.headers.rejectedTimestamp).toBeDefined()
            }

            for (const call of stream1Handler2.mock.calls) {
                const [event] = call as [Event<{ id: string }, { id: string }>]

                const eventRef = eventsStream1[event.id]
                expect(eventRef).toBeDefined()

                expect(event.ack).toBeInstanceOf(Function)

                expect(event.id).toEqual(eventRef.id)
                expect(event.action).toEqual(eventRef.action)
                expect(event.payload).toEqual(eventRef.payload)
                expect(event.attempt).toEqual(1)
                expect(event.headers.id).toEqual(eventRef.headers.id)
                expect(event.headers.group).toEqual(group)
                expect(event.headers.timestamp).toBeDefined()

                expect(event.headers.rejected).toBeTruthy()
                expect(event.headers.rejectedGroup).toEqual(group)
                expect(event.headers.rejectedTimestamp).toBeDefined()
            }

            for (const call of stream2Handler1.mock.calls) {
                const [event] = call as [Event<{ id: string }, { id: string }>]

                const eventRef = eventsStream2[event.id]
                expect(eventRef).toBeDefined()

                expect(event.ack).toBeInstanceOf(Function)

                expect(event.id).toEqual(eventRef.id)
                expect(event.action).toEqual(eventRef.action)
                expect(event.payload).toEqual(eventRef.payload)
                expect(event.attempt).toEqual(1)
                expect(event.headers.id).toEqual(eventRef.headers.id)
                expect(event.headers.group).toEqual(group)
                expect(event.headers.timestamp).toBeDefined()

                expect(event.headers.rejected).toBeTruthy()
                expect(event.headers.rejectedGroup).toEqual(group)
                expect(event.headers.rejectedTimestamp).toBeDefined()
            }

            for (const call of stream2Handler2.mock.calls) {
                const [event] = call as [Event<{ id: string }, { id: string }>]

                const eventRef = eventsStream2[event.id]
                expect(eventRef).toBeDefined()

                expect(event.ack).toBeInstanceOf(Function)

                expect(event.id).toEqual(eventRef.id)
                expect(event.action).toEqual(eventRef.action)
                expect(event.payload).toEqual(eventRef.payload)
                expect(event.attempt).toEqual(1)
                expect(event.headers.id).toEqual(eventRef.headers.id)
                expect(event.headers.group).toEqual(group)
                expect(event.headers.timestamp).toBeDefined()

                expect(event.headers.rejected).toBeTruthy()
                expect(event.headers.rejectedGroup).toEqual(group)
                expect(event.headers.rejectedTimestamp).toBeDefined()
            }

            const stream1PendingEvents = await redisClient.xpending(stream1, group, '-', '+', 60);
            expect(stream1PendingEvents).toHaveLength(0)

            const stream2PendingEvents = await redisClient.xpending(stream2, group, '-', '+', 60);
            expect(stream2PendingEvents).toHaveLength(0)
        });
    });

    async function createGroup(stream, group) {
        try {
            await redisClient.xgroup('CREATE', stream, group, '0', 'MKSTREAM')
        } catch (_) { }
    }

    async function createFailedEvents(params: { stream: string, actions: string[], group: string, clientId: string }): Promise<Record<string, { id: string, action: string, stream: string, payload: Record<string, string>, headers: Record<string, string> }>> {
        const publisher = new Publisher({ group: params.group, channel: params.stream }, redisClient.duplicate(), mockLogger)
        const events = {}

        for (const action of params.actions) {
            for (let i = 0; i < 30; i++) {
                const ref = `${params.stream}-${action}`
                const payload = { id: ref }
                const headers = { id: ref, rejected: true, rejectedGroup: params.group, rejectedTimestamp: new Date().toISOString() }
                const id = await publisher.publish(action, payload, headers)
                events[id] = { id, action, stream: params.stream, payload, headers }
            }
        }

        await redisClient.xreadgroup("GROUP", params.group, params.clientId, "COUNT", 30 * params.actions.length, "STREAMS", params.stream, ">")

        return events
    }
});

