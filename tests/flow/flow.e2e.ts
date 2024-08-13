import { Redis } from "ioredis"

import { Publisher } from "../../lib/core/publisher"
import { Subscriber } from "../../lib/core/subscriber"
import { Event } from "../../lib/types"

import { SilentLogger, sleep } from "../utils"

interface EventInfo {
    group: string
    action: string
    entityId: string
    failedTimes: number
    timeoutTimes: number
    processedTimes: number
}

describe.skip('Full flow e2e test', () => {
    it('Full flow e2e test', async () => {
        const bucket: Record<string, EventInfo> = {}

        type Payload = { id: string }
        type Headers = { id: string }

        const redisClient = new Redis({ host: "localhost", port: 6379 })

        await redisClient.flushall()
        const logger = new SilentLogger()

        const retries = 2;
        const timeout = 3_000

        const stream1 = "stream-1"
        const stream2 = "stream-2"
        const stream3 = "stream-3"

        // const streams = [stream1, stream2, stream3]
        const streams = [stream1]

        const group1 = "group-1"
        const group2 = "group-2"
        const group3 = "group-3"

        // const groups = [group1, group2, group3]
        const groups = [group1]
        const subscriberCount = 1

        const rejectedAction = "rejected" // always thrown error
        const timeoutAction = "timeout" // always timeout
        const randomOkAction = "random-ok" // eventually will be processed
        const okAction = "ok" // processed in first action

        // const actions = [rejectedAction, timeoutAction, randomOkAction, okAction]
        const actions = [rejectedAction, okAction]

        const senderGroup = "sender"

        const publisher1 = new Publisher({ group: senderGroup, defaultStream: stream1 }, redisClient.duplicate(), logger);
        const publisher2 = new Publisher({ group: senderGroup, defaultStream: stream2 }, redisClient.duplicate(), logger);
        const publisher3 = new Publisher({ group: senderGroup, defaultStream: stream2 }, redisClient.duplicate(), logger);
        const eventCount = 10

        const publishers = [publisher1]

        // sent publishers to start publishing
        const startProducing = (async () => {
            await Promise.all(publishers.map(async pub => {
                for (let i = 0; i < eventCount; i++) {
                    for (const action of actions) {
                        try {
                            const payload: Payload = { id: `${i}` };
                            const headers: Headers = { id: `${i}` };

                            const id = await pub.publish(action, payload, headers);
                            for (const group of groups) {
                                const entityId = `${pub.defaultStream}:${group}:${action}:${id}`;
                                bucket[entityId] = {
                                    failedTimes: 0,
                                    timeoutTimes: 0,
                                    processedTimes: 0,
                                    action,
                                    group,
                                    entityId
                                }
                            }
                        } catch (error) {
                            console.error(error)
                        }
                    }
                }

            }))
        });

        const subscribers: Subscriber[] = []

        function eventHandler(group: string) {
            return async function (event: Event<any, any>): Promise<void> {
                const { id, action, stream, attempt, ack } = event
                const entity = bucket[`${stream}:${group}:${action}:${id}`];



                if (action == rejectedAction) {
                    entity.failedTimes = 1 + entity.failedTimes

                    throw new Error("timeout error");
                }
                else if (action == timeoutAction) {
                    entity.timeoutTimes = 1 + entity.timeoutTimes
                    // do nothing as it is a timeout error
                }
                else if (action == okAction) {
                    await ack();
                    entity.processedTimes = 1 + entity.processedTimes
                }
                else if (action == randomOkAction) {
                    if (attempt >= retries) {
                        await ack();
                        entity.processedTimes = 1 + entity.processedTimes
                        return;
                    }
                    else if (attempt == 0) {
                        entity.failedTimes = 1 + entity.failedTimes
                        throw new Error("timeout error")
                    }
                    else {
                        entity.timeoutTimes = 1 + entity.timeoutTimes
                        // do nothing as it is a timeout error
                    }
                }

            }
        }

        // prepare all the subscribers
        for (const groupName of groups) {
            for (let i = 0; i < subscriberCount; i++) {
                const subscriber = new Subscriber({
                    clientId: `${groupName}-${i}`,
                    group: groupName,
                    fetchBatchSize: 1_000,
                    blockTime: 100,
                    ackTimeout: timeout,
                    retries
                }, redisClient.duplicate(), logger)

                for (const stream of streams) {
                    subscriber
                        .stream(stream)
                        .action(rejectedAction, eventHandler(groupName))
                        .action(okAction, eventHandler(groupName))
                    // .action(timeoutAction, eventHandler(groupName))
                    // .action(randomOkAction, eventHandler(groupName))
                }

                subscribers.push(subscriber)
            }
        }

        // start all the subscribers
        await Promise.all(subscribers.map(async subscribers => await subscribers.listen()))

        await startProducing()

        // TODO: wait
        // let wait = true
        // while (wait) {
        //     if (eventsCount == 0) {
        //         wait = false
        //         // TODO: wait for a second
        //     }
        // }

        await sleep(1.5 * 60_000)

        for (const eventId in bucket) {
            console.log("event", bucket[eventId])
        }

        for (const eventId in bucket) {
            const { processedTimes, failedTimes, timeoutTimes, action } = bucket[eventId]
            if (action == timeoutAction) {
                expect(processedTimes).toEqual(0)
                expect(timeoutTimes).toEqual(retries)
            }
            else if (action == rejectedAction) {
                expect(processedTimes).toEqual(0)
                expect(failedTimes).toEqual(retries)
            }
            else if (action == randomOkAction) {
                expect(processedTimes).toEqual(1)
                expect(failedTimes).toEqual(1)
                expect(timeoutTimes).toEqual(1)
            }
            else if (action == okAction) {
                expect(processedTimes).toEqual(1)
                expect(failedTimes).toEqual(0)
                expect(timeoutTimes).toEqual(0)
            }
        }

    }, 10 * 60_000)
})