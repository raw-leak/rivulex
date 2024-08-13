import EventEmitter from 'node:events';
import { Trimmer } from "./trimmer";
import { Formatter } from "../utils/formatter"
import { HookType, Logger, NewEvent, RedisClient } from "../types";
import { PUBLISHED_HOOK, FAILED_HOOK } from '../constants';
import { PublisherConfig, PublishFailedLog, PublishSuccessLog, PublishedHookPayload, FailedHookPayload } from "../config/publisher.config";

/**
 * Publisher is a class responsible for publishing events to a Redis stream.
 * It handles single and batch event publishing and manages success and failure callbacks.
 */
export class Publisher {
    /**
    * The default Redis stream to publish events to.
    */
    readonly defaultStream: string;

    /**
    * The consumer group to associate with the events.
    */
    readonly group: string;

    /**
    * Optional callback to be invoked when a message is successfully published.
    * Allows developers to implement custom logging or other processing for successful publishes.
    */
    private publishSucceededLog: PublishSuccessLog<any, any>;

    /**
    * Optional callback to be invoked when publishing fails.
    * Allows developers to implement custom error handling or logging for failed publishes.
    */
    private publishFailedLog: PublishFailedLog<any, any>;

    private redis: RedisClient
    private formatter: Formatter;
    private eventEmitter: EventEmitter;
    private logger: Logger;
    private trimmer: Trimmer | null;

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
        const { defaultStream, group, customPublishFailedLog, customPublishSucceededLog } = config

        if (!redis) throw new Error('Missing required "redis" parameter');
        if (!defaultStream) throw new Error('Missing required "defaultStream" parameter');
        if (!group) throw new Error('Missing required "group" parameter');

        this.defaultStream = defaultStream;
        this.group = group;

        this.redis = redis;
        this.logger = logger;

        this.publishSucceededLog = customPublishSucceededLog || this.defaultPublishSucceededLog;
        this.publishFailedLog = customPublishFailedLog || this.defaultPublishFailedLog;

        this.formatter = new Formatter();
        this.eventEmitter = new EventEmitter();

        if (config.trimmer) {
            this.trimmer = new Trimmer(config.trimmer, this.redis, this.logger)
        }
    }

    private defaultPublishSucceededLog<P, H>(id: string, newEvent: NewEvent<P, H>): string {
        return JSON.stringify({ type: "event", status: this.PUBLISHED_STATUS, id, stream: newEvent.stream, action: newEvent.action, timestamp: Date.now() })
    };

    private defaultPublishFailedLog<P, H>(newEvent: NewEvent<P, H>): string {
        return JSON.stringify({ type: "event", status: this.PUBLISHED_FAILED_STATUS, stream: newEvent.stream, action: newEvent.action, timestamp: Date.now() })
    };

    /**
    * Handler for successful publishing.
    */
    private onEventPublishSucceeded<P, H>(id: string, newEvent: NewEvent<P, H>) {
        this.logger.log(this.publishSucceededLog(id, newEvent))
        this.eventEmitter.emit(PUBLISHED_HOOK, id, newEvent);
    };

    /**
    * Handler for failed publishing.
    */
    private onEventPublishFailed<P, H>(newEvent: NewEvent<P, H>, error: Error) {
        this.logger.log(this.publishFailedLog(newEvent, error))
        this.logger.error(JSON.stringify(error))
        this.eventEmitter.emit(FAILED_HOOK, newEvent, error);
    };

    /**
    * Publish a single event to the default stream.
    * @param action - The action type of the event.
    * @param payload - The payload of the event.
    * @param headers - Optional headers for the event.
    */
    publish<P extends Record<any, any>, H extends Record<any, any>>(action: string, payload: P, headers?: H): Promise<string>;

    /**
     * Publish a single event to a specific stream.
     * @param stream - The stream to publish the event to.
     * @param action - The action type of the event.
     * @param payload - The payload of the event.
     * @param headers - Optional headers for the event.
     */
    publish<P extends Record<any, any>, H extends Record<any, any>>(stream: string, action: string, payload: P, headers?: H): Promise<string>;

    public async publish<P extends Record<any, any>, H extends Record<any, any>>(streamOrAction: string, actionOrPayload: string | P, payloadOrHeaders?: P | H, nothingOrHeaders?: H): Promise<string> {
        let stream: string;
        let action: string;
        let payload: P;
        let headers: H;

        if (typeof actionOrPayload === 'string') {
            // Overload: publish(stream, action, payload, headers)
            stream = streamOrAction;
            action = actionOrPayload;
            payload = payloadOrHeaders as P;
            headers = nothingOrHeaders || {} as H;
        } else {
            // Overload: publish(action, payload, headers)
            stream = this.defaultStream;
            action = streamOrAction;
            payload = actionOrPayload as P;
            headers = payloadOrHeaders || {} as H;
        }

        const newEvent = this.formatter.getNewEvent<P, H>(stream, this.group, action, payload, headers);
        const newEventArgs = this.formatter.getSentEvent<P, H>(newEvent);

        try {
            const id = await this.redis.xadd(stream, "*", ...newEventArgs) as string;
            this.onEventPublishSucceeded(id, newEvent);
            return id;
        } catch (error) {
            this.onEventPublishFailed(newEvent, error as Error);
            throw error;
        }
    }

    /**
    * Publish multiple events in a batch.
    */
    publishBatch = async <P extends Record<any, any>, H extends Record<any, any>>(events: Array<{ stream?: string, action: string, payload: P, headers: H }>): Promise<Array<{ ok: boolean, id?: string, error: Error | null }>> => {
        if (!events || !events.length) {
            return []
        }

        const pipeline = this.redis.pipeline();

        const newEvents = events.map(({ stream, action, payload, headers }) => {
            const newEvent = this.formatter.getNewEvent<P, H>(stream || this.defaultStream, this.group, action, payload, headers)
            const newEventArgs = this.formatter.getSentEvent<P, H>(newEvent)
            pipeline.xadd(stream || this.defaultStream, "*", ...newEventArgs);

            return newEvent
        });

        try {
            const results = await pipeline.exec() as Array<[error: Error, id: string]> | null;

            if (!results) {
                return []
            }

            results.forEach(([error, id], i) => {
                if (error) {
                    this.onEventPublishFailed(newEvents[i], error);
                } else {
                    this.onEventPublishSucceeded(id, newEvents[i]);
                }
            });

            return results.map(([error, id]) => ({ id: id as string, error, ok: error ? false : true }));
        } catch (error) {
            newEvents.forEach((newEvent) => this.onEventPublishFailed(newEvent, error as Error));
            throw error;
        }
    };


    /**
    * Register an event listener for the specified event.
    * @param event - The event to listen for.
    * @param listener - The callback function to handle the event.
    */
    public on<P, H>(event: typeof PUBLISHED_HOOK, listener: (data: PublishedHookPayload<P, H>) => void): void;
    public on<P, H>(event: typeof FAILED_HOOK, listener: (data: FailedHookPayload<P, H>) => void): void;
    public on(event: HookType, listener: (data: any) => void): void {
        this.eventEmitter.on(event, listener);
    }

    async stop(): Promise<void> {
        await this.redis.quit()
        if (this.trimmer) {
            this.trimmer.stop()
            this.trimmer = null;
        }
    }
}
