import { Rivulex } from "../lib";

(async () => {
    const publisher = Rivulex.publisher({ defaultStream: "default_stream", group: "group", redis: {} })

    // sending to a default stream
    const id1 = await publisher.publish("user_created", { id: "123", email: "user@email.com" }, { traceId: "1234" })

    // sending to a specific stream
    const id2 = await publisher.publish("specific_stream", "user_created", { id: "123", email: "user@email.com" }, { traceId: "1234" })

    const res = await publisher.publishBatch([
        // sending to a default stream
        { stream: "specific_stream", action: "user_created", payload: { id: "1", email: "user1@email.com" }, headers: { traceId: "111" } },

        // sending to a default stream
        { action: "user_created", payload: { id: "2", email: "user2@email.com" }, headers: { traceId: "222" } },

        // sending to a default stream
        { action: "user_created", payload: { id: "3", email: "user3@email.com" }, headers: { traceId: "333" } },
    ])

})()