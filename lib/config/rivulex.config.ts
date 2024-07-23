import { RedisConfig } from "../types";
import { PublisherConfig } from "./publisher.config";
import { SubscriberConfig } from "./subscriber.config";

export interface RivulexSubscriberConfig extends SubscriberConfig {
    /**
     * The Redis client instance used for communication with Redis.
     */
    redis: RedisConfig;
}

export interface RivulexPublisherConfig extends PublisherConfig {
    /**
     * The Redis client instance used for communication with Redis.
     */
    redis: RedisConfig;
}