
import pLimit, { LimitFunction } from "p-limit";

import { Retrier } from "../utils/retrier";
import { Formatter } from "../utils/formatter";
import { Event, Ack, RedisClient, Handler, Logger, BaseEvent } from "../types";

/**
* Configuration object for the `Processor` class.
* @interface
*/
export interface ProcessorConfig {
  /** @type {SubscriberConfig['group']} */
  group: string;

  /** @type {SubscriberConfig['retries']} */
  retries: number;

  /** @type {SubscriberConfig['processBatchSize']} */
  processBatchSize: number;

  /** @type {SubscriberConfig['processTimeout']} */
  processTimeout: number;

}

/**
* The `Processor` class is responsible for handling events from Redis streams.
* It includes methods to confirm, skip, and reject events, and to process
* events according to provided handlers and retry logic.
*/
export class Processor {
  private retries: number;
  private group: string;

  private processBatchSize: number
  private processTimeout: number

  readonly deadLetter = 'dead_letter';

  private retrier: Retrier;
  private logger: Logger;
  private limit: LimitFunction;
  private formatter: Formatter;
  private redis: RedisClient;

  private readonly CONFIRMED_STATUS = "CONFIRMED"
  private readonly CONFIRMED_FAILED_STATUS = "CONFIRMED_FAILED"

  private readonly FAILED_STATUS = "FAILED"

  private readonly REJECTED_STATUS = "REJECTED"
  private readonly REJECTED_FAILED_STATUS = "REJECTED_FAILED"

  private readonly SKIPPED_STATUS = "SKIPPED"
  private readonly SKIPPED_FAILED_STATUS = "SKIPPED_FAILED"

  private readonly RETRY = 3
  private readonly RETRY_BACKOFF_TIME = 50



  /**
  * Creates a new `Processor` instance.
  * 
  * @param {Object} config - The configuration object.
  * @param {RedisClient} redis - The Redis client for interacting with Redis.
  * @param {Console} logger - The logger for logging information and errors.
  */
  constructor(config: ProcessorConfig, redis: RedisClient, logger: Logger) {
    const { group, retries, processBatchSize, processTimeout } = config

    this.group = group;
    this.retries = retries;
    this.processBatchSize = processBatchSize;
    this.processTimeout = processTimeout;

    this.redis = redis;
    this.logger = logger;

    this.formatter = new Formatter()
    this.retrier = new Retrier(this.RETRY, this.RETRY_BACKOFF_TIME)
    this.limit = pLimit(this.processBatchSize);
  }

  private log(status: string, streamName: string, baseEvent: BaseEvent, error?: Error) {
    this.logger.log(JSON.stringify({ type: "event", status, id: baseEvent.id, stream: streamName, action: baseEvent.action, attempt: baseEvent.attempt }))
    if (error) {
      this.logger.error(JSON.stringify({ error }))
    }
  }

  /**
  * Creates a `Ack` function that confirms an event has been processed successfully.
  * 
  * @param {string} streamName - The name of the Redis stream.
  * @param {BaseEvent} baseEvent - The event to be confirmed.
  * 
  * @returns {Ack} - A function that confirms the event.
  */
  private ackEvent(streamName: string, baseEvent: BaseEvent): Ack {
    return async () => {
      try {
        await this.retrier.retry(() => this.redis.xack(streamName, this.group, baseEvent.id))
        this.log(this.CONFIRMED_STATUS, streamName, baseEvent)
      } catch (error) {
        this.log(this.CONFIRMED_FAILED_STATUS, streamName, baseEvent, error as Error)
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
      await this.retrier.retry(() => this.redis.xack(streamName, this.group, baseEvent.id))
      this.log(this.SKIPPED_STATUS, streamName, baseEvent)
    } catch (error) {
      this.log(this.SKIPPED_FAILED_STATUS, streamName, baseEvent, error as Error)
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

      await this.retrier.retry(() => pipeline.exec())

      this.log(this.REJECTED_STATUS, streamName, baseEvent)
    } catch (error) {
      this.log(this.REJECTED_FAILED_STATUS, streamName, baseEvent, error as Error)
    }

  }

  private addAck<P, H>(baseEvent: BaseEvent<P, H>, ack: Ack): Event<P, H> {
    (baseEvent as Event<P, H>).ack = ack;
    return baseEvent as Event<P, H>;
  }

  private async withTimeout(promise: Promise<void>, timeout: number) {
    const signal = AbortSignal.timeout(timeout);

    return Promise.race([
      promise,
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Promise timed out')));
      })
    ]);
  }

  /**
  * Processes a batch of events from a Redis stream.
  * 
  * @param {string} streamName - The name of the Redis stream.
  * @param {Array<Event>} events - The events to be processed.
  * @param {Record<string, Handler>} actionHandlers - The handlers for processing events based on action.
  */
  async process(streamName: string, baseEvents: Array<BaseEvent>, actionHandlers: Record<string, Handler>) {
    const tasks = baseEvents.map((baseEvent) =>
      this.limit(() =>
        this.withTimeout(this.processUnit(streamName, baseEvent, actionHandlers), this.processTimeout)
      )
    );

    await Promise.all(tasks)
      .catch(error => {
        this.logger.error(`processing failed with error: ${error}`)
      })
  }


  private async processUnit(streamName: string, baseEvent: BaseEvent, actionHandlers: Record<string, Handler>): Promise<void> {
    const { headers, action, attempt } = baseEvent;
    const { rejected, rejectedGroup } = headers;

    if (rejected && rejectedGroup !== this.group) {
      await this.skipEvent(streamName, baseEvent);
      return;
    }

    // TODO: as "*" (ALL) and "-" (LEFT) handlers
    const actionHandler = actionHandlers[action];
    if (!actionHandler) {
      await this.skipEvent(streamName, baseEvent);
      return;
    }

    if (this.hasToBeRejected(attempt)) {
      await this.rejectEvent(streamName, baseEvent);
      return;
    }

    const eventWithAck = this.addAck(baseEvent, this.ackEvent(streamName, baseEvent));

    try {
      await actionHandler(eventWithAck);
    } catch (error) {
      baseEvent.attempt += 1
      this.log(this.FAILED_STATUS, streamName, baseEvent)

      if (this.hasToBeRejected(attempt)) {
        await this.rejectEvent(streamName, baseEvent);
      }
    }
  }

  private hasToBeRejected(attempt: number): boolean {
    return attempt >= this.retries
  }
}