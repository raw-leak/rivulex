import { Rivulex } from "../lib";

(async () => {
    const subscriber = Rivulex.subscriber({ fetchBatchSize: 1_000, processTimeout: 3_000, processConcurrency: 1_000, group: "users", ackTimeout: 60_000, blockTime: 60_000 })

    const purchases = subscriber.stream("purchases")
    purchases.action("created", async (event: Event<CreatedPayload, CustomHeaders>) => {
        // process
        await event.ack()
    })
    purchases.action("canceled", async (event: Event<CanceledPayload, CustomHeaders>) => {
        // process
        await event.ack()
    })


    const products = subscriber.stream("products")
    products.action("added", async (event: Event<AddedPayload, CustomHeaders>) => {
        // process
        await event.ack()
    })
    products.action("removed", async (event: Event<RemovedPayload, CustomHeaders>) => {
        // process
        await event.ack()
    })


    await subscriber.listen()
})()