import { Redis } from "../redis/redis";
import { RedisClient, RedisConfig } from "../types";

import { PublisherConfig } from "../config/publisher.config";
import { SubscriberConfig } from "../config/subscriber.config";

import { Publisher } from "../core/publisher";
import { Subscriber } from "../core/subscriber";


/**
 * The `Rivulex` class provides a factory for creating instances of `Publisher` and `Subscriber`.
 * It handles the initialization of the Redis client and configuration management.
 */
export class Rivulex {
    // Holds the singleton instance of the Redis client.
    private static redisClient: RedisClient | null = null;


    /**
     * Initializes and returns the Redis client.
     * If the Redis client is not already initialized, it will be created.
     * @returns {RedisClient} - The Redis client instance.
     * @throws {Error} - Throws an error if Redis client initialization fails.
     */
    private static initiateRedis(config: RedisConfig): RedisClient {
        if (!Rivulex.redisClient) {
            Rivulex.redisClient = Redis.connect(config)
        }
        return Rivulex.redisClient;
    }


    /**
    * Creates a new instance of the `Publisher` class.
    * Uses the provided configuration to initialize the `Publisher`.
    * Optionally, a custom logger can be provided for logging purposes.
    * @param {PublisherConfig} config - The configuration object for the `Publisher`.
    * @param {Console} [logger=console] - An optional logger instance to handle log messages.
    * @returns {Publisher} - A new instance of the `Publisher` class.
    * @throws {Error} - Throws an error if the configuration is invalid or missing required fields.
    */
    static publisher(config: PublisherConfig, logger: Console = console): Publisher {
        const redis = Rivulex.initiateRedis({}); // TODO
        return new Publisher(config, redis, logger);
    }

    /**
    * Creates a new instance of the `Subscriber` class.
    * Uses the provided configuration to initialize the `Subscriber`.
    * Optionally, a custom logger can be provided for logging purposes.
    * @param {SubscriberConfig} config - The configuration object for the `Subscriber`.
    * @param {Console} [logger=console] - An optional logger instance to handle log messages.
    * @returns {Subscriber} - A new instance of the `Subscriber` class.
    * @throws {Error} - Throws an error if the configuration is invalid or missing required fields.
    */
    static subscriber(config: SubscriberConfig, logger: Console = console): Subscriber {
        const redis = Rivulex.initiateRedis({}); // TODO
        return new Subscriber(config, redis, logger);
    }
}