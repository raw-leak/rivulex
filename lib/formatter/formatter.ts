import { Event, Headers, RawEvent } from "../types";

export class Formatter {
    formatEventForSend<P extends Record<any, any>, H extends Record<any, any>>(action: string, payload: P, headers: H, group: string): Array<string> {
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

    parseRawEvents(rawEvents: Array<RawEvent>): Array<Event> {
        return rawEvents.map(rawEvent => this.parseRawEvent(rawEvent));
    }

    parseRawEvent<P = Record<any, any>, H = Record<any, any>>(rawEvent: RawEvent): Event<P, H> {
        const [id, [, action, , payload, , headers, , attempt = 0]] = rawEvent;

        return {
            id,
            action,
            payload: JSON.parse(payload),
            headers: JSON.parse(headers),
            attempt,
        } as Event<P, H>;
    }
}
