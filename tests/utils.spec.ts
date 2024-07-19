import { RawEvent } from '../lib/types';
import { Formatter } from '../lib/formatter/formatter';

describe('Formatter Class', () => {
    const formatter = new Formatter();

    describe('formatEventForSend', () => {
        it('should format an event correctly for sending', () => {
            const action = 'test-action';
            const payload = { key: 'value' };
            const headers = { customHeader: 'headerValue' };
            const group = 'test-group';

            const formatted = formatter.formatEventForSend(action, payload, headers, group);

            expect(formatted).toHaveLength(6)

            expect(formatted[0]).toEqual('action')
            expect(formatted[1]).toEqual(action)

            expect(formatted[2]).toEqual('payload')
            expect(formatted[3]).toEqual(JSON.stringify(payload))

            expect(formatted[4]).toEqual('headers')
            expect(formatted[5]).toBeDefined()
            const parsedHeaders = JSON.parse(formatted[5])

            expect(parsedHeaders.group).toEqual(group)
            expect(parsedHeaders.customHeader).toEqual(headers.customHeader)
            expect(new Date(parsedHeaders.timestamp).toISOString()).toEqual(parsedHeaders.timestamp);

            const timestamp = JSON.parse(formatted[5])['timestamp'];
            expect(new Date(timestamp).toISOString()).toEqual(timestamp);
        });
    });

    describe('parseRawEvent', () => {
        it('should parse a raw event correctly', () => {
            const rawEvent: RawEvent = [
                'event-id',
                ['action', 'test-action', 'payload', '{"key":"value"}', 'headers', '{"timestamp":"2024-07-19T00:00:00.000Z","group":"test-group"}', 'attempt', 1],
                'some-channel',
                12345
            ];

            const parsed = formatter.parseRawEvent(rawEvent);

            expect(parsed).toEqual({
                id: 'event-id',
                action: 'test-action',
                payload: { key: 'value' },
                headers: {
                    timestamp: '2024-07-19T00:00:00.000Z',
                    group: 'test-group'
                },
                attempt: 1,
            });
        });

        it('should handle missing attempt value', () => {
            const rawEvent: RawEvent = [
                'event-id',
                ['action', 'test-action', 'payload', '{"key":"value"}', 'headers', '{"timestamp":"2024-07-19T00:00:00.000Z","group":"test-group"}'],
                'some-channel',
                12345
            ];

            const parsed = formatter.parseRawEvent(rawEvent);

            expect(parsed).toEqual({
                id: 'event-id',
                action: 'test-action',
                payload: { key: 'value' },
                headers: {
                    timestamp: '2024-07-19T00:00:00.000Z',
                    group: 'test-group'
                },
                attempt: 0,
            });
        });
    });

    describe('parseRawEvents', () => {
        it('should parse multiple raw events correctly', () => {
            const rawEvents: Array<RawEvent> = [
                [
                    'event-id-1',
                    ['action', 'test-action-1', 'payload', '{"key1":"value1"}', 'headers', '{"timestamp":"2024-07-19T00:00:00.000Z","group":"test-group"}', 'attempt', 1],
                    'some-channel',
                    12345
                ],
                [
                    'event-id-2',
                    ['action', 'test-action-2', 'payload', '{"key2":"value2"}', 'headers', '{"timestamp":"2024-07-19T00:00:00.000Z","group":"test-group"}', 'attempt', 2],
                    'some-channel',
                    12345
                ]
            ];

            const parsedEvents = formatter.parseRawEvents(rawEvents);

            expect(parsedEvents).toEqual([
                {
                    id: 'event-id-1',
                    action: 'test-action-1',
                    payload: { key1: 'value1' },
                    headers: {
                        timestamp: '2024-07-19T00:00:00.000Z',
                        group: 'test-group'
                    },
                    attempt: 1,
                },
                {
                    id: 'event-id-2',
                    action: 'test-action-2',
                    payload: { key2: 'value2' },
                    headers: {
                        timestamp: '2024-07-19T00:00:00.000Z',
                        group: 'test-group'
                    },
                    attempt: 2,
                }
            ]);
        });
    });
});
