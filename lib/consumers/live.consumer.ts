import { Formatter } from "../formatter/formatter";
import { Processor } from "../processor/processor";
import { ChannelsHandlers, Logger, RawEvent, RedisClient } from "../types";

/**
* Configuration object for the `LiveConsumer` class.
* @interface
*/
export interface LiveConsumerConfig {
    clientId: string;
    channels: Array<string>;
    group: string;
    retries: number;
    count: number;
    block: number;
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
* @param {Logger} logger - The logging instance used for outputting information, warnings, and errors.
* @throws {Error} Throws an error if the Redis client is missing or invalid, if the channels array is empty or not provided, or if the group parameter is missing.
* 
*/
export class LiveConsumer {
    private enabled = false;
    private processor: Processor;
    private clientId: string;
    private channels: Array<string>;
    private group: string;
    private count: number;
    private block: number;
    private redis: RedisClient;
    private logger: Logger;
    private formatter: Formatter;

    constructor(config: LiveConsumerConfig, redis: RedisClient, logger: Logger) {
        const { clientId, channels, group, count, block, retries } = config;

        if (!redis) throw new Error('Missing required "redis" parameter');
        if (!channels || !channels.length) throw new Error('Missing required "channel" parameter');
        if (!group) throw new Error('Missing required "group" parameter');

        this.clientId = clientId;
        this.channels = channels;
        this.logger = logger;
        this.redis = redis;
        this.group = group;
        this.block = block;
        this.count = count;

        this.processor = new Processor({ retries, group }, this.redis, this.logger)
        this.formatter = new Formatter()
    }


    /**
     * Read live streaming messages.
     * @param {Function} channelsHandlers (REQUIRED) Callback to process incoming messages.
     */
    private processLiveMessages = async <T>(channelsHandlers: ChannelsHandlers) => {
        const entries = await this.redis.xreadgroup(
            'GROUP',
            this.group,
            this.clientId,
            'COUNT',
            this.count,
            'BLOCK',
            this.block,
            'STREAMS',
            ...this.channels,
            ...this.channels.map(() => '>'),
        ) as Array<[string, Array<RawEvent> | undefined]> | undefined;

        if (entries) {
            for (const entry of entries) {
                const [streamName, rawEvents] = entry
                if (rawEvents) {
                    const channelHandlers = channelsHandlers.get(streamName)
                    await this.processor.process<T>(streamName, this.formatter.parseRawEvents(rawEvents), channelHandlers.getHandlers())
                }
            }
        }
    };

    /**
    * Start consuming events for defined streams with provided handlers
    * @param {Function} channelsHandlers (REQUIRED) Handlers for incoming events.
    */
    consume = <T>(streams: ChannelsHandlers) => {
        if (!this.enabled) {
            this.enabled = true;

            (async () => {
                while (this.enabled) {
                    try {
                        await this.processLiveMessages(streams);
                    } catch (error) {
                        this.logger.error(`failed to process live messages with error: ${error}`)
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
