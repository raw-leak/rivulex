import { Channel } from '../channel/channel';
import { SubscriberConfig } from '../config/subscriber-config';
import { Handler, Redis } from '../types';

export class Subscriber {
  private redis: Redis;
  private channels: Map<string, Channel> = new Map();

  constructor(redis: Redis, config: SubscriberConfig) {
    this.redis = redis;
  }

  streamAction(streamName: string, action: string, handler: Handler) {
    let channel = this.channels.get(streamName)
    if (!channel) {
      channel = new Channel();
      this.channels.set(streamName, channel);
    }

    channel.action(action, handler)
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
