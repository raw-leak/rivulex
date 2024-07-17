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

    parseRawEvent(rawEvent: RawEvent): Event {
        const [id, data] = rawEvent;
        const [, action, , payload, , headers] = data;
        return {
            id,
            action,
            payload: JSON.parse(payload),
            headers: JSON.parse(headers),
        } as Event;
    }
}
