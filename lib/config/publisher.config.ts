import { Headers, NewEvent } from "../types";
import { TrimmerConfig } from "./trimmer.config";

/**
 * Callback type for successful event publishing custom log message.
 * @template P - The type of the payload.
 * @template H - The type of the headers.
 */
export type PublishSuccessLog<P, H> = (
    id: string,
    data:    NewEvent,
) => string;

/**
 * Callback type for failed event publishing custom log message.
 * @template P - The type of the payload.
 * @template H - The type of the headers.
 */
export type PublishFailedLog<P, H> = (
    data: NewEvent<P, H>,
    error: Error
) => string;

/**
* Callback type for handling the payload of a successfully published event.
* @template P - The type of the payload.
* @template H - The type of the headers.
*/
export type PublishedHookPayload<P, H> = (
    id: string,
    event: NewEvent<P, Headers<H>>,
) => void;

/**
* Callback type for handling the payload of a failed event publishing attempt.
* @template P - The type of the payload.
* @template H - The type of the headers.
*/
export type FailedHookPayload<P, H> = (
    event: NewEvent<P, Headers<H>>,
    error: Error
) => void;

/**
 * Configuration object for the Publisher class.
 * @template P - The type of the payload.
 * @template H - The type of the headers.
 */
export interface PublisherConfig {
    /**
    * The default Redis stream to publish events to.
    * @REQUIRED
    */
    defaultStream: string;

    /**
    * The consumer group to associate with the events.
    * @REQUIRED
    */
    group: string;

    /**
    * Callback to be invoked when an event is successfully published to define a custom log message.
    * This allows customization of the log message format for successful event publication.
    * The callback receives the event ID and the event data, and should return a string that represents the log message.
    * @OPTIONAL
    * @param {string} id - The unique identifier of the published event.
    * @param {NewEvent} event - The event data that was published.
    * @returns A custom log message string.
    * 
    * Example:
    * customPublishSucceededLog: (id, event) => `Event with ID ${id} and action ${event.action} was successfully published.`
    */
    customPublishSucceededLog?: PublishSuccessLog<any, any>;

    /**
    * Callback to be invoked when publishing an event fails to define a custom log message.
    * This allows customization of the log message format for failed event publication.
    * The callback receives the event data and the error that occurred, and should return a string that represents the log message.
    * @OPTIONAL
    * @param {NewEvent} event - The event data that failed to be published.
    * @param {Error} error - The error that occurred during the publication.
    * @returns A custom log message string.
    * 
    * Example:
    * customPublishFailedLog: (event, error) => `Failed to publish event with action ${event.action}. Error: ${error.message}`
    */
    customPublishFailedLog?: PublishFailedLog<any, any>;

    /**
     * Configuration for the Trimmer.
     * @OPTIONAL
     * If provided, the Publisher will initialize a Trimmer to manage trimming old events from the Redis stream.
     */
    trimmer?: TrimmerConfig
}
