import Redis from 'ioredis';
import { Publisher } from '../../lib/core/publisher';

describe('Publisher E2E Tests', () => {
    let redisClient: Redis;
    let publisher: Publisher;
    const testChannel = 'test-channel';
    const testGroup = 'test-group';
    let onMessagePublished: jest.Mock;
    let onPublishFailed: jest.Mock;

    const mockLogger = {
        log: jest.fn(),
        error: jest.fn(),
    } as any;

    beforeAll(() => {
        onMessagePublished = jest.fn()
        onPublishFailed = jest.fn()

        redisClient = new Redis();
        publisher = new Publisher(
            {
                channel: testChannel,
                group: testGroup,
                onMessagePublished,
                onPublishFailed,
            },
            redisClient,
            mockLogger
        );
    });

    beforeEach(async () => {
        await redisClient.flushall()
    })

    afterAll(async () => {
        await publisher.stop();
    });

    describe('publish method', () => {
        it('should publish a single event and verify it is stored in Redis', async () => {
            const action = 'test-action';
            const payload = { key: 'value' };
            const headers = { customHeader: 'customHeader' };

            const eventId = await publisher.publish(action, payload, headers);

            const storedEvent = await redisClient.xrange(testChannel, '-', '+');
            expect(storedEvent).toHaveLength(1);

            const [id, fields] = storedEvent[0];
            expect(id).toBe(eventId);

            expect(fields).toHaveLength(6)

            expect(fields[0]).toEqual('action');
            expect(fields[1]).toEqual(action);

            expect(fields[2]).toEqual('payload');
            expect(JSON.parse(fields[3])).toEqual(payload);

            expect(fields[4]).toEqual('headers');
            expect(JSON.parse(fields[5])).toEqual({ ...headers, timestamp: expect.any(String), group: testGroup });

            expect(onMessagePublished).toHaveBeenCalledWith({ id, headers, action, payload, group: testGroup })
            expect(onPublishFailed).not.toHaveBeenCalled()
        });
    });

    describe('publishBatch method', () => {
        it('should publish multiple events and verify they are stored in Redis', async () => {
            const messages = [
                { action: 'action1', payload: { key: 'value1' }, headers: { customHeader: 'customHeader1' } },
                { action: 'action2', payload: { key: 'value2' }, headers: { customHeader: 'customHeader2' } },
                { action: 'action3', payload: { key: 'value3' }, headers: { customHeader: 'customHeader3' } },
            ];

            const results = await publisher.publishBatch(messages);

            expect(results).toHaveLength(3);

            expect(onPublishFailed).not.toHaveBeenCalled()
            messages.forEach((message) => {
                expect(onMessagePublished).toHaveBeenCalledWith({ id: expect.any(String), headers: message.headers, action: message.action, payload: message.payload, group: testGroup })
            });

            const storedEvents = await redisClient.xrange(testChannel, '-', '+');
            expect(storedEvents).toHaveLength(3);

            storedEvents.forEach(([id, fields], index) => {
                const { action, payload, headers } = messages[index];

                expect(fields).toHaveLength(6)

                expect(fields[0]).toEqual('action');
                expect(fields[1]).toEqual(action);

                expect(fields[2]).toEqual('payload');
                expect(JSON.parse(fields[3])).toEqual(payload);

                expect(fields[4]).toEqual('headers');
                expect(JSON.parse(fields[5])).toEqual({ ...headers, timestamp: expect.any(String), group: testGroup });
            });
        });
    });
});
