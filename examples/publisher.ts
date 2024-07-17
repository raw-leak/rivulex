import { Rivulex } from "../lib";

(async () => {
    const publisher = Rivulex.publisher({})

    const id = await publisher.publish("user_created", { id: "123", email: "user@email.com" }, { traceId: "1234" })

    const res = await publisher.publishBatch([
        { action: "user_created", payload: { id: "1", email: "user1@email.com" }, headers: { traceId: "111" } },
        { action: "user_created", payload: { id: "2", email: "user2@email.com" }, headers: { traceId: "222" } },
        { action: "user_created", payload: { id: "3", email: "user3@email.com" }, headers: { traceId: "333" } },
    ])

})()