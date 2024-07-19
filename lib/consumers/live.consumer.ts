import { Formatter } from "../formatter/formatter";
import { Processor } from "../processor/processor";
import { ChannelsHandlers, RawEvent, RedisClient } from "../types";

export interface LiveConsumerConfig {
    clientId: string;
    channels: Array<string>;
    group: string;
    retries: number;
    count: number;
    block: number;
}

export class LiveConsumer {
    private enabled = false;
    private processor: Processor;
    private clientId: string;
    private channels: Array<string>;
    private group: string;
    private count: number;
    private block: number;
    private redis: RedisClient;
    private logger: Console;
    private formatter: Formatter;

    constructor(config: LiveConsumerConfig, redis: RedisClient, logger: Console) {
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
     * Subscribe to streaming messages
     * @param {Function} streams (REQUIRED) Callback for incoming messages.
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
     * Terminate live consumer
     */
    async stop() {
        this.enabled = false;
    }
}
