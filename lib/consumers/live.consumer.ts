import { Formatter } from "../utils/formatter";
import { Processor } from "../processor/processor";
import { ChannelsHandlers, Logger, RawEvent, RedisClient } from "../types";

type XReadGroupResponse = Array<[string, Array<RawEvent> | undefined]> | undefined;

/**
* Configuration object for the `LiveConsumer` class
* @interface
*/
export interface LiveConsumerConfig {
    /** @type {SubscriberConfig['clientId']} */
    clientId: string;

    /** @type {SubscriberConfig['group']} */
    group: string;

    /** @type {SubscriberConfig['fetchBatchSize']} */
    fetchBatchSize: number;

    /** @type {SubscriberConfig['blockTime']} */
    blockTime: number;

    /**
    * A list of streams consuming from.
    * @type {string[]}
    */
    streams: Array<string>;
}

/**
* A class for consuming live events from Redis streams.
* 
* The `LiveConsumer` class listens to the specified Redis streams and processes events 
* according to the configuration provided. It supports blocking reads, consumer groups, 
* and automatic retries.
* 
* @class
* 
* @param {LiveConsumerConfig} config - Configuration object containing settings for the consumer.
* @param {RedisClient} redis - The Redis client instance used for interacting with Redis streams.
* @param {Processor} processor - TODO
* @param {Logger} logger - The logging instance used for outputting information, warnings, and errors.
* @throws {Error} Throws an error if the Redis client is missing or invalid, if the channels array is empty or not provided, or if the group parameter is missing.
* 
*/
export class LiveConsumer {
    private enabled = false;

    private clientId: string;
    private group: string;
    private blockTime: number;
    private fetchBatchSize: number;
    private streams: Array<string>;

    private logger: Logger;
    private redis: RedisClient;
    private processor: Processor;
    private formatter: Formatter;

    constructor(config: LiveConsumerConfig, redis: RedisClient, processor: Processor, logger: Logger) {
        const { clientId, streams, group, fetchBatchSize, blockTime } = config;

        if (!redis) throw new Error('Missing required "redis" parameter');
        if (!streams || !streams.length) throw new Error('Missing required "streams" parameter');
        if (!group) throw new Error('Missing required "group" parameter');

        this.clientId = clientId;
        this.streams = streams;
        this.group = group;

        this.blockTime = blockTime;
        this.fetchBatchSize = fetchBatchSize;

        this.redis = redis;
        this.logger = logger;
        this.processor = processor
        this.formatter = new Formatter()
    }

    /**
     * Read live streaming messages
     * @param {Function} channelsHandlers (REQUIRED) Callback to process incoming messages
     */
    private processLiveMessages = async (channelsHandlers: ChannelsHandlers) => {
        const entries = await this.redis.xreadgroup(
            'GROUP',
            this.group,
            this.clientId,
            'COUNT',
            this.fetchBatchSize,
            'BLOCK',
            this.blockTime,
            'STREAMS',
            ...this.streams,
            ...this.streams.map(() => '>'),
        ) as XReadGroupResponse;

        if (entries) {
            await Promise.all(entries.map(async ([streamName, rawEvents]) => {
                if (rawEvents) {
                    const channelHandlers = channelsHandlers.get(streamName)
                    await this.processor.process(streamName, this.formatter.parseRawEvents(rawEvents, streamName), channelHandlers.getHandlers())
                }
            }))
        }
    };

    /**
    * Start consuming events for defined streams with provided handlers
    * @param {Function} channelsHandlers (REQUIRED) Handlers for incoming events.
    */
    consume = <T>(channelsHandlers: ChannelsHandlers) => {
        if (!this.enabled) {
            this.enabled = true;

            (async () => {
                while (this.enabled) {
                    try {
                        await this.processLiveMessages(channelsHandlers);
                    } catch (error) {
                        this.logger.error(`failed to process live messages with error: ${error}`)
                    }
                }
            })()
        }
    };

    /**
    * Stop consuming live events
    */
    async stop() {
        this.enabled = false;
    }
}
