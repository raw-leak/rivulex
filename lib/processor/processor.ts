import EventEmitter from 'node:events';
import { PromisePool } from '@supercharge/promise-pool'

import { Retrier } from "../utils/retrier";
import { Formatter } from "../utils/formatter";
import { Event, Ack, RedisClient, Handler, Logger, BaseEvent } from "../types";
import { CustomLog } from '../config/subscriber.config';

import { CONFIRMED_HOOK, REJECTED_HOOK, FAILED_HOOK, TIMEOUT_HOOK } from '../constants';
import { CONFIRMED_STATUS, REJECTED_STATUS, TIMEOUT_STATUS, FAILED_STATUS } from '../constants';
import { RETRY, RETRY_BACKOFF_TIME, DEAD_LETTER } from '../constants';

/**
* Configuration object for the `Processor` class.
* @interface
*/
export interface ProcessorConfig {
  /** @type {SubscriberConfig['group']} */
  group: string;

  /** @type {SubscriberConfig['retries']} */
  retries: number;

  /** @type {SubscriberConfig['processTimeout']} */
  processTimeout: number;

  /** @type {SubscriberConfig['processConcurrency']} */
  processConcurrency: number;

  /** @type {SubscriberConfig['customEventConfirmedLog']} */
  customEventConfirmedLog?: CustomLog<any, any>;

  /** @type {SubscriberConfig['customEventRejectedLog']} */
  customEventRejectedLog?: CustomLog<any, any>;

  /** @type {SubscriberConfig['customEventTimeoutLog']} */
  customEventTimeoutLog?: CustomLog<any, any>;

  /** @type {SubscriberConfig['customEventFailedLog']} */
  customEventFailedLog?: CustomLog<any, any>;

}

/**
* The `Processor` class is responsible for handling events from Redis streams.
* It includes methods to confirm, skip, and reject events, and to process
* events according to provided handlers and retry logic.
*/
export class Processor {
  private retries: number;
  private group: string;
  private processTimeout: number
  private processConcurrency: number

  private retrier: Retrier;
  private logger: Logger;
  private formatter: Formatter;
  private redis: RedisClient;
  private eventEmitter: EventEmitter;

  /**
   * Log invoked upon successful message confirmation.
   */
  private eventConfirmedLog: CustomLog<any, any>;

  /**
   * Log invoked when an event is rejected to the dead-letter queue.
   */
  private eventRejectedLog: CustomLog<any, any>;

  /**
   * Log invoked when an event times out without being processed.
   */
  private eventTimeoutLog: CustomLog<any, any>;

  /**
   * Log invoked when an event fails during processing.
   */
  private eventFailedLog: CustomLog<any, any>;


  /**
  * Creates a new `Processor` instance.
  * 
  * @param {Object} config - The configuration object.
  * @param {RedisClient} redis - The Redis client for interacting with Redis.
  * @param {Console} logger - The logger for logging information and errors.
  * @param {EventEmitter} eventEmitter - Event emitter for hooks handling.
  */
  constructor(config: ProcessorConfig, redis: RedisClient, logger: Logger, eventEmitter: EventEmitter) {
    const { group, retries, processTimeout, processConcurrency } = config
    const { customEventConfirmedLog, customEventRejectedLog, customEventTimeoutLog, customEventFailedLog } = config

    this.group = group;
    this.retries = retries;
    this.processTimeout = processTimeout;
    this.processConcurrency = processConcurrency;

    this.redis = redis;
    this.logger = logger;

    this.eventConfirmedLog = customEventConfirmedLog || this.defaultEventConfirmedLog;
    this.eventRejectedLog = customEventRejectedLog || this.defaultEventRejectedLog;
    this.eventTimeoutLog = customEventTimeoutLog || this.defaultEventTimeoutLog;
    this.eventFailedLog = customEventFailedLog || this.defaultEventFailedLog;

    this.eventEmitter = eventEmitter;
    this.formatter = new Formatter();
    this.retrier = new Retrier(RETRY, RETRY_BACKOFF_TIME);
  }

  private defaultEventConfirmedLog<P, H>(event: BaseEvent<P, H>): string {
    return JSON.stringify({ type: "event", status: CONFIRMED_STATUS, id: event.id, stream: event.stream, action: event.action, timestamp: Date.now() })
  };

  private defaultEventRejectedLog<P, H>(event: BaseEvent<P, H>): string {
    return JSON.stringify({ type: "event", status: REJECTED_STATUS, id: event.id, stream: event.stream, action: event.action, timestamp: Date.now() })
  };

  private defaultEventTimeoutLog<P, H>(event: BaseEvent<P, H>): string {
    return JSON.stringify({ type: "event", status: TIMEOUT_STATUS, id: event.id, stream: event.stream, action: event.action, timestamp: Date.now() })
  };

  private defaultEventFailedLog<P, H>(event: BaseEvent<P, H>): string {
    return JSON.stringify({ type: "event", status: FAILED_STATUS, id: event.id, stream: event.stream, action: event.action, timestamp: Date.now() })
  };

  /**
   * Handles successful event confirmation.
   */
  private onEventConfirmed<P, H>(baseEvent: BaseEvent<P, H>) {
    this.logger.log(this.eventConfirmedLog(baseEvent))
    this.eventEmitter.emit(CONFIRMED_HOOK, baseEvent);
  };

  /**
   * Handles event rejection.
   */
  private onEventRejected<P, H>(baseEvent: BaseEvent<P, H>, error?: Error) {
    this.logger.log(this.eventRejectedLog(baseEvent, error))
    this.eventEmitter.emit(REJECTED_HOOK, baseEvent, error);
  };

  /**
   * Handles event timeout.
   */
  private onEventTimeout<P, H>(baseEvent: BaseEvent<P, H>) {
    this.logger.log(this.eventTimeoutLog(baseEvent))
    this.eventEmitter.emit(TIMEOUT_HOOK, baseEvent);
  };

  /**
   * Handles event failure.
   */
  private onEventFailed<P, H>(baseEvent: BaseEvent<P, H>, error: Error) {
    this.logger.log(this.eventFailedLog(baseEvent, error))
    this.eventEmitter.emit(FAILED_HOOK, baseEvent, error);
  };

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
        this.onEventConfirmed(baseEvent)
      } catch (error) {
        this.logger.error(`Failed to confirm event with ID ${baseEvent.id} in stream ${streamName} after processing. Error: ${error}`, { error, eventId: baseEvent.id, streamName, group: this.group });
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
    } catch (error) {
      this.logger.error(`Failed to skip event with ID ${baseEvent.id} in stream ${streamName} after processing. Error: ${error}`, { error, eventId: baseEvent.id, streamName, group: this.group });
    }
  }

  /**
  * Rejects an event by moving it to the dead-letter stream and acknowledging it.
  * 
  * @param {string} streamName - The name of the Redis stream.
  * @param {Event} event - The event to be rejected.
  */
  private async rejectEvent(streamName: string, baseEvent: BaseEvent, error?: Error) {
    try {
      const rejectedHeaders = {
        ...baseEvent.headers,
        rejected: true,
        rejectedGroup: this.group,
        rejectedTimestamp: new Date().toISOString()
      } as Headers;

      const pipeline = this.redis.pipeline();
      const newEvent = this.formatter.getNewEvent(streamName, this.group, baseEvent.action, baseEvent.payload, rejectedHeaders);
      const newEventArgs = this.formatter.getSentEvent(newEvent);

      pipeline.xadd(DEAD_LETTER, '*', ...newEventArgs);
      pipeline.xack(streamName, this.group, baseEvent.id);

      await this.retrier.retry(() => pipeline.exec())

      this.onEventRejected(baseEvent, error)
    } catch (error) {
      this.logger.error(`Failed to reject event with ID ${baseEvent.id} in stream ${streamName} after processing. Error: ${error}`, { error, eventId: baseEvent.id, streamName, group: this.group });
    }

  }

  private addAck<P, H>(baseEvent: BaseEvent<P, H>, ack: Ack): Event<P, H> {
    (baseEvent as Event<P, H>).ack = ack;
    return baseEvent as Event<P, H>;
  }

  /**
  * Processes a batch of events from a Redis stream.
  * 
  * @param {string} streamName - The name of the Redis stream.
  * @param {Array<Event>} events - The events to be processed.
  * @param {Record<string, Handler>} actionHandlers - The handlers for processing events based on action.
  */
  async process(streamName: string, baseEvents: Array<BaseEvent>, actionHandlers: Record<string, Handler>) {
    await PromisePool
      .withConcurrency(this.processConcurrency)
      .withTaskTimeout(this.processTimeout)
      .for<BaseEvent>(baseEvents)
      .handleError((error, baseEvent) => {
        if (error.name == "PromisePoolError") {
          this.onEventTimeout(baseEvent)
        } else {
          this.onEventFailed(baseEvent, error)
        }
      })
      .process((baseEvent) => this.processUnit(streamName, baseEvent, actionHandlers))
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
      this.onEventFailed(baseEvent, error as Error);

      if (this.hasToBeRejected(attempt + 1)) {
        await this.rejectEvent(streamName, baseEvent, error as Error);
      }
    }
  }

  private hasToBeRejected(attempt: number): boolean {
    return attempt >= this.retries
  }
}