import { Headers, Logger, RedisClient } from "../types";
import { Formatter } from "../formatter/formatter"
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
    private onMessagePublished: PublishSuccessCallback<any, any>;

    /**
    * Optional callback to be invoked when publishing fails.
    * Allows developers to implement custom error handling or logging for failed publishes.
    */
    private onPublishFailed: PublishErrorCallback<any>;

    /**
    * Creates an instance of Publisher.
    * @param {PublisherConfig} config - Configuration object for the publisher.
    * @param {RedisClient} redis - The Redis client used to interact with the Redis server.
    * @param {Logger} logger - The logger used for logging messages.
    * @throws {Error} Throws an error if required parameters are missing.
    */
    constructor(config: PublisherConfig, redis: RedisClient, logger: Logger) {
        const { channel, group, onMessagePublished, onPublishFailed } = config

        if (!redis) throw new Error('Missing required "redis" parameter');
        if (!channel) throw new Error('Missing required "channel" parameter');
        if (!group) throw new Error('Missing required "group" parameter');

        this.channel = channel;
        this.group = group;

        this.redis = redis
        this.logger = logger

        this.onMessagePublished = onMessagePublished || this.defaultOnMessagePublished;
        this.onPublishFailed = onPublishFailed || this.defaultOnPublishFailed;

        this.formatter = new Formatter()
    }

    /**
      * Default handler for successful publishing.
      */
    private defaultOnMessagePublished: <P extends Record<any, any>, H extends Record<any, any>>(data: { id: string, headers: Headers<H>, action: string, payload: P, group: string }) => void = (data) => {
        this.logger.log(`PUBLISHED id: ${data.id} action: ${data.action} group: ${data.group}`);
    };

    /**
     * Default handler for failed publishing.
     */
    private defaultOnPublishFailed: <P extends Record<any, any>, H extends Record<any, any>>(data: { headers: Headers<H>, action: string, error: Error }) => void = (data) => {
        this.logger.error(`PUBLISH_FAILED action: ${data.action} group: ${data.headers.group} error: ${data.error.message} stack: ${data.error.stack}`);
    };

    /**
     * Publish a single event.
     */
    publish = async <P extends Record<any, any>, H extends Record<any, any>>(action: string, payload: P, headers: H = {} as H): Promise<string> => {
        try {
            const id = await this.redis.xadd(this.channel, "*", ...this.formatter.formatEventForSend<P, H>(action, payload, headers, this.group)) as string;
            this.onMessagePublished({ id, headers, action, payload, group: this.group });
            return id;
        } catch (error) {
            this.onPublishFailed({ headers, action, error: error as Error });
            throw error;
        }
    };

    /**
    * Publish multiple events in a batch.
    */
    publishBatch = async <P extends Record<any, any>, H extends Record<any, any>>(messages: Array<{ action: string, payload: P, headers: H }>): Promise<Array<{ ok: boolean, id?: string, error: Error | null }>> => {
        if (!messages || !messages.length) {
            return []
        }

        const pipeline = this.redis.pipeline();

        messages.forEach(({ action, payload, headers }) => {
            pipeline.xadd(this.channel, "*", ...this.formatter.formatEventForSend<P, H>(action, payload, headers, this.group));
        });

        try {
            const results = await pipeline.exec() as Array<[error: Error, id: string]> | null;

            if (!results) {
                return []
            }

            results.forEach(([error, id], index) => {
                if (error) {
                    this.onPublishFailed({ headers: messages[index].headers, action: messages[index].action, error });
                } else {
                    this.onMessagePublished({ id, headers: messages[index].headers, action: messages[index].action, payload: messages[index].payload, group: this.group });
                }
            });

            return results.map(([error, id]) => ({ id: id as string, error, ok: error ? false : true }));
        } catch (error) {
            messages.forEach(({ headers, action }) => {
                this.onPublishFailed({ headers, action, error: error as Error });
            });

            throw error;
        }
    };

    async stop(): Promise<void> {
        await this.redis.quit()
    }
}
