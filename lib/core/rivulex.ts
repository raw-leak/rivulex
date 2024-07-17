import { Redis } from "../types";

import { PublisherConfig } from "../config/publisher-config";
import { SubscriberConfig } from "../config/subscriber-config";

import { Publisher } from "../core/publisher";
import { Subscriber } from "../core/subscriber";

export class Rivulex {
    private static redisClient: Redis | null = null;

    private static initiateRedis(): Redis {
        if (!Rivulex.redisClient) {
            Rivulex.redisClient = () => { }
        }
        return Rivulex.redisClient;
    }

    static publisher(config: PublisherConfig): Publisher {
        const redis = Rivulex.initiateRedis();
        return new Publisher(redis, config);
    }

    static subscriber(config: SubscriberConfig): Subscriber {
        const redis = Rivulex.initiateRedis();
        return new Subscriber(redis, config);
    }
}