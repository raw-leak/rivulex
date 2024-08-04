import { Headers, NewEvent } from "../types";
import { TrimmerConfig } from "./trimmer.config";

/**
 * Callback type for successful event publishing.
 * @template P - The type of the payload.
 * @template H - The type of the headers.
 */
export type PublishSuccessCallback<P, H> = (
    id: string,
    data: NewEvent,
) => void;

/**
 * Callback type for failed event publishing.
 * @template H - The type of the headers.
 */
export type PublishErrorCallback<H> = (
    data: NewEvent,
    error: Error
) => void;

/**
 * Configuration object for the Publisher class.
 * @template P - The type of the payload.
 * @template H - The type of the headers.
 */
export interface PublisherConfig {
    /**
    * The Redis stream channel to publish events to.
    * @REQUIRED
    */
    channel: string;

    /**
    * The consumer group to associate with the events.
    * @REQUIRED
    */
    group: string;

    /**
    * Callback to be invoked when an event is successfully published.
    * @OPTIONAL
    */
    onEventPublished?: PublishSuccessCallback<any, any>;

    /**
    * Callback to be invoked when publishing an event fails.
    * @OPTIONAL
    */
    onPublishFailed?: PublishErrorCallback<any>;

    /**
     * Configuration for the Trimmer.
     * @OPTIONAL
     * If provided, the Publisher will initialize a Trimmer to manage trimming old events from the Redis stream.
     */
    trimmer?: TrimmerConfig
}
