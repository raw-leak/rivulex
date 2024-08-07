
<div align="center">
  <h1>Rivulex [in-progress]</h1>
  
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Last Tag](https://img.shields.io/github/v/tag/raw-leak/rivulex?label=Last%20Tag)
![Version](https://img.shields.io/github/v/release/raw-leak/rivulex)
![Contributors](https://img.shields.io/github/contributors/raw-leak/rivulex)
![Version](https://img.shields.io/npm/v/nestjs-rivulex)

</div>

Rivulex is a high-performance messaging system built on Redis Streams and written in pure JavaScript. Designed to ensure at-least-once delivery guarantees, Rivulex is ideal for distributed systems and applications that require robust, reliable messaging and event handling.


### Key Features:
- **At-Least-Once Delivery**: Rivulex ensures that every event is delivered at-least-once, making it suitable for scenarios where event loss is unacceptable.
- **FIFO Messaging**: Leveraging Redis Streams, Rivulex provides a FIFO (First-In-First-Out) order for event processing, ensuring predictable and reliable event handling.
- **Distributed and Scalable**: Built to handle horizontal scaling, Rivulex supports the creation of consumer groups, allowing you to efficiently scale out your messaging system across multiple instances.
- **Flexible Configuration**: Easily configure timeouts, blocking behavior, retries, and more to tailor the system to your specific needs.
- **Error Handling and Logging**: Integrates customizable error handling and logging, providing insights into event processing and failures.

### Use Cases:
- **Event-Driven Architectures**: Perfect for building systems that rely on events and need reliable event delivery.
- **Microservices**: Facilitates communication between microservices in distributed systems.
- **Real-Time Data Processing**: Suitable for applications that require real-time processing and streaming of data.

With Rivulex, you can build scalable, reliable, and efficient messaging systems that are well-suited for modern distributed environments.

## Table of Contents

- [Installation](#installation)
- [Publisher](#publisher)
  - [Configuration Parameters](#configuration-parameters)
  - [Example Configuration Parameters](#example-configuration-parameters)
  - [Usage](#usage)
  - [Hooks](#hooks)
  - [Integration with Trimmer](#integration-with-trimmer)
- [Subscriber](#subscriber)
  - [Configuration Parameters](#configuration-parameters-1)
  - [Example Configuration Parameters](#example-configuration-parameters-1)
  - [Usage](#usage-1)
  - [Integration with Trimmer](#integration-with-trimmer-1)
- [Event Interface](#event-interface)
- [Trimmer](#trimmer)
  - [Configuration Parameters](#configuration-parameters-2)
  - [Example Configuration Parameters](#example-configuration-parameters-2)
  - [Usage](#usage-2)
  - [Internals](#internals)
  - [Integration with Publisher and Subscriber](#integration-with-publisher-and-subscriber)
- [Acknowledgment and Timeouts](#acknowledgment-and-timeouts)
- [Examples](#examples)
- [API Reference](#api-reference)
- [Contributing](#contributing)
- [License](#license)

## Installation
To install Rivulex, use npm:

```bash
npm install rivulex
```

## Publisher

The `Publisher` class is responsible for sending events to Redis streams. It supports configuration for success and error callbacks, making it flexible for various use cases.

<details>
<summary>Read more on Publisher</summary>

### Configuration Parameters

When creating a `Publisher` instance, you need to provide a configuration object with the following parameters:

| **Parameter**                  | **Description**                                                                         | **Required** | **Default Value**                          |
|--------------------------------|-----------------------------------------------------------------------------------------|--------------|--------------------------------------------|
| `defaultStream`                | The Redis stream channel to publish events to.                                          | Yes          | -                                          |
| `group`                        | The consumer group to associate with the events.                                        | Yes          | -                                          |
| `onEventPublishSucceededLog`   | Callback to customize log message to invoked when a message is successfully published.  | No           | Uses default callback if not provided.     |
| `onEventPublishFailedLog`      | Callback to customize log message invoked when publishing fails.                        | No           | Uses default callback if not provided.     |

### Example Configuration Parameters

```ts
const publisherConfig: PublisherConfig = {
    channel: 'my-channel',
    group: 'my-group',
    onEventPublishSucceededLog: (id: string, data: NewEvent) => `Message published successfully: ${data.id}`,
    onEventPublishFailedLog: (data: NewEvent, error: Error) => `Failed to publish message: ${data.error}`
};
```

### Usage

```typescript
import { Rivulex } from 'rivulex';

const config = {
    defaultStream: 'users',
    group: 'api-users',
};

const publisher = Rivulex.publisher(config);

// Example: Publishing an event to a default stream
publisher.publish('user_created', { id: "123", email: "user@email.com" }, { requestId: '123' });


    const res = await publisher.publishBatch([
        // sending to a default stream
        { stream: "specific_stream", action: "user_created", payload: { id: "1", email: "user1@email.com" }, headers: { traceId: "111" } },

        // sending to a default stream
        { action: "user_created", payload: { id: "2", email: "user2@email.com" }, headers: { traceId: "222" } },

        // sending to a default stream
        { action: "user_created", payload: { id: "3", email: "user3@email.com" }, headers: { traceId: "333" } },
    ])
```

</details>

## Subscriber

The `Subscriber` class listens to Redis streams and processes events. It supports configurations for timeouts, blocking behavior, and retry strategies.

<details>
<summary>Read more on Subscriber</summary>

### Configuration Parameters

When creating a Subscriber instance, you need to provide a configuration object with the following parameters:

| **Parameter**       | **Description** | **Required** | **Default Value** | **Minimum Value** | **Maximum Value** |
|---------------------|-----------------|--------------|-------------------|-------------------|-------------------|
| `clientId`          | The unique identifier for the subscriber. If not provided, a default value is generated. | No           | `rivulex:{group}:sub:{Date.now()}` | - | - |
| `group`             | The group name for the subscriber. Subscribers with the same group name share the workload. | Yes          | -                 | - | - |
| `ackTimeout`        | The maximum time (in milliseconds) to wait for an event before retrying. | No           | `30_000`ms | `1_000` ms | - |
| `processTimeout`    | The maximum time (in milliseconds) allowed for the handler to process each event. | No           | `200` ms | `20`ms  | - |
| `processConcurrency`| The maximum number of events to process concurrently at a time. | No           | `100` | `1`  | - |
| `fetchBatchSize`    | The maximum number of events fetched in each request from Redis Stream. | No           | `100`                 | `1` | - |
| `blockTime`         | The time (in milliseconds) that the subscriber blocks while waiting for new events. | No           | `30_000`ms | `1_000`ms| - |
| `retries`           | The number of times the subscriber will attempt to process an event before sending it to the dead letter queue. | No           | `3`| `1` | - |

### Example Configuration Parameters

```ts
const subscriberConfig: SubscriberConfig = {
    clientId: 'my-subscriber-id',
    group: 'my-group',
    ackTimeout: 5000, // 5 seconds
    fetchBatchSize: 100,
    blockTime: 15000, // 15 seconds
    retries: 5
};
```

### Usage

```typescript
const config = {
    group: 'my-group',
    ackTimeout: 60000,
    fetchBatchSize: 20,
    blockTime: 2000,
    retries: 3
};

const subscriber = Rivulex.subscriber(config);

// register a channel subscribed to a specific Redis Stream
const userChannel = subscriber.stream('users')

// register handlers for multiple actions
userChannel
    .action('user_created', (event:Event<UserCreatedPayload, CustomHeaders>, done: Done) => {
        // process
        await done();
    })
    .action('user_deleted', (event:Event<UserDeletedPayload, CustomHeaders>, done: Done) => {
        // process
        await done();
    });

// you can also register directly handlers for stream and action
subscriber.streamAction('users','user_suspended', (event:Event<UserSuspendedPayload, CustomHeaders>, done: Done) => {
    // process
    await done();
})

// register another channel subscribed to a specific Redis Stream
subscriber.stream('another-channel')
    .action('another_action', (event:Event<AnotherPayload, CustomHeaders>, done: Done) => {
        // process
        await done();
    });

// start listening for events
await subscriber.listen()

// stop listening for events
await subscriber.stop()
```

</details>

## Event Interface

The Event interface in Rivulex is used to represent events that are passed through the system. It provides a structure for the event's data and metadata.

<details>
<summary>Read more on Event Interface</summary>

### Interface Definition
```ts
export interface Event<P = any, H = any> {
    id: string;
    action: string;
    stream: string;
    attempt: number;
    headers: Headers<H>;
    payload: P;
}
```
### Properties

- `id: string`: A unique identifier for the event. Think of it as an ID badge for tracking the event.

- `action: string`: Describes what should be done with the event. This could be something like "order_created" or` "email_sent".

- `stream: string`: The stream where the event was published. This helps in organizing and routing events.

- `attempt: number`: The number of times the event has been tried. Useful for retrying or tracking the event’s processing.

- `headers: Headers<H>`: Extra information about the event. For example, it could include metadata like the event's source or priority. You can customize what these headers contain.

- `payload: P`: The main data of the event. This is what the event is carrying. For example, if the event is about a new order, the payload might include order details.

</details>

## Trimmer

The `Trimmer` class is responsible for managing the trimming of old messages from Redis streams. It ensures that messages older than a specified retention period are removed at regular intervals. The trimming process is distributed and coordinated using Redis to avoid conflicts between multiple instances.

<details>
<summary>Read more on Trimmer</summary>

### Configuration Parameters

When creating a `Trimmer` instance, you need to provide a configuration object with the following parameters:

| **Parameter**       | **Description**                                                                               | **Required** | **Default Value**                            | **Minimum Value** | **Maximum Value** |
|---------------------|-----------------------------------------------------------------------------------------------|--------------|----------------------------------------------|-------------------|-------------------|
| `streams`           | The list of Redis streams to trim.                                                            | Yes          | -                                            | -                 | -                 |
| `group`             | The consumer group associated with the trimming operations.                                   | Yes          | -                                            | -                 | -                 |
| `clientId`          | The unique identifier for the trimmer instance. If not provided, a default value is generated. | No           | `rivulex:{group}:trimmer:{Date.now()}`       | -                 | -                 |
| `intervalTime`      | The interval time (in milliseconds) between trim operations.                                  | No           | `172_800_000` ms (48 hours)                  | `10_000` ms       | -                 |
| `retentionPeriod`   | The retention period (in milliseconds) for messages in the stream.                            | No           | `172_800_000` ms (48 hours)                  | `10_000` ms       | -                 |

### Example Configuration Parameters

```typescript
const trimmerConfig: TrimmerConfig = {
    channels: ['my-channel'],
    group: 'my-group',
    intervalTime: 86400000, // 24 hours
    retentionPeriod: 2592000000, // 30 days
};
```

### Usage

```typescript
import { Logger } from '@nestjs/common';
import { Rivulex } from 'rivulex';

const config = {
    redis: { host: 'localhost', port: 6379 },
    streams: ['users', 'orders'],
    group: 'api-group',
    intervalTime: 43200000, // 12 hours
    retentionPeriod: 604800000, // 7 days
};

const logger = new Logger('Trimmer');

const trimmer = new Rivulex.trimmer(config, , logger);

// Start the trimming process
await trimmer.start();

// Stop the trimming process
trimmer.stop();
```

In this example, the `Trimmer` class is initialized with a configuration object that specifies the channels to trim, the consumer group, the interval time between trim operations, and the retention period for messages. The `start` method initiates the trimming process, and the `stop` method halts it.

### Internals
The Trimmer class implements several internal mechanisms to manage and optimize the trimming process:

- **Distributed Coordination**: The trimming process is designed to be distributed and coordinated using Redis. This ensures that multiple instances of the Trimmer can operate without conflicting with each other.

- **Randomized Interval**: Instead of trimming at a fixed interval, the Trimmer generates a random interval within ±30 seconds of the configured interval time. This helps to avoid multiple instances attempting to trim at the exact same time, reducing the likelihood of conflicts. Although the probability of conflict is very low, this approach minimizes it further, and any potential conflicts have negligible impact.

- **Initial Delay**: When the Trimmer starts, it introduces an initial delay between 1 and 10 seconds. This staggered start helps prevent multiple instances that start simultaneously from all attempting to trim immediately, further reducing the likelihood of conflicts.


### Integration with Publisher and Subscriber
The Trimmer can be integrated directly with the Publisher and Subscriber classes, allowing you to manage the trimming of old messages as part of your event publishing or subscribing process.

#### Publisher Integration
You can configure the Trimmer to be initiated with the Publisher. This ensures that old messages are automatically trimmed while publishing events.

Example:
```js
import { Rivulex } from 'rivulex';

const publisherConfig = {
    // ...
    trimmer: {
        streams: ['users'],
        group: 'api-group',
        intervalTime: 86400000, // 24 hours
        retentionPeriod: 604800000, // 7 days
    }
};

const publisher = Rivulex.publisher(publisherConfig);
```

In this example, the `Trimmer` is configured as part of the `Publisher` configuration. When the Publisher starts, it also starts the trimming process for the specified channels.

#### Subscriber Integration
Similarly, you can configure the Trimmer to be initiated with the Subscriber. This ensures that old messages are automatically trimmed while subscribing to events.

Example:
```js
import { Rivulex } from 'rivulex';

const subscriberConfig = {
    // ...
    trimmer: {
        streams: ['users'],
        group: 'api-group',
        intervalTime: 43200000, // 12 hours
        retentionPeriod: 604800000, // 7 days
    }
};

const subscriber = Rivulex.subscriber(subscriberConfig);

// ...

await subscriber.listen();
```
In this example, the `Trimmer` is configured as part of the `Subscriber` configuration. When the Subscriber starts, it also starts the trimming process for the specified channels.

</details>

## Hooks

The Publisher emits internal events that can be handled using hooks. These hooks allow you to execute custom logic when specific internal events occur, such as when an event is successfully published or when an event publishing attempt fails.

<details>
<summary>Read more on Hooks</summary>

### Supported Hooks

- `published`: Triggered when an event is successfully published. The hook receives an object containing the event ID and event data.
- `failed`: Triggered when an event publishing attempt fails. The hook receives an object containing the event data and the error.

### Hook Data Types
- `PublishedHookPayload<P, H>`: The data received by the hook for the `published` hook.
    - `id: string`: The unique identifier of the successfully published event.
    - `event: NewEvent<P, H>`: The event details including stream, group, action, payload, and headers.
- `FailedHookPayload<P, H>`: The data received by the hook for the `failed` hook.
    - `event: NewEvent<P, H>`: The event details that were attempted to be published, including stream, group, action, payload, and headers.
    - `error: Error`: The error that caused the publishing attempt to fail.

### Example
```js
import { Rivulex } from 'rivulex';

const config = {
    defaultStream: 'users',
    group: 'api-users',
};

const publisher = Rivulex.publisher(config);

// Handling the 'published' hook
publisher.on('published', (id, event) => {
    console.log(`Event Published - ID: ${id}, Action: ${event.action}`);
});

// Handling the 'failed' hook
publisher.on('failed', (event, error) => {
    console.error(`Event Publish Failed - Action: ${event.action}, Error: ${error.message}`);
});
```
</details>

## Acknowledgment and Timeouts
In `nestjs-rivulex`, acknowledging processed events is a critical step to ensure the reliability and efficiency of your event-driven system. When an event is received and processed by a handler, you must acknowledge the event to indicate its successful processing. Failing to acknowledge an event will result in the event being considered as unprocessed, and it may be picked up by other consumers for reprocessing.

<details>
<summary>Read more on Acknowledgment and Timeouts</summary>

### How Acknowledgment Works
Each event handler is provided with an ack function, which you must call after successfully processing the event. This function notifies the system that the event has been handled and can be safely removed from the stream.

```typescript
@Action('user_created')
async handleUserCreated(@EventAck() ack: () => void) {
    // Process the event
    // ...

    // Acknowledge the event
    await ack();
}
```

### Handling Timeouts
Each transport layer has a specified `timeout` period within which it must process the event. Immediately after an event is received by a consumer, it remains in the stream. To prevent other consumers from processing the event again, Rivulex sets a timeout, a period of time during which it prevents all consumers from receiving and processing the event. The default visibility timeout for an event is 30 seconds. The minimum is 1 second.

![My Diagram](images/event-life-cycle.png)

### Best Practices for Setting Timeouts
To avoid processing the same event multiple times and to ensure efficient event handling, it's essential to set appropriate timeout periods. Here are some best practices for setting timeouts:

1. **Estimate Processing Time**: Consider the average time required to process an event. The timeout should be set to a value slightly higher than this estimate to account for occasional delays.
2. **Avoid Short Timeouts**: Setting the timeout too short may result in events timing out frequently, causing unnecessary reprocessing and potential duplicate handling. Ensure that the timeout is long enough to cover the worst-case processing time.
3. **Use Consistent Timeout Values**: For similar types of events, use consistent timeout values to simplify configuration and monitoring.
4. **Monitor and Adjust**: Continuously monitor the processing times and adjust the timeout values as necessary. Use metrics and logs to identify patterns and make informed adjustments.

### Recommended Timeout Settings

Based on industry best practices, such as those from AWS SQS, a general recommendation is to set the visibility timeout to at least twice the average processing time. For example, if the average processing time for an event is 5 seconds, set the visibility timeout to at least 10 seconds. This provides a buffer to handle occasional delays and reduces the likelihood of events timing out unnecessarily.

</details>

## Examples

See the examples that can be found in the `examples/` directory.

## API Reference

### Rivulex
- **`Rivulex.publisher(config: PublisherConfig, logger?: Console): Publisher`**: Creates a new instance of the `Publisher` class.
- **`Rivulex.subscriber(config: SubscriberConfig, logger?: Console): Subscriber`**: Creates a new instance of the `Subscriber` class.
- **`Rivulex.trimmer(config: TrimmerConfig, logger?: Console): Subscriber`**: Creates a new instance of the `Trimmer` class.

### Channel
- **`Channel`**: Represents a channel and manages event handlers.

### LiveConsumer
- **`LiveConsumer`**: Consumes live events from Redis streams and processes them.

### FailedConsumer
- **`FailedConsumer`**: Handles events that failed processing and manages retries.

## Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.