import { Channel } from '../channel/channel';
import { SubscriberConfig } from '../config/subscriber.config';
import { FailedConsumer } from '../consumers/failed.consumer';
import { LiveConsumer } from '../consumers/live.consumer';
import { ChannelsHandlers, Handler, Logger, RedisClient } from '../types';

/**
 * The `Subscriber` class is responsible for subscribing to Redis streams, 
 * managing events, and delegating processing to appropriate handlers. 
 * It uses `LiveConsumer` and `FailedConsumer` to manage and process events 
 * based on their state.
 */
export class Subscriber {
  private logger: Logger;
  private redis: RedisClient;

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

  /**
  * Indicates whether the subscriber is currently enabled.
  * @type {boolean}
  */
  private enabled = false;

  /**
  * The client ID for the subscriber. Used for identifying the consumer within a group.
  * @type {string}
  */
  private clientId: string;

  /**
  * The consumer group name.
  * @type {string}
  */
  private group: string;

  /**
  * The timeout period for processing events, after which an event will be retried.
  * @type {number}
  */
  private timeout: number;

  /**
  * The number of events to fetch per request to Redis.
  * @type {number}
  */
  private count: number;

  /**
  * The number of retries allowed before an event is considered failed.
  * @type {number}
  */
  private retries: number;

  /**
  * The blocking period in milliseconds used for `XREADGROUP` in Redis.
  * 
  * This property defines how long the subscriber will wait for new events 
  * before checking the Redis stream again. The `block` option is critical 
  * for efficiently managing event retrieval without excessive CPU usage. 
  * 
  * When using the `BLOCK` option with `XREADGROUP`, Redis will block the 
  * connection for the duration specified by the `block` property. During 
  * this time, the subscriber waits for new entries to be added to the stream. 
  * If no new entries are added within this period, the subscriber will 
  * continue to block and wait for new data. This prevents constant polling 
  * and reduces unnecessary load on the Redis server and the application.
  * 
  * **Key Points:**
  * 
  * - **Blocking Behavior**: If `BLOCK` is set, the command will wait for the 
  *   specified duration for new entries. If no new entries are available, 
  *   the connection remains blocked until new data arrives or the timeout 
  *   expires.
  * 
  * - **Multiple Streams**: The `XREADGROUP` command with `BLOCK` can read from 
  *   multiple streams simultaneously, allowing the subscriber to handle 
  *   data from various sources efficiently.
  * 
  * **Default Value**: The default block period is set to 30 seconds 
  *   (30 * 60 * 1000 milliseconds), but it can be customized as needed.
  * 
  * @type {number}
  */
  private block: number;

  /**
   * Default value for the blocking period (30 seconds).
   * @type {number}
   */
  private defaultBlock = 30 * 60 * 1000; // 30 seconds

  /**
   * Default value for the timeout period (10 minutes).
   * @type {number}
   */
  private defaultTimeout = 10 * 60 * 60 * 1000; // 10 minutes

  /**
   * Default number of retries before an event is sent to the dead letter stream.
   * @type {number}
   */
  private defaultRetries = 3;

  /**
   * Default number of events fetched per request to Redis.
   * @type {number}
   */
  private defaultCount = 100;


  /**
  * Creates a new instance of the `Subscriber` class.
  * 
  * Initializes the subscriber with the provided configuration, Redis client, and logger.
  * 
  * @param {SubscriberConfig} config - Configuration object for the `Subscriber`.
  * @param {RedisClient} redis - The Redis client used to interact with Redis streams.
  * @param {Logger} logger - The logger instance used for logging messages and errors.
  * @throws {Error} - Throws an error if the Redis client or group is missing from the configuration.
  */
  constructor(config: SubscriberConfig, redis: RedisClient, logger: Logger) {
    const { clientId, group, timeout, count, retries, block } = config;

    if (!redis) throw new Error('Missing required "redis" parameter');
    if (!group) throw new Error('Missing required "group" parameter');

    this.timeout = timeout !== undefined ? timeout : this.defaultTimeout;
    this.count = count !== undefined ? count : this.defaultCount;
    this.retries = retries !== undefined ? retries : this.defaultRetries;
    this.block = block !== undefined ? block : this.defaultBlock;

    this.clientId = clientId || `rivulex:${group}:sub:${Date.now()}`;
    this.group = group;

    this.redis = redis;
    this.logger = logger;
    this.channelsHandlers = new Map()
  }

  /**
   * Create new group or join to existing one.
   */
  private createGroup = async () => {
    for (const channel of [...this.channelsHandlers.keys()]) {
      this.redis.xgroup('CREATE', channel, this.group, '0', 'MKSTREAM', (err) => {
        if (err) {
          if (err.message.includes('BUSYGROUP')) {
            this.logger.log(`Group ${this.group} already exists at stream ${channel}.`);
          } else {
            throw err;
          }
        } else {
          this.logger.log(`Group ${this.group} have been created in stream ${channel}.`);
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
  * subscriber.streamAction('users', 'user_created', (event: Event<Payload, Headers<Custom>>, done: Done) => {
  *   // Handle the event
  *   done();
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
  * channel.action('user_created', (event: Event<Payload, Headers<Custom>>, done: Done) => {
  *   // Handle the event
  *   done();
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
        channels: [...this.channelsHandlers.keys()],
        group: this.group,
        retries: this.retries,
        block: this.block,
        count: this.count,
      }, this.redis, this.logger)

      this.failedConsumer = new FailedConsumer({
        clientId: this.clientId,
        channels: [...this.channelsHandlers.keys()],
        group: this.group,
        timeout: this.timeout,
        retries: this.retries,
        count: this.count,
      }, this.redis, this.logger)

      await this.createGroup();

      this.liveConsumer.consume(this.channelsHandlers)
      this.failedConsumer.consume(this.channelsHandlers)

      this.enabled = true
    }
  }
}
