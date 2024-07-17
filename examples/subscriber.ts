import { Rivulex } from "../lib";

(async () => {
    const subscriber = Rivulex.subscriber({})

    const purchases = subscriber.stream("purchases")
    purchases.action("created", (event, done) => {
        // process
        done()

    })
    purchases.action("canceled", (event, done) => {
        // process
        done()
    })


    const products = subscriber.stream("products")
    products.action("added", (event, done) => {
        // process
        done()
    })
    products.action("removed", (event, done) => {
        // process
        done()
    })


    await subscriber.listen()


})()