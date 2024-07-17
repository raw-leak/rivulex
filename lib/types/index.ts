export type Redis = any

export type RawEvent = [string, string, string, number];

export interface Event<P = any, H = any> {
    id: string;
    action: string;
    channel: string;
    attempt: number;
    headers: Headers<H>;
    payload: P;
}

export interface Done {
    (): void;
}

export interface Handler<T = null> {
    (event: Event<T>, done: Done): void;
}

interface HeadersBase {
    timestamp: string;
    group: string;

    rejected?: boolean;
    rejectedGroup?: string;
    rejectedTimestamp?: string;
}

export type Headers<T = {}> = HeadersBase & T;


export type PublishSuccessCallback<P extends Record<any, any>, H extends Record<any, any>> = (
    data: { id: string, headers: Headers<H>, action: string, payload: P, group: string }
) => void;

export type PublishErrorCallback<H extends Record<any, any>> = (
    data: { headers: Headers<H>, action: string, error: Error }
) => void;

export interface PublisherConfig<P extends Record<any, any> = any, H extends Record<any, any> = any> {
    channel: string;
    group: string;

    onMessagePublished?: (data: { id: string, headers: Headers<H>, action: string, payload: P }) => void;
    onPublishFailed?: (data: { headers: Headers<H>, action: string, error: Error }) => void;
}