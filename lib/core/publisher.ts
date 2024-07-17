
import { Formatter } from "../formatter/formatter"
import { PublisherConfig } from "../config/publisher-config";

import { Headers, PublishErrorCallback, PublishSuccessCallback, Redis } from "../types";


export class Publisher {
    private redis: Redis
    private formatter: Formatter;
    private channel: string;
    private group: string;
    private onMessagePublished: PublishSuccessCallback<any, any>;
    private onPublishFailed: PublishErrorCallback<any>;

    /**
     * Create a stream Publisher.
     * @param {Object} config - Configuration object for the publisher.
     */
    constructor(redis: Redis, config: PublisherConfig) {

    }

    /**
      * Default handler for successful publishing.
      */
    private defaultOnMessagePublished: <P extends Record<any, any>, H extends Record<any, any>>(data: { id: string, headers: Headers<H>, action: string, payload: P, group: string }) => void = (data) => {
        console.log(`PUBLISHED id: ${data.id} action: ${data.action} group: ${data.group}`);
    };

    /**
     * Default handler for failed publishing.
     */
    private defaultOnPublishFailed: <P extends Record<any, any>, H extends Record<any, any>>(data: { headers: Headers<H>, action: string, error: Error }) => void = (data) => {
        console.error(`PUBLISH_FAILED action: ${data.action} group: ${data.headers.group} error: ${data.error.message} stack: ${data.error.stack}`);
    };

    /**
     * Publish a message.
     */
    publish = async <P extends Record<any, any>, H extends Record<any, any>>(action: string, payload: P, headers: H = {} as H): Promise<string> => {
        try {
            const id = await this.redis.xadd(this.channel, "*", ...this.formatter.formatEventForSend<P, H>(action, payload, headers, this.group)) as string;
            this.onMessagePublished({ id, headers, action, payload, group: this.group });
            return id;
        } catch (error) {
            this.onPublishFailed({ headers, action, error: error as Error });
            throw error;
        }
    };

    /**
    * Publish multiple messages in a batch.
    */
    publishBatch = async <P extends Record<any, any>, H extends Record<any, any>>(messages: Array<{ action: string, payload: P, headers: H }>): Promise<Array<{ ok: boolean, id?: string, error: Error | null }>> => {
        if (!messages || !messages.length) {
            return []
        }

        const pipeline = this.redis.pipeline();

        messages.forEach(({ action, payload, headers }) => {
            pipeline.xadd(this.channel, "*", ...this.formatter.formatEventForSend<P, H>(action, payload, headers, this.group));
        });

        try {
            const results = await pipeline.exec() as Array<[error: Error, id: string]> | null;

            if (!results) {
                return []
            }

            results.forEach(([error, id], index) => {
                if (error) {
                    this.onPublishFailed({ headers: messages[index].headers, action: messages[index].action, error });
                } else {
                    this.onMessagePublished({ id, headers: messages[index].headers, action: messages[index].action, payload: messages[index].payload, group: this.group });
                }
            });

            return results.map(([error, id]) => ({ id: id as string, error, ok: error ? false : true }));
        } catch (error) {
            messages.forEach(({ headers, action }) => {
                this.onPublishFailed({ headers, action, error: error as Error });
            });

            throw error;
        }
    };

    async stop(): Promise<void> {
        await this.redis.quit()
    }
}
