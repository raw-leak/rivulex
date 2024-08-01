import { Formatter } from "../utils/formatter"
import { Logger, NewEvent, RedisClient } from "../types";
import { PublisherConfig, PublishErrorCallback, PublishSuccessCallback } from "../config/publisher.config";

/**
 * Publisher is a class responsible for publishing events to a Redis stream.
 * It handles single and batch event publishing and manages success and failure callbacks.
 */
export class Publisher {
    /**
    * The Redis stream channel to publish events to.
    */
    readonly channel: string;

    /**
    * The consumer group to associate with the events.
    */
    readonly group: string;

    private redis: RedisClient
    private formatter: Formatter;
    private logger: Logger;

    /**
    * Optional callback to be invoked when a message is successfully published.
    * Allows developers to implement custom logging or other processing for successful publishes.
    */
    private onEventPublished: PublishSuccessCallback<any, any>;

    /**
    * Optional callback to be invoked when publishing fails.
    * Allows developers to implement custom error handling or logging for failed publishes.
    */
    private onPublishFailed: PublishErrorCallback<any>;

    private readonly PUBLISHED_STATUS = "PUBLISHED";
    private readonly PUBLISHED_FAILED_STATUS = "PUBLISHED_FAILED";

    /**
    * Creates an instance of Publisher.
    * @param {PublisherConfig} config - Configuration object for the publisher.
    * @param {RedisClient} redis - The Redis client used to interact with the Redis server.
    * @param {Logger} logger - The logger used for logging messages.
    * @throws {Error} Throws an error if required parameters are missing.
    */
    constructor(config: PublisherConfig, redis: RedisClient, logger: Logger) {
        const { channel, group, onEventPublished, onPublishFailed } = config

        if (!redis) throw new Error('Missing required "redis" parameter');
        if (!channel) throw new Error('Missing required "channel" parameter');
        if (!group) throw new Error('Missing required "group" parameter');

        this.channel = channel;
        this.group = group;

        this.redis = redis;
        this.logger = logger;

        this.onEventPublished = onEventPublished || this.defaultOnEventPublished;
        this.onPublishFailed = onPublishFailed || this.defaultOnPublishFailed;

        this.formatter = new Formatter();
    }

    /**
    * Default handler for successful publishing.
    */
    private defaultOnEventPublished<P, H>(id: string, newEvent: NewEvent<P, H>) {
        this.logger.log(JSON.stringify({ type: "event", status: this.PUBLISHED_STATUS, id, stream: newEvent.channel, action: newEvent.action }))
    };

    /**
     * Default handler for failed publishing.
     */
    private defaultOnPublishFailed<P, H>(newEvent: NewEvent<P, H>, error: Error) {
        this.logger.log(JSON.stringify({ type: "event", status: this.PUBLISHED_FAILED_STATUS, stream: newEvent.channel, action: newEvent.action }))
        this.logger.error(JSON.stringify(error))
    };

    /**
     * Publish a single event.
     */
    publish = async <P extends Record<any, any>, H extends Record<any, any>>(action: string, payload: P, headers: H = {} as H): Promise<string> => {
        const newEvent = this.formatter.getNewEvent<P, H>(this.channel, this.group, action, payload, headers)
        const newEventArgs = this.formatter.getSentEvent<P, H>(newEvent)

        try {
            const id = await this.redis.xadd(this.channel, "*", ...newEventArgs) as string;
            this.onEventPublished(id, newEvent);
            return id;
        } catch (error) {
            this.onPublishFailed(newEvent, error as Error)
            throw error;
        }
    };

    /**
    * Publish multiple events in a batch.
    */
    publishBatch = async <P extends Record<any, any>, H extends Record<any, any>>(events: Array<{ action: string, payload: P, headers: H }>): Promise<Array<{ ok: boolean, id?: string, error: Error | null }>> => {
        if (!events || !events.length) {
            return []
        }

        const pipeline = this.redis.pipeline();

        const newEvents = events.map(({ action, payload, headers }) => {
            const newEvent = this.formatter.getNewEvent<P, H>(this.channel, this.group, action, payload, headers)
            const newEventArgs = this.formatter.getSentEvent<P, H>(newEvent)
            pipeline.xadd(this.channel, "*", ...newEventArgs);

            return newEvent
        });

        try {
            const results = await pipeline.exec() as Array<[error: Error, id: string]> | null;

            if (!results) {
                return []
            }

            results.forEach(([error, id], i) => {
                if (error) {
                    this.onPublishFailed(newEvents[i], error);
                } else {
                    this.onEventPublished(id, newEvents[i]);
                }
            });

            return results.map(([error, id]) => ({ id: id as string, error, ok: error ? false : true }));
        } catch (error) {
            newEvents.forEach((newEvent) => this.onPublishFailed(newEvent, error as Error));
            throw error;
        }
    };

    async stop(): Promise<void> {
        await this.redis.quit()
    }
}
