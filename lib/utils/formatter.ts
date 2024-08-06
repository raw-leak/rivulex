import { BaseEvent, Headers, NewEvent, RawEvent, SentEvent } from "../types";

/**
 * The `Formatter` class is responsible for converting events to and from
 * Redis stream format. It provides methods to format events for sending
 * and to parse raw events received from Redis.
 */
export class Formatter {

    /**
    * Formats an event for sending to Redis.
    * 
    * @param {string} action - The action associated with the event.
    * @param {P} payload - The payload of the event. Type `P` represents the payload structure.
    * @param {H} headers - Custom headers for the event. Type `H` represents the header structure.
    * @param {string} group - The consumer group name.
    * 
    * @returns {Array<string>} - The formatted event as an array of strings for Redis streams XADD command.
    * 
    * @template P - The type of the payload.
    * @template H - The type of the headers.
    */
    formatEventForSend<P extends Record<any, any>, H extends Record<any, any>>(action: string, payload: P, headers: H, group: string): SentEvent {
        return [
            "action", action,
            "payload", JSON.stringify(payload),
            "headers", JSON.stringify({
                ...headers,
                timestamp: new Date().toISOString(),
                group: group
            } as Headers<H>),
        ];
    }

    getSentEvent<P, H>(newEvent: NewEvent): SentEvent {
        return [
            "action", newEvent.action,
            "payload", JSON.stringify(newEvent.payload),
            "headers", JSON.stringify(newEvent.headers),
        ];
    }

    getNewEvent<P, H>(streamName: string, group: string, action: string, payload: P, headers: H): NewEvent<P, H> {
        return {
            action,
            stream: streamName,
            payload,
            headers: {
                ...headers,
                timestamp: new Date().toISOString(),
                group: group
            } as Headers<H>
        }
    }

    /**
    * Parses an array of raw events from Redis into structured `Event` objects.
    * 
    * @param {Array<RawEvent>} rawEvents - The raw events retrieved from Redis.
    * 
    * @returns {Array<BaseEvent>} - An array of parsed `BaseEvent` objects.
    * 
    * @template P - The type of the payload.
    * @template H - The type of the headers.
    */
    parseRawEvents(rawEvents: Array<RawEvent>, channel: string): Array<BaseEvent> {
        return rawEvents.map(rawEvent => this.parseRawEvent(rawEvent, channel));
    }


    /**
    * Parses a single raw event from Redis into a structured `Event` object.
    * 
    * @param {RawEvent} rawEvent - A raw event in tuple format from Redis.
    * 
    * @returns {Event<P, H>} - A structured `Event` object with parsed data.
    * 
    * @template P - The type of the payload.
    * @template H - The type of the headers.
    */
    parseRawEvent<P = Record<any, any>, H = Record<any, any>>(rawEvent: RawEvent, stream: string): BaseEvent<P, H> {
        const [id, [, action, , payload, , headers, , attempt = 0]] = rawEvent;

        return {
            id,
            action,
            payload: JSON.parse(payload),
            headers: JSON.parse(headers),
            attempt,
            stream,
        } as BaseEvent<P, H>;
    }
}
