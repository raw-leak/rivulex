
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

-  [Installation](#installation)
-  [Publisher](#publisher)
-  [Subscriber](#subscriber)
-  [Event Interface](#event-interface)
-  [Acknowledgment and Timeouts](#acknowledgment-and-timeouts)
-  [Examples](#examples)
-  [API Reference](#api-reference)
-  [Contributing](#contributing)
-  [License](#license)

## Installation
To install Rivulex, use npm:

```bash
npm install rivulex
```

## Publisher

The `Publisher` class is responsible for sending events to Redis streams. It supports configuration for success and error callbacks, making it flexible for various use cases.

### Configuration Parameters

When creating a `Publisher` instance, you need to provide a configuration object with the following parameters:

| **Parameter**          | **Description**                                                                 | **Required** | **Default Value**                          |
|------------------------|---------------------------------------------------------------------------------|--------------|--------------------------------------------|
| `channel`              | The Redis stream channel to publish events to.                                  | Yes          | -                                          |
| `group`                | The consumer group to associate with the events.                                | Yes          | -                                          |
| `onMessagePublished`   | Callback function called when an event is successfully published.               | No           | Uses default callback if not provided.     |
| `onPublishFailed`      | Callback function called when publishing an event fails.                        | No           | Uses default callback if not provided.     |

### Example Configuration Parameters

```ts
const publisherConfig: PublisherConfig = {
    channel: 'my-channel',
    group: 'my-group',
    onMessagePublished: (data) => {
        console.log(`Message published successfully: ${data.id}`);
    },
    onPublishFailed: (data) => {
        console.error(`Failed to publish message: ${data.error}`);
    }
};
```

### Usage

```typescript
import { Rivulex } from 'rivulex';

const config = {
    channel: 'users',
    group: 'api-users',
    onMessagePublished: (data) => {
        console.log('Message published:', data);
    },
    onPublishFailed: (data) => {
        console.error('Publish failed:', data);
    }
};

const publisher = Rivulex.publisher(config);

// Example: Publishing an event
publisher.publish('user_created', { id: "123", email: "user@email.com" }, { requestId: '123' });
```

## Subscriber

The `Subscriber` class listens to Redis streams and processes events. It supports configurations for timeouts, blocking behavior, and retry strategies.

### Configuration Parameters

When creating a Subscriber instance, you need to provide a configuration object with the following parameters:

| **Parameter**   | **Description** | **Required** | **Default Value** | **Minimum Value** | **Maximum Value** |
|-----------------|-----------------|--------------|-------------------|-------------------|-------------------|
| `clientId`      | The unique identifier for the subscriber. If not provided, a default value is generated. | No           | `rivulex:{group}:sub:{Date.now()}` | - | - |
| `group`         | The group name for the subscriber. Subscribers with the same group name share the workload. | Yes          | -                 | - | - |
| `ackTimeout`    | The maximum time (in milliseconds) to wait for an event before retrying. | No           | `30_000` ms (30 seconds) | `1_000` ms (1 second) | - |
| `processTimeout`| The maximum time (in milliseconds) allowed for the handler to process each event. | No           | `200` ms | `20` ms  | - |
| `fetchBatchSize`| The maximum number of events fetched in each request from Redis Stream. | No           | `100`                 | `1` | - |
| `blockTime`     | The time (in milliseconds) that the subscriber blocks while waiting for new events. | No           | `30_000` ms (30 seconds) | `1_000` ms (1 second)| - |
| `retries`       | The number of times the subscriber will attempt to process an event before sending it to the dead letter queue. | No           | `3`| `1` | - |

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

// you can also register directly handlers directly for stream and action
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
## Event Interface

The Event interface in Rivulex is used to represent events that are passed through the system. It provides a structure for the event's data and metadata.

### Interface Definition
```ts
export interface Event<P = any, H = any> {
    id: string;
    action: string;
    channel: string;
    attempt: number;
    headers: Headers<H>;
    payload: P;
}
```
### Properties

- `id: string`: A unique identifier for the event. Think of it as an ID badge for tracking the event.

- `action: string`: Describes what should be done with the event. This could be something like "order_created" or` "email_sent".

- `channel: string`: The channel or topic where the event was published. This helps in organizing and routing events.

- `attempt: number`: The number of times the event has been tried. Useful for retrying or tracking the event’s processing.

- `headers: Headers<H>`: Extra information about the event. For example, it could include metadata like the event's source or priority. You can customize what these headers contain.

- `payload: P`: The main data of the event. This is what the event is carrying. For example, if the event is about a new order, the payload might include order details.


## Acknowledgment and Timeouts
In `nestjs-rivulex`, acknowledging processed events is a critical step to ensure the reliability and efficiency of your event-driven system. When an event is received and processed by a handler, you must acknowledge the event to indicate its successful processing. Failing to acknowledge an event will result in the event being considered as unprocessed, and it may be picked up by other consumers for reprocessing.

<details>
<summary>More on Acknowledgment and Timeouts</summary>

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

See the [Getting Started](#getting-started) section for basic usage examples. Additional examples can be found in the `examples/` directory.

## API Reference

### Rivulex

- **`Rivulex.publisher(config: PublisherConfig, logger?: Console): Publisher`**: Creates a new instance of the `Publisher` class.

- **`Rivulex.subscriber(config: SubscriberConfig, logger?: Console): Subscriber`**: Creates a new instance of the `Subscriber` class.

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