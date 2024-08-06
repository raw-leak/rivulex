import { Logger } from "../types";
import { Redis } from "../redis/redis";

import { Publisher } from "../core/publisher";
import { Subscriber } from "../core/subscriber";
import { Trimmer } from "../core/trimmer";

import { RivulexSubscriberConfig, RivulexPublisherConfig, RivulexTrimmerConfig } from "../config/rivulex.config";

/**
 * The `Rivulex` class provides a factory for creating instances of `Publisher` and `Subscriber`.
 * It handles the initialization of the Redis client and configuration management.
 */
export class Rivulex {

    /**
    * Creates a new instance of the `Publisher` class.
    * Uses the provided configuration to initialize the `Publisher`.
    * Optionally, a custom logger can be provided for logging purposes.
    * @param {RivulexPublisherConfig} config - The configuration object for the `Publisher`.
    * @param {Logger} [logger=console] - An optional logger instance to handle log messages.
    * @returns {Publisher} - A new instance of the `Publisher` class.
    * @throws {Error} - Throws an error if the configuration is invalid or missing required fields.
    */
    static publisher(config: RivulexPublisherConfig, logger: Logger = console): Publisher {
        const redis = Redis.connect(config.redis);
        return new Publisher(config, redis, logger);
    }

    /**
    * Creates a new instance of the `Subscriber` class.
    * Uses the provided configuration to initialize the `Subscriber`.
    * Optionally, a custom logger can be provided for logging purposes.
    * @param {RivulexSubscriberConfig} config - The configuration object for the `Subscriber`.
    * @param {Logger} [logger=console] - An optional logger instance to handle log messages.
    * @returns {Subscriber} - A new instance of the `Subscriber` class.
    * @throws {Error} - Throws an error if the configuration is invalid or missing required fields.
    */
    static subscriber(config: RivulexSubscriberConfig, logger: Logger = console): Subscriber {
        const redis = Redis.connect(config.redis);
        return new Subscriber(config, redis, logger);
    }

    /**
    * Creates a new instance of the `Trimmer` class.
    * Uses the provided configuration to initialize the `Trimmer`.
    * Optionally, a custom logger can be provided for logging purposes.
    * @param {RivulexTrimmerConfig} config - The configuration object for the `Trimmer`.
    * @param {Logger} [logger=console] - An optional logger instance to handle log messages.
    * @returns {Trimmer} - A new instance of the `Trimmer` class.
    * @throws {Error} - Throws an error if the configuration is invalid or missing required fields.
    */
    static trimmer(config: RivulexTrimmerConfig, logger: Logger = console): Trimmer {
        const redis = Redis.connect(config.redis);
        return new Trimmer(config, redis, logger);
    }
}