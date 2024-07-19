import { Channel } from '../channel/channel';
import { SubscriberConfig } from '../config/subscriber-config';
import { FailedConsumer } from '../consumers/failed.consumer';
import { LiveConsumer } from '../consumers/live.consumer';
import { ChannelsHandlers, Handler, RedisClient } from '../types';

// TODO: doc
export class Subscriber {
  private logger: Console;
  private redis: RedisClient;

  private liveConsumer: LiveConsumer;
  private failedConsumer: FailedConsumer;

  private channelsHandlers: ChannelsHandlers;
  private channels: Array<string>;

  private enabled = false;
  private clientId: string;
  private group: string;
  private timeout: number;
  private count: number;
  private retries: number;
  private block: number;

  readonly defaultBlock = 30 * 60 * 1000; // 30 seconds
  readonly defaultTimeout = 10 * 60 * 60 * 1000; // 10 min
  readonly defaultRetries = 3;
  readonly defaultCount = 100;

  constructor(config: SubscriberConfig, redis: RedisClient, logger: Console) {
    const { clientId, group, timeout, count, retries, block, channels } = config;

    if (!redis) throw new Error('Missing required "redis" parameter');
    if (!group) throw new Error('Missing required "group" parameter');
    if (!channels || !channels.length) throw new Error('Missing required "channels" parameter');

    this.timeout = timeout !== undefined ? timeout : this.defaultTimeout;
    this.count = count !== undefined ? count : this.defaultCount;
    this.retries = retries !== undefined ? retries : this.defaultRetries;
    this.block = block !== undefined ? block : this.defaultBlock;

    this.clientId = clientId || `rivulex:${group}:sub:${Date.now()}`;
    this.group = group;
    this.channels = channels;

    this.redis = redis;
    this.logger = logger;
  }

  /**
   * Create new group or join to existing one.
   */
  private createGroup = async () => {
    for (const channel of this.channels) {
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

  streamAction(streamName: string, action: string, handler: Handler) {
    let channel = this.channelsHandlers.get(streamName)
    if (!channel) {
      channel = new Channel();
      this.channelsHandlers.set(streamName, channel);
    }

    channel.action(action, handler)
  }

  stream(streamName: string): Channel {
    if (!this.channelsHandlers.has(streamName)) {
      const newChannel = new Channel();
      this.channelsHandlers.set(streamName, newChannel);
    }
    return this.channelsHandlers.get(streamName)!;
  }

  async listen() {
    if (!this.enabled) {
      this.liveConsumer = new LiveConsumer({
        clientId: this.clientId,
        channels: this.channels,
        group: this.group,
        retries: this.retries,
        block: this.block,
        count: this.count,
      }, this.redis, this.logger)

      this.failedConsumer = new FailedConsumer({
        clientId: this.clientId,
        channels: this.channels,
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
