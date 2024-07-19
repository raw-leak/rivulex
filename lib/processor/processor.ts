
import { Retryer } from "../utils/utils";
import { Formatter } from "../formatter/formatter";
import { Event, Done, RedisClient, RawEvent, Handler } from "../types";

export class Processor {
  private retries: number;
  private group: string;
  readonly deadLetter = 'dead_letter';
  private redis: RedisClient;
  private logger: Console;
  private formatter: Formatter;
  private retry: (callback: Function) => Promise<any>;

  constructor({ retries, group }: { retries: number, group: string }, redis: RedisClient, logger: Console) {
    this.redis = redis;
    this.logger = logger;
    this.group = group;
    this.retries = retries || 3;
    this.formatter = new Formatter()
    this.retry = Retryer(3, 3_000)
  }

  private confirmEvent(streamName: string, event: Event): Done {
    return async () => {
      try {
        await this.retry(() => this.redis.xack(streamName, this.group, event.id))
        this.logger.log(`CONFIRMED stream: ${streamName} action: ${event.action} id: ${event.id} attempt: ${event.attempt}`)
      } catch (error) {
        this.logger.log(`CONFIRMED_FAILED stream: ${streamName} action: ${event.action} id: ${event.id} attempt: ${event.attempt}`)
        this.logger.error(`confirming failed with error: ${error}`)
      }
    }
  }

  private async skipEvent(streamName: string, event: Event) {
    try {
      await this.retry(() => this.redis.xack(streamName, this.group, event.id))
      this.logger.info(`SKIPPED stream: ${streamName} action: ${event.action} id: ${event.id} attempt: ${event.attempt}`)
    } catch (error) {
      this.logger.log(`SKIPPED_FAILED stream: ${streamName} action: ${event.action} id: ${event.id} attempt: ${event.attempt}`)
      this.logger.error(`skipping failed with error: ${error}`)
    }
  }

  private async rejectEvent(streamName: string, event: Event) {
    try {
      const rejectedHeaders = {
        ...event.headers,
        rejected: true,
        rejectedGroup: this.group,
        rejectedTimestamp: new Date().toISOString()
      } as Headers;

      const pipeline = this.redis.pipeline();
      const eventArgs = this.formatter.formatEventForSend(event.action, event.payload, rejectedHeaders, this.group);

      pipeline.xadd(this.deadLetter, '*', ...eventArgs);
      pipeline.xack(streamName, this.group, event.id);

      await this.retry(() => pipeline.exec())
      this.logger.log(`REJECTED stream: ${streamName} action: ${event.action} id: ${event.id} attempt: ${event.attempt}`)
    } catch (error) {
      this.logger.log(`REJECTED_FAILED stream: ${streamName} action: ${event.action} id: ${event.id} attempt: ${event.attempt}`)
      this.logger.error(`rejection failed with error: ${error}`)
    }

  }

  async process<T>(streamName: string, events: Array<Event>, streamHandlers: Record<string, Handler>) {
    await Promise.all(
      events.map(async (event) => {

        const isForAnotherGroup = event.headers.rejected && event.headers.rejectedGroup !== this.group;
        if (isForAnotherGroup) {
          await this.skipEvent(streamName, event)
          return
        }

        const actionHandler = streamHandlers[event.action]
        if (!actionHandler) {
          await this.skipEvent(streamName, event)
          return
        }

        if (event.attempt >= this.retries) {
          await this.rejectEvent(streamName, event)
          return
        }

        try {
          await actionHandler(event, this.confirmEvent(streamName, event))
        } catch (error) {
          this.logger.log(`FAILED stream: ${streamName} action: ${event.action} id: ${event.id} attempt: ${event.attempt}`)
        }
      }),
    );
  }
}