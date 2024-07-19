import { Redis } from "ioredis";
import { Channel } from "../channel/channel";

export type RedisClient = Redis

export type RawEvent =
    | [string, ["action", string, "payload", string, "headers", string], string, number]
    | [string, ["action", string, "payload", string, "headers", string, "attempt", number], string, number];

export type PendingEvent = [string, string, string, number]; // [id, clientId, idle time, attempt]

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

export interface Handler<T = any, H = any> {
    (event: Event<T, H>, done: Done): void;
}

export type ChannelsHandlers = Map<string, Channel>

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