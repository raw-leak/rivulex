import { RawEvent } from '../lib/types';
import { Formatter } from '../lib/utils/formatter';

describe('Formatter Class', () => {
    const formatter = new Formatter();

    describe('parseRawEvent', () => {
        it('should parse a raw event correctly', () => {
            const rawEvent: RawEvent = [
                'event-id',
                ['action', 'test-action', 'payload', '{"key":"value"}', 'headers', '{"timestamp":"2024-07-19T00:00:00.000Z","group":"test-group"}', 'attempt', 1],
                'some-channel',
                12345
            ];

            const stream = "stream"

            const parsed = formatter.parseRawEvent(rawEvent, stream);

            expect(parsed).toEqual({
                id: 'event-id',
                action: 'test-action',
                payload: { key: 'value' },
                headers: {
                    timestamp: '2024-07-19T00:00:00.000Z',
                    group: 'test-group'
                },
                stream,
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
            const stream = "stream"

            const parsed = formatter.parseRawEvent(rawEvent, stream);

            expect(parsed).toEqual({
                id: 'event-id',
                action: 'test-action',
                payload: { key: 'value' },
                headers: {
                    timestamp: '2024-07-19T00:00:00.000Z',
                    group: 'test-group'
                },
                stream,
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
            const stream = "stream"
            const parsedEvents = formatter.parseRawEvents(rawEvents, stream);

            expect(parsedEvents).toEqual([
                {
                    id: 'event-id-1',
                    action: 'test-action-1',
                    payload: { key1: 'value1' },
                    headers: {
                        timestamp: '2024-07-19T00:00:00.000Z',
                        group: 'test-group'
                    },
                    stream,
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
                    stream,
                    attempt: 2,
                }
            ]);
        });
    });
});
