export interface SubscriberConfig {
    /**
    * The unique identifier for the subscriber.
    * If not provided, a default client ID in the format `rivulex:${group}:sub:${Date.now()}` will be used.
    * @OPTIONAL
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
    */
    timeout?: number;

    /**
    * The maximum number of events to fetch with each request to Redis.
    * @OPTIONAL
    */
    count?: number;

    /**
    * The block time (in milliseconds) used in the Redis `XREADGROUP` command.
    * This specifies how long the subscriber will wait for new events before returning if none are available.
    * @OPTIONAL
    */
    block?: number;

    /**
    * The number of times the subscriber will attempt to process an event before moving it to the dead letter stream.
    * This is used to handle events that cannot be processed successfully after multiple retries.
    * @OPTIONAL
    */
    retries?: number;
}