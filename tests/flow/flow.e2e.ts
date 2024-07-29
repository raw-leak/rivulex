import { Redis } from "ioredis"
import { Publisher } from "../../lib/core/publisher"
import { Subscriber } from "../../lib/core/subscriber"
import { Ack, Event } from "../../lib/types"

describe.skip('Full flow e2e test', () => {
    it('Full flow e2e test', async () => {
        const bucket = {}
        const errBucket: Error[] = []
        let eventsCount = 0;

        type Payload = { id: string }
        type Headers = { id: string }

        const redisClient = new Redis({ host: "localhost", port: 6379 })

        const stream1 = "stream-1"
        const stream2 = "stream-2"
        const stream3 = "stream-3"

        const group1 = "receiver-1"
        const group2 = "receiver-2"
        const group3 = "receiver-3"

        const action1 = "action-1"
        const action2 = "action-2"
        const action3 = "action-3"

        const senderGroup = "sender"

        const publisher1 = new Publisher({ group: senderGroup, channel: stream1 }, redisClient, console);
        const publisher2 = new Publisher({ group: senderGroup, channel: stream2 }, redisClient, console);
        const publisher3 = new Publisher({ group: senderGroup, channel: stream2 }, redisClient, console);

        // sent publishers to start publishing
        (async () => {
            await Promise.all([publisher1, publisher2, publisher3].map(async pub => {
                for (let i = 0; i < 1000; i++) {
                    for (const action of [action1, action2, action3]) {
                        try {
                            const payload: Payload = { id: `${i}` }
                            const headers: Headers = { id: `${i}` }

                            const id = await pub.publish(action, payload, headers)
                            bucket[`${pub.channel}:${action}:${id}`] = { id, processed: 0, rejected: 0 };
                            eventsCount++
                        } catch (error) {
                            console.error(error)
                        }
                    }
                }

            }))
        });

        const subscribers: Subscriber[] = []

        async function eventHandler(event: Event<any, any>) {
            const { id, action, channel } = event
            bucket[`${channel}:${action}:${id}`] = 1
            eventsCount--
            await event.ack()
        }

        // prepare all the subscribers
        for (const groupName of [group1, group2, group3]) {
            for (let i = 0; i < 3; i++) {
                const subscriber = new Subscriber({
                    clientId: `${groupName}-${i}`,
                    group: groupName,
                    timeout: 5,
                    count: 100,
                    block: 10,
                    retries: 3
                }, redisClient, console)

                for (const stream of [stream1, stream2, stream3]) {
                    subscriber
                        .stream(stream)
                        .action(action1, eventHandler)
                        .action(action2, eventHandler)
                        .action(action3, eventHandler)
                }

                subscribers.push(subscriber)
            }
        }

        // start all the subscribers
        await Promise.all(subscribers.map(async subscribers => await subscribers.listen()))

        // TODO: wait
        let wait = true
        while (wait) {
            if (eventsCount == 0) {
                wait = false
                // TODO: wait for a second
            }
        }


        // TODO: verify that the result is successful



    })
})