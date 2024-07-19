export interface SubscriberConfig {
    clientId?: string;
    channels: Array<string>;
    group: string;
    timeout?: number;
    interval?: number;
    count?: number;
    block?: number;
    retries?: number;
}