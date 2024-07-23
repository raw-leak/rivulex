
import { Retryer } from "../utils/utils";
import { Formatter } from "../formatter/formatter";
import { Event, Done, RedisClient, RawEvent, Handler } from "../types";

/**
* The `Processor` class is responsible for handling events from Redis streams.
* It includes methods to confirm, skip, and reject events, and to process
* events according to provided handlers and retry logic.
*/
export class Processor {
  private retries: number;
  private group: string;
  readonly deadLetter = 'dead_letter';
  private redis: RedisClient;
  private logger: Console;
  private formatter: Formatter;
  private retry: (callback: Function) => Promise<any>;


  /**
  * Creates a new `Processor` instance.
  * 
  * @param {Object} config - The configuration object.
  * @param {number} config.retries - The number of retries for processing an event. Default is 3.
  * @param {string} config.group - The consumer group name.
  * @param {RedisClient} redis - The Redis client for interacting with Redis.
  * @param {Console} logger - The logger for logging information and errors.
  */
  constructor({ retries, group }: { retries: number, group: string }, redis: RedisClient, logger: Console) {
    this.redis = redis;
    this.logger = logger;
    this.group = group;
    this.retries = retries || 3;
    this.formatter = new Formatter()
    this.retry = Retryer(3, 3_000)
  }

  /**
  * Creates a `Done` function that confirms an event has been processed successfully.
  * 
  * @param {string} streamName - The name of the Redis stream.
  * @param {Event} event - The event to be confirmed.
  * 
  * @returns {Done} - A function that confirms the event.
  */
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

  /**
  * Skips processing of an event and acknowledges it.
  * 
  * @param {string} streamName - The name of the Redis stream.
  * @param {Event} event - The event to be skipped.
  */
  private async skipEvent(streamName: string, event: Event) {
    try {
      await this.retry(() => this.redis.xack(streamName, this.group, event.id))
      this.logger.info(`SKIPPED stream: ${streamName} action: ${event.action} id: ${event.id} attempt: ${event.attempt}`)
    } catch (error) {
      this.logger.log(`SKIPPED_FAILED stream: ${streamName} action: ${event.action} id: ${event.id} attempt: ${event.attempt}`)
      this.logger.error(`skipping failed with error: ${error}`)
    }
  }


  /**
  * Rejects an event by moving it to the dead-letter stream and acknowledging it.
  * 
  * @param {string} streamName - The name of the Redis stream.
  * @param {Event} event - The event to be rejected.
  */
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


  /**
   * Processes a batch of events from a Redis stream.
  * 
  * @param {string} streamName - The name of the Redis stream.
  * @param {Array<Event>} events - The events to be processed.
  * @param {Record<string, Handler>} actionHandlers - The handlers for processing events based on action.
  * 
  * @template T - The type of the payload in the event.
  */
  async process<T>(streamName: string, events: Array<Event>, actionHandlers: Record<string, Handler>) {
    await Promise.all(
      events.map(async (event) => {

        const isForAnotherGroup = event.headers.rejected && event.headers.rejectedGroup !== this.group;
        if (isForAnotherGroup) {
          await this.skipEvent(streamName, event)
          return
        }

        const actionHandler = actionHandlers[event.action]
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