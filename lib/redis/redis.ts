import { Redis as IoRedis } from "ioredis";
import { RedisClient, RedisConfig } from "../types";

export class Redis {
    static connect(config: RedisConfig): RedisClient {
        return new IoRedis(config) as RedisClient
    }
}