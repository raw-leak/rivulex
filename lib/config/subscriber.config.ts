export interface SubscriberConfig {
    /**
    * The unique identifier for the subscriber.
    * @OPTIONAL
    * 
    * If not provided, a default client ID in the format `rivulex:${group}:sub:${Date.now()}` will be used.
    * @default `rivulex:${group}:sub:${Date.now()}`
    * 
    */
    clientId?: string;

    /**
     * The consumer group to associate with the events.
     * @REQUIRED
     */
    group: string;

    /**
    * The maximum time (in milliseconds) that the subscriber is allowed to process an event.
    * If the event is not processed within this time, it will be retried based on the `retries` setting.
    * @OPTIONAL
    * @default 30_000 ms (30 s)
    * @minimum 1000 ms (1 s)
    */
    ackTimeout?: number;

    /**
    * The maximum time (in milliseconds) allowed for the handler to process each event.
    * This timeout applies to the execution of event handlers. If an event handler does not complete within this time,
    * it will be considered failed and will be handled according to the system's failure handling logic.
    * 
    * Events are processed in batches. `processTimeout` ensures that long-running operations do not block the processing
    * of subsequent batches. If an event handler takes longer than `processTimeout`, the processing promise will continue
    * running and may still resolve successfully. However, if the event is acknowledged within the `ackTimeout`, it will
    * be considered successfully processed and will not be retried.
    * @OPTIONAL
    * @default 200 ms
    * @minimum 20 ms
    */
    processTimeout?: number;

    /**
    * The maximum number of events to fetch from Redis in each request.
    * @OPTIONAL
    * @default 100
    * @minimum 1
    */
    fetchBatchSize?: number;

    /**
    * The block time (in milliseconds) used in the Redis `XREADGROUP` command.
    * This specifies how long the subscriber will wait for new events before returning if none are available.
    * 
    * TL;DR
    * 
    * This property defines how long the subscriber will wait for new events before checking the Redis stream again. 
    * The `blockTime` option is critical for efficiently managing event retrieval without excessive CPU usage.
    * 
    * The blocking period in milliseconds used for `XREADGROUP` in Redis.
    * 
    * This property defines how long the subscriber will wait for new events 
    * before checking the Redis stream again. The `block` option is critical 
    * for efficiently managing event retrieval without excessive CPU usage. 
    * 
    * When using the `BLOCK` option with `XREADGROUP`, Redis will block the 
    * connection for the duration specified by the `block` property. During 
    * this time, the subscriber waits for new entries to be added to the stream. 
    * If no new entries are added within this period, the subscriber will 
    * continue to block and wait for new data. This prevents constant polling 
    * and reduces unnecessary load on the Redis server and the application.
    * 
    * **Key Points:**
    * 
    * - **Blocking Behavior**: If `BLOCK` is set, the command will wait for the 
    *   specified duration for new entries. If no new entries are available, 
    *   the connection remains blocked until new data arrives or the timeout 
    *   expires.
    * 
    * - **Multiple Streams**: The `XREADGROUP` command with `BLOCK` can read from 
    *   multiple streams simultaneously, allowing the subscriber to handle 
    *   data from various sources efficiently.
    * 
    * **Default Value**: The default block period is set to 30 seconds 
    *   (30 * 60 * 1000 milliseconds), but it can be customized as needed.
    * 
    * @OPTIONAL
    */
    blockTime?: number;

    /**
    * The number of times the subscriber will attempt to process an event before moving it to the dead letter stream.
    * This is used to handle events that cannot be processed successfully after multiple retries.
    * @OPTIONAL
    * @default 3
    * @minimum 1
    */
    retries?: number;
}