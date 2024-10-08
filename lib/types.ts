import { Redis, RedisOptions } from "ioredis";
import { Channel } from "./channel/channel";
import { PUBLISHED_HOOK, FAILED_HOOK, CONFIRMED_HOOK, TIMEOUT_HOOK, REJECTED_HOOK } from "./constants";

/**
 * Type alias for a Redis client.
 * This type is a wrapper around `ioredis`'s `Redis` class, used for interacting with Redis.
 */
export type RedisClient = Redis

export type RedisConfig = RedisOptions

export type SentEvent = ["action", string, "payload", string, "headers", string] | ["action", string, "payload", string, "headers", string, "attempt", number]

/**
 * Represents the raw event structure from Redis.
 * It can be one of two formats:
 * 1. Without attempt: `[id, ["action", actionName, "payload", payloadJson, "headers", headersJson], streamName, timestamp]`
 * 2. With attempt: `[id, ["action", actionName, "payload", payloadJson, "headers", headersJson, "attempt", attemptNumber], streamName, timestamp]`
 */
export type RawEvent = [string, SentEvent, string, number]

/**
* Represents an event that is pending in Redis.
* The structure is `[id, clientId, idleTime, attempt]`.
*/
export type PendingEvent = [string, string, string, number];


export interface NewEvent<P = any, H = any> {
    /**
     * The action associated with the event.
     */
    action: string;

    /**
     * The stream to which the event was published.
     */
    stream: string;

    /**
     * The headers associated with the event.
     */
    headers: Headers<H>;

    /**
     * The payload of the event.
     */
    payload: P;
}


/**
 * Represents an event with type parameters for payload and headers.
 * @template P - The type of the payload.
 * @template H - The type of the headers.
 */
export interface BaseEvent<P = any, H = any> extends NewEvent<P, H> {
    /**
     * Unique identifier for the event.
     */
    id: string;

    /**
    * The number of times the event has been attempted.
    */
    attempt: number;
}

/**
 * Represents an event with type parameters for payload, headers, and ack callback.
 * @template P - The type of the payload.
 * @template H - The type of the headers.
 */
export interface Event<P, H> extends BaseEvent<P, H> {
    ack: Ack;
}

/**
 * Function type for marking the event processing as done.
 */
export interface Ack {
    (): void;
}

/**
 * Type for event handlers.
 * @template P - The type of the payload.
 * @template H - The type of the headers.
 */
export interface Handler<P = any, H = any> {
    /**
     * Handles an event.
     * @param event - The event to handle.
     */
    (event: Event<P, H>): Promise<void> | void;
}

/**
 * Type alias for a map of channel names to `Channel` instances.
 */
export type ChannelsHandlers = Map<string, Channel>;

/**
 * Base structure for event headers.
 */
interface BaseHeaders {
    /**
     * Timestamp of when the event was created.
     */
    timestamp: string;

    /**
     * The consumer group associated with the event.
     */
    group: string;

    /**
     * Indicates if the event has been rejected.
     */
    rejected?: boolean;

    /**
     * The group to which the event was rejected.
     */
    rejectedGroup?: string;

    /**
     * Timestamp of when the event was rejected.
     */
    rejectedTimestamp?: string;
}

/**
 * Represents the headers of an event, combining the base headers with additional custom properties.
 * @template T - Additional custom header properties.
 */
export type Headers<T = Record<any, any>> = BaseHeaders & T;


export interface Logger {
    log(message: string, ...optionalParams: any[]): void;
    error(message: string, ...optionalParams: any[]): void;
    warn(message: string, ...optionalParams: any[]): void;
    debug(message: string, ...optionalParams: any[]): void;
}

export type PublisherHookType = typeof PUBLISHED_HOOK | typeof FAILED_HOOK;
export type SubscriberHookType = typeof CONFIRMED_HOOK | typeof FAILED_HOOK | typeof TIMEOUT_HOOK | typeof REJECTED_HOOK;

export type XReadGroupResponse = Array<[string, Array<RawEvent> | undefined]> | undefined;
export type XPendingResponse = Array<PendingEvent> | undefined;
