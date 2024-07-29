
import { Retryer } from "../utils";
import { Formatter } from "../formatter/formatter";
import { Event, Ack, RedisClient, Handler, Logger, BaseEvent } from "../types";

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
  private logger: Logger;
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
  constructor({ retries, group }: { retries: number, group: string }, redis: RedisClient, logger: Logger) {
    this.redis = redis;
    this.logger = logger;
    this.group = group;
    this.retries = retries;
    this.formatter = new Formatter()
    this.retry = Retryer(3, 3_000)
  }

  /**
  * Creates a `Ack` function that confirms an event has been processed successfully.
  * 
  * @param {string} streamName - The name of the Redis stream.
  * @param {BaseEvent} baseEvent - The event to be confirmed.
  * 
  * @returns {Ack} - A function that confirms the event.
  */
  private confirmEvent(streamName: string, baseEvent: BaseEvent): Ack {
    return async () => {
      try {
        await this.retry(() => this.redis.xack(streamName, this.group, baseEvent.id))
        this.logger.log(`CONFIRMED stream: ${streamName} action: ${baseEvent.action} id: ${baseEvent.id} attempt: ${baseEvent.attempt}`)
      } catch (error) {
        this.logger.log(`CONFIRMED_FAILED stream: ${streamName} action: ${baseEvent.action} id: ${baseEvent.id} attempt: ${baseEvent.attempt}`)
        this.logger.error(`confirming failed with error: ${error}`)
      }
    }
  }

  /**
  * Skips processing of an event and acknowledges it.
  * 
  * @param {string} streamName - The name of the Redis stream.
  * @param {BaseEvent} baseEvent - The event to be skipped.
  */
  private async skipEvent(streamName: string, baseEvent: BaseEvent) {
    try {
      await this.retry(() => this.redis.xack(streamName, this.group, baseEvent.id))
      this.logger.debug(`SKIPPED stream: ${streamName} action: ${baseEvent.action} id: ${baseEvent.id} attempt: ${baseEvent.attempt}`)
    } catch (error) {
      this.logger.log(`SKIPPED_FAILED stream: ${streamName} action: ${baseEvent.action} id: ${baseEvent.id} attempt: ${baseEvent.attempt}`)
      this.logger.error(`skipping failed with error: ${error}`)
    }
  }


  /**
  * Rejects an event by moving it to the dead-letter stream and acknowledging it.
  * 
  * @param {string} streamName - The name of the Redis stream.
  * @param {Event} event - The event to be rejected.
  */
  private async rejectEvent(streamName: string, baseEvent: BaseEvent) {
    try {
      const rejectedHeaders = {
        ...baseEvent.headers,
        rejected: true,
        rejectedGroup: this.group,
        rejectedTimestamp: new Date().toISOString()
      } as Headers;

      const pipeline = this.redis.pipeline();
      const eventArgs = this.formatter.formatEventForSend(baseEvent.action, baseEvent.payload, rejectedHeaders, this.group);

      pipeline.xadd(this.deadLetter, '*', ...eventArgs);
      pipeline.xack(streamName, this.group, baseEvent.id);

      await this.retry(() => pipeline.exec())
      this.logger.log(`REJECTED stream: ${streamName} action: ${baseEvent.action} id: ${baseEvent.id} attempt: ${baseEvent.attempt}`)
    } catch (error) {
      this.logger.log(`REJECTED_FAILED stream: ${streamName} action: ${baseEvent.action} id: ${baseEvent.id} attempt: ${baseEvent.attempt}`)
      this.logger.error(`rejection failed with error: ${error}`)
    }

  }

  processEvent<P, H>(baseEvent: BaseEvent<P, H>, ack: Ack): Event<P, H> {
    (baseEvent as Event<P, H>).ack = ack;
    return baseEvent as Event<P, H>;
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
  async process<T>(streamName: string, baseEvents: Array<BaseEvent>, actionHandlers: Record<string, Handler>) {
    await Promise.all(
      baseEvents.map(async (baseEvent) => {

        const { headers, action, attempt, id } = baseEvent;
        const { rejected, rejectedGroup } = headers;

        if (rejected && rejectedGroup !== this.group) {
          await this.skipEvent(streamName, baseEvent);
          return;
        }

        const actionHandler = actionHandlers[action];
        if (!actionHandler) {
          await this.skipEvent(streamName, baseEvent);
          return;
        }

        if (attempt >= this.retries) {
          await this.rejectEvent(streamName, baseEvent);
          return;
        }

        const eventWithAck = this.processEvent(baseEvent, this.confirmEvent(streamName, baseEvent));

        try {
          await actionHandler(eventWithAck);
        } catch (error) {
          this.logger.log(`FAILED stream: ${streamName} action: ${action} id: ${id} attempt: ${attempt}`);
        }
      }),
    );
  }
}