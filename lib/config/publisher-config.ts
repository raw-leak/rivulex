import { Headers } from "../types";

export interface PublisherConfig<P extends Record<any, any> = any, H extends Record<any, any> = any> {
    channel: string;
    group: string;

    onMessagePublished?: (data: { id: string, headers: Headers<H>, action: string, payload: P }) => void;
    onPublishFailed?: (data: { headers: Headers<H>, action: string, error: Error }) => void;
}