import EventEmitter from 'node:events';

import { setDefaultMinMax } from '../utils';
import { FAILED_HOOK, CONFIRMED_HOOK, REJECTED_HOOK, TIMEOUT_HOOK } from '../constants';
import { ChannelsHandlers, Handler, Logger, RedisClient, SubscriberHookType } from "../types";
import { ErrorHookPayload, ProcessedHookPayload, SubscriberConfig } from '../config/subscriber.config';

import { Trimmer } from './trimmer';
import { Channel } from '../channel/channel';
import { Processor } from '../processor/processor';
import { LiveConsumer } from '../consumers/live.consumer';
import { FailedConsumer } from '../consumers/failed.consumer';

/**
 * The `Subscriber` class is responsible for subscribing to Redis streams, 
 * managing events, and delegating processing to appropriate handlers. 
 * It uses `LiveConsumer` and `FailedConsumer` to manage and process events 
 * based on their state.
 */
export class Subscriber {
  private logger: Logger;
  private redis: RedisClient;
  private trimmer: Trimmer | null;
  private eventEmitter: EventEmitter;

  /**
  * The processor layer for processing incoming events.
  * @type {Processor}
  */
  private processor: Processor;

  /**
  * The consumer for handling live events.
  * @type {LiveConsumer}
  */
  private liveConsumer: LiveConsumer;

  /**
  * The consumer for handling failed events.
  * @type {FailedConsumer}
  */
  private failedConsumer: FailedConsumer;

  /**
  * A map of channels and their associated handlers.
  * @type {ChannelsHandlers}
  */
  readonly channelsHandlers: ChannelsHandlers;



  Processor

  /**
  * Indicates whether the subscriber is currently enabled.
  * @type {boolean}
  */
  private enabled = false;

  /** @type {SubscriberConfig['clientId']} */
  private clientId: string;

  /** @type {SubscriberConfig['group']} */
  private group: string;

  /** @type {SubscriberConfig['ackTimeout']} */
  private ackTimeout: number;
  private defAckTimeout = 30 * 1000; // 30 seconds
  private minAckTimeout = 1 * 1000; // 1 seconds

  /** @type {SubscriberConfig['processTimeout']} */
  private processTimeout: number;
  private defProcessTimeout = 200; // 200 ms
  private minProcessTimeout = 20; // 20 ms

  /** @type {SubscriberConfig['fetchBatchSize']} */
  private fetchBatchSize: number;
  private defFetchBatchSize = 100;
  private minFetchBatchSize = 1;

  /** @type {SubscriberConfig['processConcurrency']} */
  private processConcurrency: number;
  private defProcessConcurrency = 100;
  private minProcessConcurrency = 1;

  /** @type {SubscriberConfig['retries']} */
  private retries: number;
  private defRetries = 3;
  private minRetries = 1;

  /** @type {SubscriberConfig['blockTime']} */
  private blockTime: number;
  private defBlockTime = 30 * 1000; // 30 seconds
  private minBlockTime = 1 * 1000; // 1 seconds

  /**
  * Creates a new instance of the `Subscriber` class.
  * 
  * @param {SubscriberConfig} config - Configuration object for the `Subscriber`.
  * @param {RedisClient} redis - The Redis client used to interact with Redis streams.
  * @param {Logger} logger - The logger instance used for logging messages and errors.
  * @throws {Error} - Throws an error if the Redis client or group is missing from the configuration.
  */
  constructor(config: SubscriberConfig, redis: RedisClient, logger: Logger) {
    const { clientId, group, processTimeout, ackTimeout, fetchBatchSize, processConcurrency, retries, blockTime } = config;

    if (!redis) throw new Error('Missing required "redis" parameter');
    if (!group) throw new Error('Missing required "group" parameter');

    this.clientId = clientId || `rivulex:${group}:sub:${Date.now()}`;
    this.group = group;
    this.redis = redis;
    this.logger = logger;

    this.channelsHandlers = new Map()

    this.retries = setDefaultMinMax(retries, this.defRetries, this.minRetries)
    this.blockTime = setDefaultMinMax(blockTime, this.defBlockTime, this.minBlockTime)
    this.ackTimeout = setDefaultMinMax(ackTimeout, this.defAckTimeout, this.minAckTimeout)
    this.processTimeout = setDefaultMinMax(processTimeout, this.defProcessTimeout, this.minProcessTimeout)
    this.fetchBatchSize = setDefaultMinMax(fetchBatchSize, this.defFetchBatchSize, this.minFetchBatchSize);
    this.processConcurrency = setDefaultMinMax(processConcurrency, this.defProcessConcurrency, this.minProcessConcurrency);

    const { customEventConfirmedLog, customEventRejectedLog, customEventTimeoutLog, customEventFailedLog } = config;

    this.eventEmitter = new EventEmitter();
    this.processor = new Processor({
      group: this.group,
      retries: this.retries,
      processTimeout: this.processTimeout,
      processConcurrency: this.processConcurrency,
      customEventConfirmedLog,
      customEventRejectedLog,
      customEventTimeoutLog,
      customEventFailedLog,
    }, this.redis, this.logger, this.eventEmitter);

    if (config.trimmer) {
      this.trimmer = new Trimmer(config.trimmer, this.redis, this.logger)
    }
  }

  /**
   * Create new group or join to existing one.
   */
  private createGroup = async () => {
    for (const channel of [...this.channelsHandlers.keys()]) {
      this.redis.xgroup('CREATE', channel, this.group, '0', 'MKSTREAM', (err) => {
        if (err) {
          if (err.message.includes('BUSYGROUP')) {
            this.logger.debug(`Group ${this.group} already exists at stream ${channel}.`);
          } else {
            throw err;
          }
        } else {
          this.logger.debug(`Group ${this.group} have been created in stream ${channel}.`);
        }
      });
    }
  };


  /**
  * Registers a handler for a specific action on a given stream.
  * 
  * This method ensures that the provided action is associated with the given 
  * handler function for the specified stream. If the stream does not already 
  * exist, a new `Channel` instance is created and added to the `channelsHandlers` map.
  * 
  * **Parameters:**
  * 
  * - `streamName` (string): The name of the stream for which the action is being registered.
  * - `action` (string): The name of the action to be handled.
  * - `handler` (Handler): The function that processes events for the specified action.
  * 
  * **Returns:**
  * 
  * - `Channel`: The `Channel` instance associated with the given stream, allowing further configuration.
  * 
  * **Example Usage:**
  * 
  * ```typescript
  * subscriber.streamAction('users', 'user_created', (event: Event<Payload, Headers<Custom>>) => {
  *   // Handle the event
  *   await event.ack();
  * });
  * ```
  */
  streamAction(streamName: string, action: string, handler: Handler) {
    let channel = this.channelsHandlers.get(streamName)
    if (!channel) {
      channel = new Channel();
      this.channelsHandlers.set(streamName, channel);
    }

    channel.action(action, handler)
  }

  /**
  * Retrieves the `Channel` instance for a given stream, creating a new one if it does not exist.
  * 
  * This method checks if a `Channel` is already registered for the specified stream name. 
  * If not, a new `Channel` is created and added to the `channelsHandlers` map. The method 
  * then returns the `Channel` instance, which can be used to configure actions and handlers.
  * 
  * **Parameters:**
  * 
  * - `streamName` (string): The name of the stream to retrieve or create.
  * 
  * **Returns:**
  * 
  * - `Channel`: The `Channel` instance for the specified stream.
  * 
  * **Example Usage:**
  * 
  * ```typescript
  * const channel = subscriber.stream('users');
  * channel.action('user_created', (event: Event<Payload, Headers<Custom>>) => {
  *   // Handle the event
  *   await event.ack();
  * });
  * ```
  */
  stream(streamName: string): Channel {
    if (!this.channelsHandlers.has(streamName)) {
      const newChannel = new Channel();
      this.channelsHandlers.set(streamName, newChannel);
    }
    return this.channelsHandlers.get(streamName)!;
  }


  /**
  * Starts listening for events on all configured channels.
  * 
  * This method initializes the `LiveConsumer` and `FailedConsumer` instances, sets up 
  * the Redis consumer groups, and begins processing events. It will only start listening 
  * if it has not already been enabled. The method ensures that the Redis stream group is 
  * created and then invokes the `consume` methods on both `LiveConsumer` and `FailedConsumer`.
  * 
  * **Returns:**
  * 
  * - `Promise<void>`: A promise that resolves once the consumer setup is complete and 
  *   event processing has started.
  * 
  * **Throws:**
  * 
  * - Any error that occurs during the creation of the Redis consumer group or while 
  *   starting the consumers.
  * 
  * **Example Usage:**
  * 
  * ```typescript
  * await subscriber.listen();
  * // The subscriber is now listening for events
  * ```
  */
  async listen() {
    if (!this.enabled) {
      this.liveConsumer = new LiveConsumer({
        clientId: this.clientId,
        streams: [...this.channelsHandlers.keys()],
        group: this.group,
        blockTime: this.blockTime,
        fetchBatchSize: this.fetchBatchSize,
      }, this.redis, this.processor, this.logger)

      this.failedConsumer = new FailedConsumer({
        clientId: this.clientId,
        streams: [...this.channelsHandlers.keys()],
        group: this.group,
        ackTimeout: this.ackTimeout,
        fetchBatchSize: this.fetchBatchSize,
      }, this.redis, this.processor, this.logger)

      await this.createGroup();

      this.liveConsumer.consume(this.channelsHandlers)
      this.failedConsumer.consume(this.channelsHandlers)

      this.enabled = true

      if (this.trimmer) {
        await this.trimmer.start()
      }
    }
  }

  /**
  * Register an event listener for the specified event.
  * @param event - The event to listen for.
  * @param listener - The callback function to handle the event.
  */
  public on<P, H>(event: typeof CONFIRMED_HOOK, listener: (data: ProcessedHookPayload<P, H>) => void): void;
  public on<P, H>(event: typeof FAILED_HOOK, listener: (data: ErrorHookPayload<P, H>) => void): void;
  public on<P, H>(event: typeof TIMEOUT_HOOK, listener: (data: ErrorHookPayload<P, H>) => void): void;
  public on<P, H>(event: typeof REJECTED_HOOK, listener: (data: ErrorHookPayload<P, H>) => void): void;
  public on(event: SubscriberHookType, listener: (data: any) => void): void {
    this.eventEmitter.on(event, listener);
  }

  /**
  * Stops listening for events on all configured channels.
  * 
  * ```typescript
  * await subscriber.stop();
  * // The subscriber is now not listening for events
  * ```
  */
  async stop() {
    return new Promise(async (resolve) => {
      if (this.enabled) {
        await Promise.allSettled([this.liveConsumer.stop(), this.failedConsumer.stop()])
        if (this.trimmer) {
          this.trimmer.stop()
          this.trimmer = null;
        }
        this.redis.quit(resolve)
        this.enabled = false
      }
    })
  }
}
