import EventEmitter from 'node:events';
import { Redis } from "ioredis";
import { Processor, ProcessorConfig } from "../../lib/processor/processor";
import { Handler, RedisClient, Event } from "../../lib/types";
import { Publisher } from "../../lib/core/publisher";
import { CONFIRMED_HOOK, DEAD_LETTER, FAILED_HOOK, REJECTED_HOOK, TIMEOUT_HOOK } from "../../lib/constants";

const mockLogger = {
    log: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
} as unknown as Console;

describe('Processor E2E Tests', () => {
    let clientId = "client-id"
    const stream = "stream-test"


    let customEventConfirmedLog = jest.fn()
    let customEventRejectedLog = jest.fn()
    let customEventTimeoutLog = jest.fn()
    let customEventFailedLog = jest.fn()

    let confirmedHookHandler = jest.fn()
    let rejectedHookHandler = jest.fn()
    let failedHookHandler = jest.fn()
    let timeoutHookHandler = jest.fn()

    const config: ProcessorConfig = {
        group: 'test-group',
        retries: 3,
        processTimeout: 60_000,
        processConcurrency: 1_000,
        customEventConfirmedLog,
        customEventRejectedLog,
        customEventTimeoutLog,
        customEventFailedLog,
    }

    let redisClient: RedisClient;
    let processor: Processor;
    let eventEmitter: EventEmitter

    beforeAll(async () => {
        redisClient = new Redis({ port: 6379, host: "localhost" })
        eventEmitter = new EventEmitter()

        eventEmitter.on(CONFIRMED_HOOK, confirmedHookHandler)
        eventEmitter.on(REJECTED_HOOK, rejectedHookHandler)
        eventEmitter.on(FAILED_HOOK, failedHookHandler)
        eventEmitter.on(TIMEOUT_HOOK, timeoutHookHandler)

        processor = new Processor(config, redisClient, mockLogger, eventEmitter);

        await redisClient.del(stream);
        await redisClient.del(DEAD_LETTER);
    });

    afterEach(async () => {
        jest.clearAllMocks();
        await redisClient.flushall()
    });

    beforeEach(async () => {
        await createGroup(stream, config.group);
    })

    afterAll(async () => {
        await redisClient.quit();
    });

    describe('when processing events with 1 attempt', () => {
        it('should process events with 1 attempt successfully and confirm them', async () => {
            const action1 = 'test-action-1';
            const action2 = 'test-action-2';
            const action3 = 'test-action-3';

            const eventsAction1 = await generateEvents({ action: action1, group: config.group, stream, clientId, attempt: 1, count: 10 });
            const eventsAction2 = await generateEvents({ action: action2, group: config.group, stream, clientId, attempt: 1, count: 10 });
            const eventsAction3 = await generateEvents({ action: action3, group: config.group, stream, clientId, attempt: 1, count: 10 });

            const handlerAction1: Handler = jest.fn(async (event: Event<any, any>) => await event.ack());
            const handlerAction2: Handler = jest.fn(async (event: Event<any, any>) => await event.ack());
            const handlerAction3: Handler = jest.fn(async (event: Event<any, any>) => await event.ack());

            const actionHandlers: Record<string, Handler> = {
                [action1]: handlerAction1,
                [action2]: handlerAction2,
                [action3]: handlerAction3,
            };

            await processor.process(stream, [...eventsAction1, ...eventsAction2, ...eventsAction3], actionHandlers);

            expect(handlerAction1).toHaveBeenCalledTimes(10);
            expect(handlerAction2).toHaveBeenCalledTimes(10);
            expect(handlerAction3).toHaveBeenCalledTimes(10);

            expect(customEventConfirmedLog).toHaveBeenCalledTimes(30);
            expect(customEventRejectedLog).toHaveBeenCalledTimes(0);
            expect(customEventTimeoutLog).toHaveBeenCalledTimes(0);
            expect(customEventFailedLog).toHaveBeenCalledTimes(0);

            for (let i = 0; i < 10; i++) {
                [action1, action2, action3].forEach((action) => {
                    expect(customEventConfirmedLog).toHaveBeenCalledWith({
                        id: expect.any(String),
                        ack: expect.any(Function),
                        headers: expect.objectContaining({
                            id: `${stream}-${i}`,
                            group: config.group,
                            timestamp: expect.any(String)
                        }),
                        action,
                        payload: { id: `${stream}-${i}` },
                        stream,
                        attempt: 1
                    });
                })
            }

            expect(confirmedHookHandler).toHaveBeenCalledTimes(30);
            expect(rejectedHookHandler).toHaveBeenCalledTimes(0);
            expect(timeoutHookHandler).toHaveBeenCalledTimes(0);
            expect(failedHookHandler).toHaveBeenCalledTimes(0);

            for (let i = 0; i < 10; i++) {
                [action1, action2, action3].forEach((action) => {
                    expect(confirmedHookHandler).toHaveBeenCalledWith({
                        id: expect.any(String),
                        ack: expect.any(Function),
                        headers: expect.objectContaining({
                            id: `${stream}-${i}`,
                            group: config.group,
                            timestamp: expect.any(String)
                        }),
                        action,
                        payload: { id: `${stream}-${i}` },
                        stream,
                        attempt: 1
                    });
                })
            }



            const pendingEventsInfo = await redisClient.xpending(stream, config.group, '-', '+', 300);
            expect(pendingEventsInfo).toHaveLength(0);

            for (const event of [...eventsAction1, ...eventsAction2, ...eventsAction3]) {
                const claimed = await redisClient.xclaim(stream, config.group, clientId, 0, event.id);
                expect(claimed).toHaveLength(0);
            }

            const deadLetterEvents = await redisClient.xrange(DEAD_LETTER, '-', '+');
            expect(deadLetterEvents).toHaveLength(0);

        });
    });

    describe('when processing events with 2 attempts', () => {
        it('should process events with 2 attempts successfully and confirm them', async () => {
            const action1 = 'test-action-1';
            const action2 = 'test-action-2';
            const action3 = 'test-action-3';

            const eventsAction1 = await generateEvents({ action: action1, group: config.group, stream, clientId, attempt: 2, count: 20 });
            const eventsAction2 = await generateEvents({ action: action2, group: config.group, stream, clientId, attempt: 2, count: 20 });
            const eventsAction3 = await generateEvents({ action: action3, group: config.group, stream, clientId, attempt: 2, count: 20 });

            const handlerAction1: Handler = jest.fn(async (event: Event<any, any>) => await event.ack());
            const handlerAction2: Handler = jest.fn(async (event: Event<any, any>) => await event.ack());
            const handlerAction3: Handler = jest.fn(async (event: Event<any, any>) => await event.ack());

            const actionHandlers: Record<string, Handler> = {
                [action1]: handlerAction1,
                [action2]: handlerAction2,
                [action3]: handlerAction3,
            };

            await processor.process(stream, [...eventsAction1, ...eventsAction2, ...eventsAction3], actionHandlers);

            expect(handlerAction1).toHaveBeenCalledTimes(20);
            expect(handlerAction2).toHaveBeenCalledTimes(20);
            expect(handlerAction3).toHaveBeenCalledTimes(20);

            expect(customEventConfirmedLog).toHaveBeenCalledTimes(60);
            expect(customEventRejectedLog).toHaveBeenCalledTimes(0);
            expect(customEventTimeoutLog).toHaveBeenCalledTimes(0);
            expect(customEventFailedLog).toHaveBeenCalledTimes(0);

            for (let i = 0; i < 20; i++) {
                [action1, action2, action3].forEach((action) => {
                    expect(customEventConfirmedLog).toHaveBeenCalledWith({
                        id: expect.any(String),
                        ack: expect.any(Function),
                        headers: expect.objectContaining({
                            id: `${stream}-${i}`,
                            group: config.group,
                            timestamp: expect.any(String)
                        }),
                        action,
                        payload: { id: `${stream}-${i}`, },
                        stream,
                        attempt: 2
                    });
                })
            }

            expect(confirmedHookHandler).toHaveBeenCalledTimes(60);
            expect(rejectedHookHandler).toHaveBeenCalledTimes(0);
            expect(timeoutHookHandler).toHaveBeenCalledTimes(0);
            expect(failedHookHandler).toHaveBeenCalledTimes(0);

            for (let i = 0; i < 20; i++) {
                [action1, action2, action3].forEach((action) => {
                    expect(confirmedHookHandler).toHaveBeenCalledWith({
                        id: expect.any(String),
                        ack: expect.any(Function),
                        headers: expect.objectContaining({
                            id: `${stream}-${i}`,
                            group: config.group,
                            timestamp: expect.any(String)
                        }),
                        action,
                        payload: { id: `${stream}-${i}` },
                        stream,
                        attempt: 2
                    });
                })
            }

            const pendingEventsInfo = await redisClient.xpending(stream, config.group, '-', '+', 300);
            expect(pendingEventsInfo).toHaveLength(0);

            for (const event of [...eventsAction1, ...eventsAction2, ...eventsAction3]) {
                const claimed = await redisClient.xclaim(stream, config.group, clientId, 0, event.id);
                expect(claimed).toHaveLength(0);
            }

            const deadLetterEvents = await redisClient.xrange(DEAD_LETTER, '-', '+');
            expect(deadLetterEvents).toHaveLength(0);


        });
    });

    describe('when processing events with 3 attempts', () => {
        it('should reject events with 3 attempts', async () => {
            const action1 = 'test-action-1';
            const action2 = 'test-action-2';
            const action3 = 'test-action-3';

            const eventsAction1 = await generateEvents({ action: action1, group: config.group, stream, clientId, attempt: 3, count: 30 });
            const eventsAction2 = await generateEvents({ action: action2, group: config.group, stream, clientId, attempt: 3, count: 30 });
            const eventsAction3 = await generateEvents({ action: action3, group: config.group, stream, clientId, attempt: 3, count: 30 });

            const handlerAction1: Handler = jest.fn(async (event: Event<any, any>) => await event.ack());
            const handlerAction2: Handler = jest.fn(async (event: Event<any, any>) => await event.ack());
            const handlerAction3: Handler = jest.fn(async (event: Event<any, any>) => await event.ack());

            const actionHandlers: Record<string, Handler> = {
                [action1]: handlerAction1,
                [action2]: handlerAction2,
                [action3]: handlerAction3,
            };

            await processor.process(stream, [...eventsAction1, ...eventsAction2, ...eventsAction3], actionHandlers);

            expect(handlerAction1).toHaveBeenCalledTimes(0);
            expect(handlerAction2).toHaveBeenCalledTimes(0);
            expect(handlerAction3).toHaveBeenCalledTimes(0);

            expect(customEventConfirmedLog).toHaveBeenCalledTimes(0);
            expect(customEventRejectedLog).toHaveBeenCalledTimes(90);
            expect(customEventTimeoutLog).toHaveBeenCalledTimes(0);
            expect(customEventFailedLog).toHaveBeenCalledTimes(0);

            expect(confirmedHookHandler).toHaveBeenCalledTimes(0);
            expect(rejectedHookHandler).toHaveBeenCalledTimes(90);
            expect(timeoutHookHandler).toHaveBeenCalledTimes(0);
            expect(failedHookHandler).toHaveBeenCalledTimes(0);

            const pendingEventsInfo = await redisClient.xpending(stream, config.group, '-', '+', 300);
            expect(pendingEventsInfo).toHaveLength(0);

            const deadLetterEvents = await redisClient.xrange(DEAD_LETTER, '-', '+');
            expect(deadLetterEvents).toHaveLength(90); // all events should be in dead-letter stream
        });
    });

    describe('when the handler fails with 2 attempts and messages should be rejected as the error has been detected', () => {
        it('should reject events when handler fails', async () => {
            const action = 'test-action-fail';

            const events = await generateEvents({ action, group: config.group, stream, clientId, attempt: 2, count: 20 });

            const handler: Handler = jest.fn(async (_: Event<any, any>) => {
                throw new Error('Handler error');
            });

            const actionHandlers: Record<string, Handler> = {
                [action]: handler,
            };

            await processor.process(stream, events, actionHandlers);

            // ensure handler was called
            expect(handler).toHaveBeenCalledTimes(20);

            expect(customEventConfirmedLog).toHaveBeenCalledTimes(0);
            expect(customEventRejectedLog).toHaveBeenCalledTimes(20);
            expect(customEventTimeoutLog).toHaveBeenCalledTimes(0);
            expect(customEventFailedLog).toHaveBeenCalledTimes(20);

            for (let i = 0; i < 20; i++) {
                expect(customEventRejectedLog).toHaveBeenCalledWith({
                    id: expect.any(String),
                    ack: expect.any(Function),
                    headers: expect.objectContaining({
                        id: `${stream}-${i}`,
                        group: config.group,
                        timestamp: expect.any(String)
                    }),
                    action,
                    payload: { id: `${stream}-${i}`, },
                    stream,
                    attempt: 2
                }, Error('Handler error'));

                expect(customEventFailedLog).toHaveBeenCalledWith({
                    id: expect.any(String),
                    ack: expect.any(Function),
                    headers: expect.objectContaining({
                        id: `${stream}-${i}`,
                        group: config.group,
                        timestamp: expect.any(String)
                    }),
                    action,
                    payload: { id: `${stream}-${i}`, },
                    stream,
                    attempt: 2
                }, Error('Handler error'));
            }

            expect(confirmedHookHandler).toHaveBeenCalledTimes(0);
            expect(rejectedHookHandler).toHaveBeenCalledTimes(20);
            expect(timeoutHookHandler).toHaveBeenCalledTimes(0);
            expect(failedHookHandler).toHaveBeenCalledTimes(20);

            for (let i = 0; i < 20; i++) {
                expect(rejectedHookHandler).toHaveBeenCalledWith({
                    id: expect.any(String),
                    ack: expect.any(Function),
                    headers: expect.objectContaining({
                        id: `${stream}-${i}`,
                        group: config.group,
                        timestamp: expect.any(String)
                    }),
                    action,
                    payload: { id: `${stream}-${i}`, },
                    stream,
                    attempt: 2
                }, Error('Handler error'));

                expect(failedHookHandler).toHaveBeenCalledWith({
                    id: expect.any(String),
                    ack: expect.any(Function),
                    headers: expect.objectContaining({
                        id: `${stream}-${i}`,
                        group: config.group,
                        timestamp: expect.any(String)
                    }),
                    action,
                    payload: { id: `${stream}-${i}`, },
                    stream,
                    attempt: 2
                }, Error('Handler error'));
            }

            // verify pending events
            const pendingEventsInfo = await redisClient.xpending(stream, config.group, '-', '+', 300);
            expect(pendingEventsInfo).toHaveLength(0);

            // verify the dead-letter stream should contain these events as the error has been detected
            const deadLetterEvents = await redisClient.xrange(DEAD_LETTER, '-', '+');
            expect(deadLetterEvents).toHaveLength(20);
        });
    });

    async function createGroup(channel: string, group: string) {
        try {

            await redisClient.xgroup('CREATE', channel, group, '0', 'MKSTREAM')
        } catch (_) { }
    }

    async function generateEvents({ stream, group, action, attempt, count, clientId }: { stream: string, action: string, group: string, clientId: string, attempt: number, count: number }): Promise<Event<{ id: string }, { id: string }>[]> {
        const events: Event<any, any>[] = [];
        const publisher = new Publisher({ defaultStream: stream, group }, redisClient, mockLogger)

        for (let i = 0; i < count; i++) {
            const id = `${stream}-${i}`
            const event: Event<any, any> = { id, action, stream, payload: { id }, attempt, headers: { id, timestamp: new Date().toISOString(), group }, ack: () => { } };
            event.id = await publisher.publish(event.action, event.payload, event.headers)
            events.push(event)
        }

        if (attempt > 0) {
            await redisClient.xreadgroup("GROUP", group, clientId, "COUNT", 30 * count, "STREAMS", stream, ">")
        }

        if (attempt > 1) {
            await redisClient.xclaim(stream, group, clientId, 0, ...events.map(event => event.id))
        }

        // to reject
        if (attempt > 2) {
            await redisClient.xclaim(stream, group, clientId, 0, ...events.map(event => event.id))

        }

        return events
    }
});
