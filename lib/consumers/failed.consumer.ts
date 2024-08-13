import { Backoff } from "../utils/backoff";
import { Formatter } from "../utils/formatter";
import { Processor } from "../processor/processor";
import { RawEvent, RedisClient, BaseEvent, ChannelsHandlers, Logger, XPendingResponse } from "../types";

/**
* Configuration object for the `FailedConsumer` class.
* @interface
*/
export interface FailedConsumerConfig {

    /** @type {SubscriberConfig['clientId']} */
    clientId: string;

    /** @type {SubscriberConfig['group']} */
    group: string;

    /** @type {SubscriberConfig['fetchBatchSize']} */
    fetchBatchSize: number;

    /** @type {SubscriberConfig['ackTimeout']} */
    ackTimeout: number;

    /**
    * A list of streams consuming from.
    * @type {string[]}
    */
    streams: Array<string>;
}

/**
* A class for consuming failed events from Redis streams.
* 
* The `FailedConsumer` class listens to the specified Redis streams and processes events 
* according to the configuration provided.
* 
* @class
* 
* @param {FailedConsumerConfig} config - Configuration object containing settings for the consumer.
* @param {RedisClient} redis - The Redis client instance used for interacting with Redis streams.
* @param {Processor} processor - TODO
* @param {Logger} logger - The logging instance used for outputting information, warnings, and errors.
* @throws {Error} Throws an error if the Redis client is missing or invalid, if the channels array is empty or not provided, or if the group parameter is missing.
* 
*/
export class FailedConsumer {
    private enabled = false;

    private clientId: string;
    private group: string;
    private ackTimeout: number;
    private fetchBatchSize: number;
    private streams: Array<string>;

    private logger: Logger;
    private backoff: Backoff;
    private redis: RedisClient;
    private processor: Processor;
    private formatter: Formatter;

    constructor(config: FailedConsumerConfig, redis: RedisClient, processor: Processor, logger: Logger) {
        const { clientId, streams, group, fetchBatchSize, ackTimeout } = config;

        if (!redis) throw new Error('Missing required "redis" parameter');
        if (!streams || !streams.length) throw new Error('Missing required "streams" parameter');
        if (!group) throw new Error('Missing required "group" parameter');
        if (!clientId) throw new Error('Missing required "clientId" parameter');

        this.clientId = clientId;
        this.streams = streams;
        this.group = group;

        this.ackTimeout = ackTimeout;
        this.fetchBatchSize = fetchBatchSize;

        this.redis = redis;
        this.logger = logger;
        this.processor = processor
        this.formatter = new Formatter()
        this.backoff = new Backoff({ minInterval: 1_000, maxInterval: this.ackTimeout });

    }

    private async fetchFailedEvents(streamName: string): Promise<Array<BaseEvent> | undefined> {
        const pendingEventsInfo = await this.redis.xpending(
            streamName,
            this.group,
            'IDLE', // read only messages that have not been confirmed in [timeout] time
            this.ackTimeout,
            '-', // range starts with [init]
            '+', // range finishes with [end]
            this.fetchBatchSize, // quantity of messages read per request from PEL
        ) as XPendingResponse;

        if (!pendingEventsInfo || !pendingEventsInfo.length) {
            return
        }

        const attempts: Record<string, number> = {}
        const ids = []

        for (const [id, , , attempt] of pendingEventsInfo) {
            ids.push(id)
            attempts[id] = attempt
        }

        const failedEvents = await this.redis.xclaim(streamName, this.group, this.clientId, this.ackTimeout, ...ids) as Array<RawEvent>;

        return failedEvents.map((rawEvent) => {
            rawEvent[1][6] = "attempt";
            rawEvent[1][7] = attempts[rawEvent[0]];
            return this.formatter.parseRawEvent(rawEvent, streamName)
        })
    }

    private processFailedEvents = async (channelsHandlers: ChannelsHandlers): Promise<number> => {
        let failedEventsCount = 0;

        await Promise.all(this.streams.map(async streamName => {
            const failedEvents = await this.fetchFailedEvents(streamName)
            if (failedEvents && failedEvents.length) {
                failedEventsCount += failedEvents.length
                const stream = channelsHandlers.get(streamName);
                await this.processor.process(streamName, failedEvents, stream.getHandlers())
            }
        }))

        return failedEventsCount
    }

    /**
    * Start consuming events for defined streams with provided handlers
    * @param {Function} channelsHandlers (REQUIRED) Handlers for incoming events.
    */
    consume = <T>(channelsHandlers: ChannelsHandlers) => {
        if (!this.enabled) {
            this.enabled = true;

            (async () => {
                while (this.enabled) {
                    const count = await this.processFailedEvents(channelsHandlers)

                    if (count > 0) {
                        this.backoff.reset()
                    } else {
                        this.backoff.increase()
                    }

                    await this.backoff.wait()
                }
            })()
        }
    };


    /**
     * Stop consuming events
     */
    async stop() {
        this.enabled = false;
    }
}
