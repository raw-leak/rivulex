import { Redis as IoRedis } from 'ioredis'; // Import ioredis as IoRedis
import { Redis } from '../../lib/redis/redis'; // Import your Redis class



describe('Redis class', () => {
    let redisClient;

    afterEach(() => {
        jest.resetAllMocks(); // Clear any mocks after each test
    });

    afterEach((done) => {
        if (redisClient) {
            redisClient.quit(done)
        } else {
            done()
        }
    })

    it('should create an instance of IoRedis with the provided config and ping-pong', async () => {
        const mockConfig = { host: 'localhost', port: 6379 };

        // Call the static connect method
        redisClient = Redis.connect(mockConfig);

        // Verify that IoRedis constructor was called with the correct config
        expect(await redisClient.ping()).toEqual("PONG");

        // Verify that the result is an instance of IoRedis
        expect(redisClient).toBeInstanceOf(IoRedis);
    });
});
