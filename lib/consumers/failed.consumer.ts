import { Backoff } from "../utils/backoff";
import { Formatter } from "../formatter/formatter";
import { Processor } from "../processor/processor";
import { PendingEvent, RawEvent, RedisClient, Event, ChannelsHandlers, Logger } from "../types";

/**
* Configuration object for the `FailedConsumer` class.
* @interface
*/
export interface FailedConsumerConfig {
    clientId: string;
    channels: Array<string>;
    group: string;
    count: number;
    timeout: number;
    retries: number;
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
* @param {Logger} logger - The logging instance used for outputting information, warnings, and errors.
* @throws {Error} Throws an error if the Redis client is missing or invalid, if the channels array is empty or not provided, or if the group parameter is missing.
* 
*/
export class FailedConsumer {
    private backoff: Backoff;
    private redis: RedisClient;
    private logger: Logger;
    private enabled = false;
    private clientId: string;
    private channels: Array<string>;
    private group: string;
    private timeout: number;
    private count: number;
    private retries: number;
    private processor: Processor;
    private formatter: Formatter;

    constructor(config: FailedConsumerConfig, redis: RedisClient, logger: Logger) {
        const { clientId, channels, group, count, timeout, retries } = config;

        if (!redis) throw new Error('Missing required "redis" parameter');
        if (!channels || !channels.length) throw new Error('Missing required "channel" parameter');
        if (!group) throw new Error('Missing required "group" parameter');
        if (!clientId) throw new Error('Missing required "clientId" parameter');

        this.clientId = clientId;
        this.channels = channels;
        this.group = group;
        this.redis = redis;
        this.logger = logger;

        this.timeout = timeout;
        this.count = count;
        this.retries = retries;

        this.backoff = new Backoff({ max: 30 });
        this.processor = new Processor({ retries: this.retries, group }, this.redis, this.logger);
        this.formatter = new Formatter()

    }

    private async fetchFailedEvents(streamName: string): Promise<Array<Event> | undefined> {
        const pendingEventsInfo = await this.redis.xpending(
            streamName,
            this.group,
            'IDLE', // read only messages that have not been confirmed in [timeout] time
            this.timeout,
            '-', // range starts with [init]
            '+', // range finishes with [end]
            this.count, // quantity of messages read per request from PEL
        ) as Array<PendingEvent>;

        if (!pendingEventsInfo || !pendingEventsInfo.length) {
            return
        }

        const attempts: Record<string, number> = {}
        const ids = []

        for (const [id, , , attempt] of pendingEventsInfo) {
            ids.push(id)
            attempts[id] = attempt
        }

        const failedEvents = await this.redis.xclaim(streamName, this.group, this.clientId, this.timeout, ...ids) as Array<RawEvent>;

        return failedEvents.map((rawEvent) => {
            rawEvent[1][6] = "attempt";
            rawEvent[1][7] = attempts[rawEvent[0]];
            return this.formatter.parseRawEvent(rawEvent)
        })
    }

    private processFailedEvents = async (channelsHandlers: ChannelsHandlers): Promise<number> => {
        let failedEventsCount = 0;

        for (const streamName of this.channels) {
            const failedEvents = await this.fetchFailedEvents(streamName)

            if (failedEvents && failedEvents.length) {
                failedEventsCount += failedEvents.length
                const stream = channelsHandlers.get(streamName);
                await this.processor.process(streamName, failedEvents, stream.getHandlers())
            }
        }

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
                        await this.backoff.wait()
                    }
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
