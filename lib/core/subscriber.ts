import { Channel } from '../channel/channel';
import { SubscriberConfig } from '../config/subscriber-config';
import { Redis } from '../types';

export class Subscriber {
  private redis: Redis;
  private channels: Map<string, Channel> = new Map();

  constructor(redis: Redis, config: SubscriberConfig) {
    this.redis = redis;
  }

  stream(streamName: string): Channel {
    if (!this.channels.has(streamName)) {
      const newChannel = new Channel();
      this.channels.set(streamName, newChannel);
    }
    return this.channels.get(streamName)!;
  }

  async listen() {

  }
}
