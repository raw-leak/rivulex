
// Mock classes and functions
const xadd = jest.fn();

const pipeline = jest.fn();
const xaddPipe = jest.fn();
const execPipe = jest.fn();

const failedHookCallback = jest.fn();
const publishedHookCallback = jest.fn();

const initTrimmer = jest.fn();
const startTrimmer = jest.fn();

const customPublishFailedLog = jest.fn();
const customPublishSucceededLog = jest.fn();

class MockTrimmer {
    constructor(...args) {
        initTrimmer(...args);
    }

    start(...args) {
        startTrimmer(...args);
    }
}

jest.mock('../../lib/core/trimmer', () => ({
    Trimmer: MockTrimmer
}));

import { PublisherConfig } from '../../lib/config/publisher.config';
import { Publisher } from '../../lib/core/publisher';
import { FAILED_HOOK, PUBLISHED_HOOK } from '../../lib/constants';
import { RedisClient } from '../../lib/types';

describe('Publisher Unit Tests', () => {
    let mockRedisClient: jest.Mocked<RedisClient>;
    let mockLogger: Console;
    let publisher: Publisher;
    let config: PublisherConfig;

    beforeEach(() => {
        mockRedisClient = {
            xadd: xadd,
            pipeline: pipeline,
        } as unknown as jest.Mocked<RedisClient>;

        mockLogger = {
            log: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as any;

        config = {
            group: 'test-group',
            defaultStream: "default-test-stream",
            customPublishFailedLog: customPublishFailedLog,
            customPublishSucceededLog: customPublishSucceededLog,
            trimmer: {
                clientId: 'test-client-id',
                group: 'trimmer-test-group',
                streams: [],
                retentionPeriod: 555,
                intervalTime: 666
            }
        }

        publisher = new Publisher(config, mockRedisClient, mockLogger);

        publisher.on(FAILED_HOOK, failedHookCallback)
        publisher.on(PUBLISHED_HOOK, publishedHookCallback)
    });

    afterEach(() => {
        jest.clearAllMocks();
    })

    describe('publish method', () => {
        describe('when successfully publishing new event to a default stream including custom headers', () => {
            let payload: { payload: boolean }, action: string, customHeaders: { headers: boolean }, id: string, fakeId: string;

            beforeEach(async () => {
                action = "action"
                payload = { payload: true }
                customHeaders = { headers: true }

                fakeId = "fake-id"

                xadd.mockResolvedValueOnce(fakeId)

                id = await publisher.publish(action, payload, customHeaders);
            })

            it('should return generated event ID', () => {
                expect(id).toBe(fakeId);
            });

            it('should call Redis xadd method with defined parameters', () => {
                expect(xadd).toHaveBeenCalledTimes(1);

                const [stream, option, actionWord, actionStr, payloadWord, payloadStr, headersWord, headersStr] = xadd.mock.calls[0]

                expect(stream).toBe(config.defaultStream)
                expect(option).toBe("*")

                expect(actionWord).toBe("action")
                expect(actionStr).toBe(action)

                expect(payloadWord).toBe("payload")
                expect(JSON.parse(payloadStr)).toEqual(payload)

                const expectedHeaders = expect.objectContaining({
                    ...customHeaders,
                    group: config.group,
                    timestamp: expect.any(String)
                })

                expect(headersWord).toBe("headers")
                expect(JSON.parse(headersStr)).toEqual(expectedHeaders)
            });

            it('should customize the log message for successfully published event', () => {
                expect(customPublishSucceededLog).toHaveBeenCalledWith(fakeId, {
                    stream: config.defaultStream,
                    action: action,
                    payload: payload,
                    headers: expect.objectContaining({
                        ...customHeaders,
                        group: config.group,
                        timestamp: expect.any(String)
                    })
                })
            })

            it('should emit published hook event with defined parameters', () => {
                expect(publishedHookCallback).toHaveBeenCalledTimes(1)
                expect(publishedHookCallback).toHaveBeenCalledWith(fakeId,
                    {
                        stream: config.defaultStream,
                        action: action,
                        payload: payload,
                        headers: expect.objectContaining({
                            ...customHeaders,
                            group: config.group,
                            timestamp: expect.any(String)
                        })
                    }
                );
            });
        });
        describe('when successfully publishing new event to a custom stream including custom headers', () => {
            let payload: { payload: boolean }, customStream: string, action: string, customHeaders: { headers: boolean }, id: string, fakeId: string;

            beforeEach(async () => {
                action = "action"
                payload = { payload: true }
                customHeaders = { headers: true }
                customStream = "custom-stream"
                fakeId = "fake-id"

                xadd.mockResolvedValueOnce(fakeId)

                id = await publisher.publish(customStream, action, payload, customHeaders);
            })

            it('should return generated event ID', () => {
                expect(id).toBe(fakeId);
            });

            it('should call Redis xadd method with defined parameters', () => {
                expect(xadd).toHaveBeenCalledTimes(1);

                const [stream, option, actionWord, actionStr, payloadWord, payloadStr, headersWord, headersStr] = xadd.mock.calls[0]

                expect(stream).toBe(customStream)
                expect(option).toBe("*")

                expect(actionWord).toBe("action")
                expect(actionStr).toBe(action)

                expect(payloadWord).toBe("payload")
                expect(JSON.parse(payloadStr)).toEqual(payload)

                const expectedHeaders = expect.objectContaining({
                    ...customHeaders,
                    group: config.group,
                    timestamp: expect.any(String)
                })

                expect(headersWord).toBe("headers")
                expect(JSON.parse(headersStr)).toEqual(expectedHeaders)
            });

            it('should customize the log message for successfully published event', () => {
                expect(customPublishSucceededLog).toHaveBeenCalledWith(fakeId, {
                    stream: customStream,
                    action: action,
                    payload: payload,
                    headers: expect.objectContaining({
                        ...customHeaders,
                        group: config.group,
                        timestamp: expect.any(String)
                    })
                })
            })

            it('should emit published hook event with defined parameters', () => {
                expect(publishedHookCallback).toHaveBeenCalledTimes(1)
                expect(publishedHookCallback).toHaveBeenCalledWith(fakeId,
                    {
                        stream: customStream,
                        action: action,
                        payload: payload,
                        headers: expect.objectContaining({
                            ...customHeaders,
                            group: config.group,
                            timestamp: expect.any(String)
                        })
                    }
                );
            });
        });
        describe('when unsuccessfully publishing new event to a default stream including custom headers', () => {
            let payload: { payload: boolean }, action: string, customHeaders: { headers: boolean }, error: Error;

            beforeEach(async () => {
                action = "action"
                payload = { payload: true }
                customHeaders = { headers: true }

                xadd.mockRejectedValueOnce(new Error("some error"))

                try {
                    await publisher.publish(action, payload, customHeaders);
                } catch (err) {
                    error = err as Error;
                }
            })

            it('should thrown error', () => {
                expect(error).toBeDefined();
                expect(error.message).toBe("some error");
            });

            it('should call Redis xadd method with defined parameters', () => {
                expect(xadd).toHaveBeenCalledTimes(1);

                const [stream, option, actionWord, actionStr, payloadWord, payloadStr, headersWord, headersStr] = xadd.mock.calls[0]

                expect(stream).toBe(config.defaultStream)
                expect(option).toBe("*")

                expect(actionWord).toBe("action")
                expect(actionStr).toBe(action)

                expect(payloadWord).toBe("payload")
                expect(JSON.parse(payloadStr)).toEqual(payload)

                const expectedHeaders = expect.objectContaining({
                    ...customHeaders,
                    group: config.group,
                    timestamp: expect.any(String)
                })

                expect(headersWord).toBe("headers")
                expect(JSON.parse(headersStr)).toEqual(expectedHeaders)
            });

            it('should customize the log message for failed to publish event', () => {
                expect(customPublishFailedLog).toHaveBeenCalledWith({
                    stream: config.defaultStream,
                    action: action,
                    payload: payload,
                    headers: expect.objectContaining({
                        ...customHeaders,
                        group: config.group,
                        timestamp: expect.any(String)
                    })
                }, new Error("some error"))
            })

            it('should emit failed hook event with defined parameters', () => {
                expect(failedHookCallback).toHaveBeenCalledTimes(1)
                expect(failedHookCallback).toHaveBeenCalledWith(
                    {
                        stream: config.defaultStream,
                        action: action,
                        payload: payload,
                        headers: expect.objectContaining({
                            ...customHeaders,
                            group: config.group,
                            timestamp: expect.any(String)
                        })
                    }, new Error("some error")
                );
            });
        });
        describe('when unsuccessfully publishing new event to a custom stream including custom headers', () => {
            let payload: { payload: boolean }, action: string, customStream: string, customHeaders: { headers: boolean }, error: Error;

            beforeEach(async () => {
                action = "action"
                customStream = "custom-stream"
                payload = { payload: true }
                customHeaders = { headers: true }

                xadd.mockRejectedValueOnce(new Error("some error"))

                try {
                    await publisher.publish(customStream, action, payload, customHeaders);
                } catch (err) {
                    error = err as Error;
                }
            })

            it('should thrown error', () => {
                expect(error).toBeDefined();
                expect(error.message).toBe("some error");
            });

            it('should call Redis xadd method with defined parameters', () => {
                expect(xadd).toHaveBeenCalledTimes(1);

                const [stream, option, actionWord, actionStr, payloadWord, payloadStr, headersWord, headersStr] = xadd.mock.calls[0]

                expect(stream).toBe(customStream)
                expect(option).toBe("*")

                expect(actionWord).toBe("action")
                expect(actionStr).toBe(action)

                expect(payloadWord).toBe("payload")
                expect(JSON.parse(payloadStr)).toEqual(payload)

                const expectedHeaders = expect.objectContaining({
                    ...customHeaders,
                    group: config.group,
                    timestamp: expect.any(String)
                })

                expect(headersWord).toBe("headers")
                expect(JSON.parse(headersStr)).toEqual(expectedHeaders)
            });

            it('should customize the log message for failed to publish event', () => {
                expect(customPublishFailedLog).toHaveBeenCalledWith({
                    stream: customStream,
                    action: action,
                    payload: payload,
                    headers: expect.objectContaining({
                        ...customHeaders,
                        group: config.group,
                        timestamp: expect.any(String)
                    })
                }, new Error("some error"))
            })

            it('should emit failed hook event with defined parameters', () => {
                expect(failedHookCallback).toHaveBeenCalledTimes(1)
                expect(failedHookCallback).toHaveBeenCalledWith(
                    {
                        stream: customStream,
                        action: action,
                        payload: payload,
                        headers: expect.objectContaining({
                            ...customHeaders,
                            group: config.group,
                            timestamp: expect.any(String)
                        })
                    }, new Error("some error")
                );
            });
        });
    });

    describe('publishBatch method', () => {
        describe('when successfully publishing new events in batch to a default stream including custom headers', () => {
            let result: { ok: boolean, id?: string, error: Error | null }[]
            let events: { stream?: string, action: string, payload: { payload: string }, headers: { headers: string } }[]

            beforeEach(async () => {
                events = Array(20).fill(null).map((_, i) => {
                    return {
                        action: `event-${i}-action`,
                        payload: { payload: `event-${i}-payload` },
                        headers: { headers: `event-${i}-headers` },
                    };
                });

                xaddPipe.mockReturnValue(true)
                execPipe.mockResolvedValue(
                    Array(events.length).fill(null).map((_, i) => [null, `event-${i}-id`])
                );

                pipeline.mockReturnValue({
                    xadd: xaddPipe,
                    exec: execPipe,
                });

                result = await publisher.publishBatch(events);
            })

            it('should return batch operation result with all successfully published events', () => {
                expect(result).toBeDefined();
                expect(result).toHaveLength(events.length);

                result.forEach((singleResult, i) => {
                    expect(singleResult).toEqual({
                        ok: true,
                        error: null,
                        id: `event-${i}-id`
                    })
                });
            });

            it('should create a single Redis pipeline with xadd methods and eventually executing the transaction with defined parameters', () => {
                expect(pipeline).toHaveBeenCalledTimes(1);
                expect(xaddPipe).toHaveBeenCalledTimes(events.length);
                expect(execPipe).toHaveBeenCalledTimes(1);


                events.forEach((event, i) => {
                    const [stream, option, actionWord, action, payloadWord, payloadStr, headersWord, headersStr] = xaddPipe.mock.calls[i]

                    expect(stream).toBe(config.defaultStream)
                    expect(option).toBe("*")

                    expect(actionWord).toBe("action")
                    expect(action).toBe(event.action)

                    expect(payloadWord).toBe("payload")
                    expect(JSON.parse(payloadStr)).toEqual(event.payload)

                    const expectedHeaders = expect.objectContaining({
                        ...event.headers,
                        group: config.group,
                        timestamp: expect.any(String)
                    })

                    expect(headersWord).toBe("headers")
                    expect(JSON.parse(headersStr)).toEqual(expectedHeaders)
                })
            });

            it('should customize the log message for successfully published event', () => {
                expect(customPublishSucceededLog).toHaveBeenCalledTimes(events.length)

                events.forEach((event, i) => {
                    expect(customPublishSucceededLog).toHaveBeenCalledWith(`event-${i}-id`, {
                        stream: config.defaultStream,
                        action: event.action,
                        payload: event.payload,
                        headers: expect.objectContaining({
                            ...event.headers,
                            group: config.group,
                            timestamp: expect.any(String)
                        })
                    })
                })
            })

            it('should emit published hook event with defined parameters', () => {
                expect(publishedHookCallback).toHaveBeenCalledTimes(events.length)

                events.forEach((event, i) => {
                    expect(publishedHookCallback).toHaveBeenCalledWith(`event-${i}-id`, {
                        stream: config.defaultStream,
                        action: event.action,
                        payload: event.payload,
                        headers: expect.objectContaining({
                            ...event.headers,
                            group: config.group,
                            timestamp: expect.any(String)
                        })
                    })
                })
            });
        });
        describe('when unsuccessfully publishing new events in batch to a default stream including custom headers', () => {
            let result: { ok: boolean, id?: string, error: Error | null }[]
            let events: { stream?: string, action: string, payload: { payload: string }, headers: { headers: string } }[]

            beforeEach(async () => {
                events = Array(20).fill(null).map((_, i) => {
                    return {
                        action: `event-${i}-action`,
                        payload: { payload: `event-${i}-payload` },
                        headers: { headers: `event-${i}-headers` },
                    };
                });

                xaddPipe.mockReturnValue(true)
                execPipe.mockResolvedValue(
                    Array(events.length).fill(null).map((_, i) => [new Error("some error"), null])
                );

                pipeline.mockReturnValue({
                    xadd: xaddPipe,
                    exec: execPipe,
                });

                result = await publisher.publishBatch(events);
            })

            it('should return batch operation result with all successfully published events', () => {
                expect(result).toBeDefined();
                expect(result).toHaveLength(events.length);

                result.forEach((singleResult, i) => {
                    expect(singleResult).toEqual({
                        ok: false,
                        error: new Error("some error"),
                        id: null
                    })
                });
            });

            it('should create a single Redis pipeline with xadd methods and eventually executing the transaction with defined parameters', () => {
                expect(pipeline).toHaveBeenCalledTimes(1);
                expect(xaddPipe).toHaveBeenCalledTimes(events.length);
                expect(execPipe).toHaveBeenCalledTimes(1);

                events.forEach((event, i) => {
                    const [stream, option, actionWord, action, payloadWord, payloadStr, headersWord, headersStr] = xaddPipe.mock.calls[i]

                    expect(stream).toBe(config.defaultStream)
                    expect(option).toBe("*")

                    expect(actionWord).toBe("action")
                    expect(action).toBe(event.action)

                    expect(payloadWord).toBe("payload")
                    expect(JSON.parse(payloadStr)).toEqual(event.payload)

                    const expectedHeaders = expect.objectContaining({
                        ...event.headers,
                        group: config.group,
                        timestamp: expect.any(String)
                    })

                    expect(headersWord).toBe("headers")
                    expect(JSON.parse(headersStr)).toEqual(expectedHeaders)
                })

            });

            it('should customize the log message for successfully published event', () => {
                expect(customPublishFailedLog).toHaveBeenCalledTimes(events.length)
                events.forEach((event, i) => {
                    expect(customPublishFailedLog).toHaveBeenCalledWith({
                        stream: config.defaultStream,
                        action: event.action,
                        payload: event.payload,
                        headers: expect.objectContaining({
                            ...event.headers,
                            group: config.group,
                            timestamp: expect.any(String)
                        })
                    }, new Error("some error"))
                })
            })

            it('should emit published hook event with defined parameters', () => {
                expect(failedHookCallback).toHaveBeenCalledTimes(events.length)
                events.forEach((event, i) => {
                    expect(failedHookCallback).toHaveBeenCalledWith({
                        stream: config.defaultStream,
                        action: event.action,
                        payload: event.payload,
                        headers: expect.objectContaining({
                            ...event.headers,
                            group: config.group,
                            timestamp: expect.any(String)
                        })
                    }, new Error("some error"))
                })
            });
        });
        describe('when successfully publishing new events in batch to a custom stream including custom headers', () => {
            let result: { ok: boolean, id?: string, error: Error | null }[]
            let events: { stream?: string, action: string, payload: { payload: string }, headers: { headers: string } }[]
            let customStream: string;

            beforeEach(async () => {
                customStream = "custom-stream"

                events = Array(20).fill(null).map((_, i) => {
                    return {
                        stream: customStream,
                        action: `event-${i}-action`,
                        payload: { payload: `event-${i}-payload` },
                        headers: { headers: `event-${i}-headers` },
                    };
                });

                xaddPipe.mockReturnValue(true)
                execPipe.mockResolvedValue(
                    Array(events.length).fill(null).map((_, i) => [null, `event-${i}-id`])
                );

                pipeline.mockReturnValue({
                    xadd: xaddPipe,
                    exec: execPipe,
                });

                result = await publisher.publishBatch(events);
            })

            it('should return batch operation result with all successfully published events', () => {
                expect(result).toBeDefined();
                expect(result).toHaveLength(events.length);

                result.forEach((singleResult, i) => {
                    expect(singleResult).toEqual({
                        ok: true,
                        error: null,
                        id: `event-${i}-id`
                    })
                });
            });

            it('should create a single Redis pipeline with xadd methods and eventually executing the transaction with defined parameters', () => {
                expect(pipeline).toHaveBeenCalledTimes(1);
                expect(xaddPipe).toHaveBeenCalledTimes(events.length);
                expect(execPipe).toHaveBeenCalledTimes(1);


                events.forEach((event, i) => {
                    const [stream, option, actionWord, action, payloadWord, payloadStr, headersWord, headersStr] = xaddPipe.mock.calls[i]

                    expect(stream).toBe(customStream)
                    expect(option).toBe("*")

                    expect(actionWord).toBe("action")
                    expect(action).toBe(event.action)

                    expect(payloadWord).toBe("payload")
                    expect(JSON.parse(payloadStr)).toEqual(event.payload)

                    const expectedHeaders = expect.objectContaining({
                        ...event.headers,
                        group: config.group,
                        timestamp: expect.any(String)
                    })

                    expect(headersWord).toBe("headers")
                    expect(JSON.parse(headersStr)).toEqual(expectedHeaders)
                })
            });

            it('should customize the log message for successfully published event', () => {
                expect(customPublishSucceededLog).toHaveBeenCalledTimes(events.length)
                events.forEach((event, i) => {
                    expect(customPublishSucceededLog).toHaveBeenCalledWith(`event-${i}-id`, {
                        stream: customStream,
                        action: event.action,
                        payload: event.payload,
                        headers: expect.objectContaining({
                            ...event.headers,
                            group: config.group,
                            timestamp: expect.any(String)
                        })
                    })
                })
            })

            it('should emit published hook event with defined parameters', () => {
                expect(publishedHookCallback).toHaveBeenCalledTimes(events.length)

                events.forEach((event, i) => {
                    expect(publishedHookCallback).toHaveBeenCalledWith(`event-${i}-id`, {
                        stream: customStream,
                        action: event.action,
                        payload: event.payload,
                        headers: expect.objectContaining({
                            ...event.headers,
                            group: config.group,
                            timestamp: expect.any(String)
                        })
                    })
                })
            });
        });
        describe('when unsuccessfully publishing new events in batch to a custom stream including custom headers', () => {
            let result: { ok: boolean, id?: string, error: Error | null }[]
            let events: { stream?: string, action: string, payload: { payload: string }, headers: { headers: string } }[]
            let customStream: string;

            beforeEach(async () => {
                customStream = "custom-stream"

                events = Array(20).fill(null).map((_, i) => {
                    return {
                        stream: customStream,
                        action: `event-${i}-action`,
                        payload: { payload: `event-${i}-payload` },
                        headers: { headers: `event-${i}-headers` },
                    };
                });

                xaddPipe.mockReturnValue(true)
                execPipe.mockResolvedValue(
                    Array(events.length).fill(null).map((_, i) => [new Error("some error"), null])
                );

                pipeline.mockReturnValue({
                    xadd: xaddPipe,
                    exec: execPipe,
                });

                result = await publisher.publishBatch(events);
            })

            it('should return batch operation result with all successfully published events', () => {
                expect(result).toBeDefined();
                expect(result).toHaveLength(events.length);

                result.forEach((singleResult, i) => {
                    expect(singleResult).toEqual({
                        ok: false,
                        error: new Error("some error"),
                        id: null
                    })
                });
            });

            it('should create a single Redis pipeline with xadd methods and eventually executing the transaction with defined parameters', () => {
                expect(pipeline).toHaveBeenCalledTimes(1);
                expect(xaddPipe).toHaveBeenCalledTimes(events.length);
                expect(execPipe).toHaveBeenCalledTimes(1);

                events.forEach((event, i) => {
                    const [stream, option, actionWord, action, payloadWord, payloadStr, headersWord, headersStr] = xaddPipe.mock.calls[i]

                    expect(stream).toBe(customStream)
                    expect(option).toBe("*")

                    expect(actionWord).toBe("action")
                    expect(action).toBe(event.action)

                    expect(payloadWord).toBe("payload")
                    expect(JSON.parse(payloadStr)).toEqual(event.payload)

                    const expectedHeaders = expect.objectContaining({
                        ...event.headers,
                        group: config.group,
                        timestamp: expect.any(String)
                    })

                    expect(headersWord).toBe("headers")
                    expect(JSON.parse(headersStr)).toEqual(expectedHeaders)
                })

            });

            it('should customize the log message for successfully published event', () => {
                expect(customPublishFailedLog).toHaveBeenCalledTimes(events.length)
                events.forEach((event, i) => {
                    expect(customPublishFailedLog).toHaveBeenCalledWith({
                        stream: customStream,
                        action: event.action,
                        payload: event.payload,
                        headers: expect.objectContaining({
                            ...event.headers,
                            group: config.group,
                            timestamp: expect.any(String)
                        })
                    }, new Error("some error"))
                })
            })

            it('should emit published hook event with defined parameters', () => {
                expect(failedHookCallback).toHaveBeenCalledTimes(events.length)
                events.forEach((event, i) => {
                    expect(failedHookCallback).toHaveBeenCalledWith({
                        stream: customStream,
                        action: event.action,
                        payload: event.payload,
                        headers: expect.objectContaining({
                            ...event.headers,
                            group: config.group,
                            timestamp: expect.any(String)
                        })
                    }, new Error("some error"))
                })
            });
        });
    });
});
