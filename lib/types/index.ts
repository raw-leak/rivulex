import { Redis } from "ioredis";
import { Channel } from "../channel/channel";

/**
 * Type alias for a Redis client.
 * This type is a wrapper around `ioredis`'s `Redis` class, used for interacting with Redis.
 */
export type RedisClient = Redis


/**
 * Represents the raw event structure from Redis.
 * It can be one of two formats:
 * 1. Without attempt: `[id, ["action", actionName, "payload", payloadJson, "headers", headersJson], streamName, timestamp]`
 * 2. With attempt: `[id, ["action", actionName, "payload", payloadJson, "headers", headersJson, "attempt", attemptNumber], streamName, timestamp]`
 */
export type RawEvent =
    | [string, ["action", string, "payload", string, "headers", string], string, number]
    | [string, ["action", string, "payload", string, "headers", string, "attempt", number], string, number];

/**
* Represents an event that is pending in Redis.
* The structure is `[id, clientId, idleTime, attempt]`.
*/
export type PendingEvent = [string, string, string, number];

/**
 * Represents an event with type parameters for payload and headers.
 * @template P - The type of the payload.
 * @template H - The type of the headers.
 */
export interface Event<P = any, H = any> {
    /**
     * Unique identifier for the event.
     */
    id: string;

    /**
     * The action associated with the event.
     */
    action: string;

    /**
     * The channel from which the event was published.
     */
    channel: string;

    /**
     * The number of times the event has been attempted.
     */
    attempt: number;

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
 * Function type for marking the event processing as done.
 */
export interface Done {
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
     * @param done - Callback to be invoked when the handling is done.
     */
    (event: Event<P, H>, done: Done): void;
}

/**
 * Type alias for a map of channel names to `Channel` instances.
 */
export type ChannelsHandlers = Map<string, Channel>;

/**
 * Base structure for event headers.
 */
interface HeadersBase {
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
export type Headers<T = Record<any, any>> = HeadersBase & T;
