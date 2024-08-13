import Redis from 'ioredis';
import { Publisher } from '../../lib/core/publisher';
import { FAILED_HOOK, PUBLISHED_HOOK } from '../../lib/constants';

describe('Publisher E2E Tests', () => {
    let redisClient: Redis;
    let publisher: Publisher;

    const testDefaultStream = 'default-test-stream';
    const testGroup = 'test-group';

    let customPublishSucceededLog: jest.Mock;
    let customPublishFailedLog: jest.Mock;

    let onEventPublishSucceededCallback: jest.Mock;
    let onEventPublishFailedCallback: jest.Mock;

    const mockLogger = {
        log: jest.fn(),
        error: jest.fn(),
    } as any;

    beforeAll(() => {
        customPublishSucceededLog = jest.fn()
        customPublishFailedLog = jest.fn()

        onEventPublishSucceededCallback = jest.fn()
        onEventPublishFailedCallback = jest.fn()

        redisClient = new Redis();
        publisher = new Publisher(
            {
                defaultStream: testDefaultStream,
                group: testGroup,
                customPublishSucceededLog,
                customPublishFailedLog
            },
            redisClient,
            mockLogger
        );

        publisher.on(PUBLISHED_HOOK, onEventPublishSucceededCallback)
        publisher.on(FAILED_HOOK, onEventPublishFailedCallback)
    });

    beforeEach(async () => {
        await redisClient.flushall()
    })

    afterAll(async () => {
        await publisher.stop();
    });

    describe('publish method', () => {
        describe('when publishing a new event to default stream', () => {
            let action, payload, headers, eventId;

            beforeEach(async () => {
                action = 'test-action';
                payload = { key: 'value' };
                headers = { customHeader: 'customHeader' };

                eventId = await publisher.publish(action, payload, headers);
            })

            it('should publish a single event to the default stream in redis', async () => {
                const storedEvent = await redisClient.xrange(testDefaultStream, '-', '+');
                expect(storedEvent).toHaveLength(1);

                const [id, fields] = storedEvent[0];
                expect(id).toBe(eventId);

                expect(fields).toHaveLength(6)

                expect(fields[0]).toEqual('action');
                expect(fields[1]).toEqual(action);

                expect(fields[2]).toEqual('payload');
                expect(JSON.parse(fields[3])).toEqual(payload);

                expect(fields[4]).toEqual('headers');
                expect(JSON.parse(fields[5])).toEqual({ ...headers, timestamp: expect.any(String), group: testGroup });
            });

            it('should execute the callback on publishing the event successfully to define custom log messages', async () => {
                expect(customPublishSucceededLog).toHaveBeenCalledWith(eventId, {
                    headers: expect.objectContaining({
                        ...headers,
                        group: testGroup,
                        timestamp: expect.any(String)
                    }),
                    action,
                    payload,
                    stream: testDefaultStream
                })
                expect(customPublishFailedLog).not.toHaveBeenCalled()
            });

            it('should emit event on publishing successfully', async () => {
                expect(onEventPublishSucceededCallback).toHaveBeenCalledWith(eventId, {
                    headers: expect.objectContaining({
                        ...headers,
                        group: testGroup,
                        timestamp: expect.any(String)
                    }),
                    action,
                    payload,
                    stream: testDefaultStream
                })
                expect(onEventPublishFailedCallback).not.toHaveBeenCalled()
            });
        });

        describe('when publishing a new event to custom stream', () => {
            let action, payload, headers, eventId, customStream;

            beforeEach(async () => {
                customStream = "custom-stream"
                action = 'test-action';
                payload = { key: 'value' };
                headers = { customHeader: 'customHeader' };

                eventId = await publisher.publish(customStream, action, payload, headers);
            })

            it('should NOT publish any events to the default stream in redis', async () => {
                const storedEvent = await redisClient.xrange(testDefaultStream, '-', '+');
                expect(storedEvent).toHaveLength(0);
            });

            it('should publish a single event to the default stream in redis', async () => {
                const storedEvent = await redisClient.xrange(customStream, '-', '+');
                expect(storedEvent).toHaveLength(1);

                const [id, fields] = storedEvent[0];
                expect(id).toBe(eventId);

                expect(fields).toHaveLength(6)

                expect(fields[0]).toEqual('action');
                expect(fields[1]).toEqual(action);


                expect(fields[2]).toEqual('payload');
                expect(JSON.parse(fields[3])).toEqual(payload);

                expect(fields[4]).toEqual('headers');
                expect(JSON.parse(fields[5])).toEqual({ ...headers, timestamp: expect.any(String), group: testGroup });
            });

            it('should execute the callback on publishing the event successfully to define custom log messages', async () => {
                expect(customPublishSucceededLog).toHaveBeenCalledWith(eventId, {
                    headers: expect.objectContaining({
                        ...headers,
                        group: testGroup,
                        timestamp: expect.any(String)
                    }),
                    action,
                    payload,
                    stream: customStream
                })
                expect(customPublishFailedLog).not.toHaveBeenCalled()
            });

            it('should emit event on publishing successfully', async () => {
                expect(onEventPublishSucceededCallback).toHaveBeenCalledWith(eventId, {
                    headers: expect.objectContaining({
                        ...headers,
                        group: testGroup,
                        timestamp: expect.any(String)
                    }),
                    action,
                    payload,
                    stream: customStream
                })
                expect(onEventPublishFailedCallback).not.toHaveBeenCalled()
            });
        });
    });

    describe('publishBatch method', () => {
        describe('when publishing multiple events to default stream', () => {
            let messages, results;

            beforeEach(async () => {
                messages = [
                    { action: 'action1', payload: { key: 'value1' }, headers: { customHeader: 'customHeader1' } },
                    { action: 'action2', payload: { key: 'value2' }, headers: { customHeader: 'customHeader2' } },
                    { action: 'action3', payload: { key: 'value3' }, headers: { customHeader: 'customHeader3' } },
                ];

                results = await publisher.publishBatch(messages);
            });

            it('should return the result of publishing all the events successfully', async () => {
                expect(results).toHaveLength(3);

                results.forEach(({ id, ok, error }) => {
                    expect(ok).toBeTruthy()
                    expect(id).toBeDefined()
                    expect(error).toBeNull()
                });
            })

            it('should publish multiple events to the default stream in redis', async () => {
                expect(results).toHaveLength(3);

                const storedEvents = await redisClient.xrange(testDefaultStream, '-', '+');
                expect(storedEvents).toHaveLength(3);

                storedEvents.forEach(([, fields], index) => {
                    const { action, payload, headers } = messages[index];

                    expect(fields).toHaveLength(6);

                    expect(fields[0]).toEqual('action');
                    expect(fields[1]).toEqual(action);

                    expect(fields[2]).toEqual('payload');
                    expect(JSON.parse(fields[3])).toEqual(payload);

                    expect(fields[4]).toEqual('headers');
                    expect(JSON.parse(fields[5])).toEqual({ ...headers, timestamp: expect.any(String), group: testGroup });
                });
            });

            it('should execute the callback on publishing the event successfully to define custom log messages', async () => {
                messages.forEach((message, index) => {
                    expect(customPublishSucceededLog).toHaveBeenCalledWith(results[index].id, {
                        headers: expect.objectContaining({
                            ...message.headers,
                            group: testGroup,
                            timestamp: expect.any(String)
                        }),
                        action: message.action,
                        payload: message.payload,
                        stream: testDefaultStream
                    });
                });

                expect(customPublishFailedLog).not.toHaveBeenCalled();
            });

            it('should emit event on publishing successfully', async () => {
                messages.forEach((message, index) => {
                    expect(onEventPublishSucceededCallback).toHaveBeenCalledWith(results[index].id, {
                        headers: expect.objectContaining({
                            ...message.headers,
                            group: testGroup,
                            timestamp: expect.any(String)
                        }),
                        action: message.action,
                        payload: message.payload,
                        stream: testDefaultStream
                    });
                });

                expect(onEventPublishFailedCallback).not.toHaveBeenCalled();
            });
        });

        describe('when publishing multiple events to custom stream', () => {
            let messages: Array<{ stream?: string, action: string, payload: any, headers: any }>, results, customStream;

            beforeEach(async () => {
                customStream = "custom-stream";
                messages = [
                    { stream: customStream, action: 'action1', payload: { key: 'value1' }, headers: { customHeader: 'customHeader1' } },
                    { stream: customStream, action: 'action2', payload: { key: 'value2' }, headers: { customHeader: 'customHeader2' } },
                    { stream: customStream, action: 'action3', payload: { key: 'value3' }, headers: { customHeader: 'customHeader3' } },
                ];

                results = await publisher.publishBatch(messages);
            });

            it('should return the result of publishing all the events successfully', async () => {
                expect(results).toHaveLength(3);

                results.forEach(({ id, ok, error }) => {
                    expect(ok).toBeTruthy()
                    expect(id).toBeDefined()
                    expect(error).toBeNull()
                });
            })

            it('should not publish any events to the default stream in redis', async () => {
                const storedEvent = await redisClient.xrange(testDefaultStream, '-', '+');
                expect(storedEvent).toHaveLength(0);
            });

            it('should publish multiple events to the custom stream in redis', async () => {
                const storedEvents = await redisClient.xrange(customStream, '-', '+');
                expect(storedEvents).toHaveLength(3);

                storedEvents.forEach(([, fields], index) => {
                    const { action, payload, headers } = messages[index];

                    expect(fields).toHaveLength(6);

                    expect(fields[0]).toEqual('action');
                    expect(fields[1]).toEqual(action);

                    expect(fields[2]).toEqual('payload');
                    expect(JSON.parse(fields[3])).toEqual(payload);

                    expect(fields[4]).toEqual('headers');
                    expect(JSON.parse(fields[5])).toEqual({ ...headers, timestamp: expect.any(String), group: testGroup });
                });
            });

            it('should execute the callback on publishing the event successfully to define custom log messages', async () => {
                messages.forEach((message, index) => {
                    expect(customPublishSucceededLog).toHaveBeenCalledWith(results[index].id, {
                        headers: expect.objectContaining({
                            ...message.headers,
                            group: testGroup,
                            timestamp: expect.any(String)
                        }),
                        action: message.action,
                        payload: message.payload,
                        stream: customStream
                    });
                });

                expect(customPublishFailedLog).not.toHaveBeenCalled();
            });

            it('should emit event on publishing successfully', async () => {
                messages.forEach((message, index) => {
                    expect(onEventPublishSucceededCallback).toHaveBeenCalledWith(results[index].id, {
                        headers: expect.objectContaining({
                            ...message.headers,
                            group: testGroup,
                            timestamp: expect.any(String)
                        }),
                        action: message.action,
                        payload: message.payload,
                        stream: customStream
                    });
                });

                expect(onEventPublishFailedCallback).not.toHaveBeenCalled();
            });
        });

        describe.only('when publishing multiple events to custom and default streams', () => {
            let messages, results, customStream;

            beforeEach(async () => {
                customStream = "custom-stream";
                messages = [
                    { action: 'action1', payload: { key: 'value1' }, headers: { customHeader: 'customHeader1' } },
                    { stream: customStream, action: 'action2', payload: { key: 'value2' }, headers: { customHeader: 'customHeader2' } },
                    { stream: customStream, action: 'action3', payload: { key: 'value3' }, headers: { customHeader: 'customHeader3' } },
                ];

                results = await publisher.publishBatch(messages);
            });

            it('should return the result of publishing all the events successfully', async () => {
                expect(results).toHaveLength(3);

                results.forEach(({ id, ok, error }) => {
                    expect(ok).toBeTruthy()
                    expect(id).toBeDefined()
                    expect(error).toBeNull()
                });
            })

            it('should publish an event to the default stream and multiple events to the custom stream in redis', async () => {
                expect(results).toHaveLength(3);

                const defaultStoredEvents = await redisClient.xrange(testDefaultStream, '-', '+');
                expect(defaultStoredEvents).toHaveLength(1);

                const storedEvents = await redisClient.xrange(customStream, '-', '+');
                expect(storedEvents).toHaveLength(2);

                defaultStoredEvents.concat(storedEvents).forEach(([, fields], index) => {
                    const { action, payload, headers } = messages[index];

                    expect(fields).toHaveLength(6);

                    expect(fields[0]).toEqual('action');
                    expect(fields[1]).toEqual(action);

                    expect(fields[2]).toEqual('payload');
                    expect(JSON.parse(fields[3])).toEqual(payload);

                    expect(fields[4]).toEqual('headers');
                    expect(JSON.parse(fields[5])).toEqual({ ...headers, timestamp: expect.any(String), group: testGroup });
                });
            });

            it('should execute the callback on publishing the event successfully to define custom log messages', async () => {
                messages.forEach((message, index) => {
                    expect(customPublishSucceededLog).toHaveBeenCalledWith(results[index].id, {
                        headers: expect.objectContaining({
                            ...message.headers,
                            group: testGroup,
                            timestamp: expect.any(String)
                        }),
                        action: message.action,
                        payload: message.payload,
                        stream: message.stream || testDefaultStream
                    });
                });

                expect(customPublishFailedLog).not.toHaveBeenCalled();
            });

            it('should emit event on publishing successfully', async () => {
                messages.forEach((message, index) => {
                    expect(onEventPublishSucceededCallback).toHaveBeenCalledWith(results[index].id, {
                        headers: expect.objectContaining({
                            ...message.headers,
                            group: testGroup,
                            timestamp: expect.any(String)
                        }),
                        action: message.action,
                        payload: message.payload,
                        stream: message.stream || testDefaultStream
                    });
                });

                expect(onEventPublishFailedCallback).not.toHaveBeenCalled();
            });
        });
    });
});
