import { Headers } from "../types";

/**
 * Callback type for successful event publishing.
 * @template P - The type of the payload.
 * @template H - The type of the headers.
 */
export type PublishSuccessCallback<P extends Record<any, any>, H extends Record<any, any>> = (
    data: {
        id: string;
        headers: Headers<H>;
        action: string;
        payload: P;
        group: string;
    }
) => void;

/**
 * Callback type for failed event publishing.
 * @template H - The type of the headers.
 */
export type PublishErrorCallback<H extends Record<any, any>> = (
    data: {
        headers: Headers<H>;
        action: string;
        error: Error;
    }
) => void;

/**
 * Configuration object for the Publisher class.
 * @template P - The type of the payload.
 * @template H - The type of the headers.
 */
export interface PublisherConfig {
    /**
     * The Redis stream channel to publish events to.
     */
    channel: string;

    /**
     * The consumer group to associate with the events.
     */
    group: string;

    /**
     * Callback to be invoked when an event is successfully published.
     */
    onMessagePublished?: PublishSuccessCallback<any, any>;

    /**
     * Callback to be invoked when publishing an event fails.
     */
    onPublishFailed?: PublishErrorCallback<any>;
}
