import { Redis } from 'ioredis';
import { TrimmerConfig } from '../config/trimmer.config';
import { Logger, RedisClient } from "../types";
import { setDefaultMinMax } from '../utils';

/**
 * Interface representing the trimming information stored in Redis.
 */
export interface TrimmingInfo {
    clientId: string;
    trimmedAt: number;
    intervalTime: number;
    retentionPeriod: number;
    minId: string;
    group: string;
}

/**
 * The `Trimmer` class is responsible for managing the trimming of old messages from Redis streams.
 * It ensures that messages older than a specified retention period are removed at regular intervals.
 * The trimming process is distributed and coordinated using Redis to avoid conflicts between multiple instances.
 */
export class Trimmer {

    /** @type {TrimmerConfig['channels']} */
    private channels: string[];

    /** @type {TrimmerConfig['group']} */
    private group: string;

    /** @type {TrimmerConfig['clientId']} */
    private clientId: string;

    /** @type {TrimmerConfig['intervalTime']} */
    private intervalTime: number;
    private defIntervalTime = 172_800_000; // 48h
    private minIntervalTime = 10_000; // 10s

    /** @type {TrimmerConfig['retentionPeriod']} */
    private retentionPeriod: number;
    private defRetentionPeriod = 172_800_000; // 48h
    private minRetentionPeriod = 10_000; // 10s

    private redis: Redis;
    private logger: Logger;
    private trimmingBaseKey = "rivulex:trimmer:"

    private intervalId: NodeJS.Timeout | null = null;
    private timeoutId: NodeJS.Timeout | null = null;

    /**
     * Constructs a new instance of the `Trimmer` class.
     * Initializes the trimmer with the provided configuration, Redis client, and logger.
     * 
     * @param {TrimmerConfig} config - The configuration object for the trimmer.
     * @param {RedisClient} redis - The Redis client instance to interact with Redis.
     * @param {Logger} logger - The logger instance for logging messages and errors.
     * 
     * @description
     * The constructor initializes the trimmer with the necessary configuration parameters, including the channels to trim,
     * the consumer group, the client ID, the interval time between trim operations, and the retention period for messages.
     * Default values are used for optional parameters if they are not provided in the configuration.
     */
    constructor(config: TrimmerConfig, redis: RedisClient, logger: Logger) {
        const { channels, clientId, group, intervalTime, retentionPeriod } = config

        this.redis = redis;
        this.logger = logger;

        this.group = group;
        this.channels = channels;
        this.clientId = clientId || `rivulex:${group}:trimmer:${Date.now()}`;

        this.intervalTime = setDefaultMinMax(intervalTime, this.defIntervalTime, this.minIntervalTime)
        this.retentionPeriod = setDefaultMinMax(retentionPeriod, this.defRetentionPeriod, this.minRetentionPeriod)
    }


    /**
     * Generates the Redis key for storing trim information for a given stream.
     * @param {string} streamName - The name of the stream.
     * @returns {string} - The Redis key for the stream.
     */
    private getStreamTrimKey(streamName: string) {
        return `${this.trimmingBaseKey}${streamName}`;
    }


    /**
     * Generates the minimum ID for the retention period based on the current time.
     * @returns {string} - The minimum stream ID to retain.
     */
    private getMinIdForRetentionPeriod(): string {
        const now = Date.now();
        const minTimestamp = now - this.retentionPeriod;
        return `${minTimestamp}-0`; // Redis stream ID format: <millisecondsTime>-<sequenceNumber>
    }

    /**
     * Trims the specified stream by removing messages older than the retention period.
     * @param {string} streamName - The name of the stream to trim.
     * @returns {Promise<void>} - A promise that resolves when the stream is trimmed.
     */
    private async trimStream(streamName: string): Promise<void> {
        const minId = this.getMinIdForRetentionPeriod();
        await this.redis.xtrim(streamName, 'MINID', minId);

        this.logger.log(`Stream ${streamName} trimmed by ${this.clientId} to remove messages older than ${this.retentionPeriod} milliseconds`);

        // Store trimming information
        const trimmingInfo: TrimmingInfo = {
            clientId: this.clientId,
            trimmedAt: Date.now(),
            intervalTime: this.intervalTime,
            retentionPeriod: this.retentionPeriod,
            minId: minId,
            group: this.group,
        };

        await this.redis.set(this.getStreamTrimKey(streamName), JSON.stringify(trimmingInfo), 'EX', this.intervalTime);
    }

    /**
     * Determines whether the specified stream should be trimmed.
     * @param {string} streamName - The name of the stream to check.
     * @returns {Promise<boolean>} - A promise that resolves to true if the stream should be trimmed, otherwise false.
     */
    private async shouldTrim(streamName: string): Promise<boolean> {
        const trimmingInfoStr = await this.redis.get(this.getStreamTrimKey(streamName));
        if (trimmingInfoStr) {
            const trimmingInfo = JSON.parse(trimmingInfoStr) as TrimmingInfo;

            this.logger.debug(`Skipping trimming. Last trimming was done by ${trimmingInfo.clientId} at ${new Date(trimmingInfo.trimmedAt)}`);
            return false;
        }
        return true;
    }

    /**
     * Generates a random interval within ±30 seconds of the configured interval time.
     * 
     * (This randomness helps to avoid multiple instances trying to trim at the exact same time,
     * reducing the likelihood of conflicts.)
     * 
     * @returns {number} - The random interval time in milliseconds.
     */
    private getRandomInterval(): number {
        const randomOffset = Math.floor(Math.random() * 60) - 30; // Generate a random number between -30 and 30
        return (this.intervalTime + randomOffset) * 1000; // Convert to milliseconds
    }

    /**
     * Generates an initial delay between 1 and 10 seconds to stagger the initial trimming attempt.
     * 
     * (This helps to prevent multiple instances that start simultaneously from all attempting to trim immediately,
     * reducing the likelihood of conflicts.)
     * 
     * @returns {number} - The initial delay time in milliseconds.
     */
    private getInitialDelay(): number {
        return Math.floor(Math.random() * 10 + 1) * 1000; // Random delay between 1 and 10 seconds
    }

    /**
    * Trims all configured streams if they should be trimmed.
    * @returns {Promise<void>} - A promise that resolves when the trimming process is complete.
    */
    private async trim() {
        await Promise.allSettled(this.channels.map(async channel => {
            try {
                if (await this.shouldTrim(channel)) {
                    await this.trimStream(channel);
                }
            } catch (error) {
                this.logger.error(`trimming of ${channel} stream has failed with error:`, error)
            }
        }))
    }

    /**
    * Starts the trimming process, initially delayed, then periodically based on the random interval.
    * @returns {Promise<void>} - A promise that resolves when the trimming process is started.
    */
    public async start(): Promise<void> {
        this.timeoutId = setTimeout(async () => {
            await this.trim();
        }, this.getInitialDelay());

        this.intervalId = setInterval(async () => {
            await this.trim();
        }, this.getRandomInterval());

        this.logger.debug(`Rivulex Trimmer ${this.clientId} initiated.`);
    }

    /**
    * Stops the trimming process by clearing the intervals and timeouts.
    * @returns {void}
    */
    public stop(): void {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.logger.debug(`Rivulex Trimmer ${this.clientId} stopped.`);
    }
}
