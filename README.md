
<div align="center">
  <h1>Rivulex [in-progress]</h1>
  
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Last Tag](https://img.shields.io/github/v/tag/raw-leak/rivulex?label=Last%20Tag)
![Version](https://img.shields.io/github/v/release/raw-leak/rivulex)
![Contributors](https://img.shields.io/github/contributors/raw-leak/rivulex)

</div>

Rivulex is a high-performance messaging system built on Redis Streams and written in pure JavaScript. Designed to ensure at-least-once delivery guarantees, Rivulex is ideal for distributed systems and applications that require robust, reliable messaging and event handling.


### Key Features:
- **At-Least-Once Delivery**: Rivulex ensures that every message is delivered at least once, making it suitable for scenarios where message loss is unacceptable.
- **FIFO Messaging**: Leveraging Redis Streams, Rivulex provides a FIFO (First-In-First-Out) order for message processing, ensuring predictable and reliable message handling.
- **Distributed and Scalable**: Built to handle horizontal scaling, Rivulex supports the creation of consumer groups, allowing you to efficiently scale out your messaging system across multiple instances.
- **Flexible Configuration**: Easily configure timeouts, blocking behavior, retries, and more to tailor the system to your specific needs.
- **Error Handling and Logging**: Integrates customizable error handling and logging, providing insights into message processing and failures.

### Use Cases:
- **Event-Driven Architectures**: Perfect for building systems that rely on events and need reliable message delivery.
- **Microservices**: Facilitates communication between microservices in distributed systems.
- **Real-Time Data Processing**: Suitable for applications that require real-time processing and streaming of data.

With Rivulex, you can build scalable, reliable, and efficient messaging systems that are well-suited for modern distributed environments.

## Table of Contents

-  [Installation](#installation)
-  [Publisher](#publisher)
-  [Subscriber](#subscriber)
-  [Event Interface](#event-interface)
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
| `channel`              | The Redis stream channel to publish events to.                                   | Yes          | -                                          |
| `group`                | The consumer group to associate with the events.                                 | Yes          | -                                          |
| `onMessagePublished`   | Callback function called when a message is successfully published.               | No           | Uses default callback if not provided.     |
| `onPublishFailed`      | Callback function called when publishing a message fails.                        | No           | Uses default callback if not provided.     |

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

// Example: Publishing a message
publisher.publish('user_created', { id: "123", email: "user@email.com" }, { requestId: '123' });
```

## Subscriber

The `Subscriber` class listens to Redis streams and processes events. It supports configurations for timeouts, blocking behavior, and retry strategies.

### Configuration Parameters

When creating a Subscriber instance, you need to provide a configuration object with the following parameters:

| **Parameter** | **Description** | **Required** | **Default Value** |
|---------------|-----------------|--------------|-------------------|
| `clientId`    | The unique identifier for the subscriber. If not provided, a default value is generated. | No           | `rivulex:{group}:sub:{Date.now()}` |
| `group`       | The group name for the subscriber. Subscribers with the same group name share the workload. | Yes          | -                 |
| `timeout`     | The maximum time in milliseconds to wait for an event before retrying. | No           | `600_000` ms (10 minutes) |
| `count`       | The maximum number of messages fetched in each request from Redis Stream. | No           | `100`                 |
| `block`       | The time in milliseconds that the subscriber blocks while waiting for new events. | No           | `30_000` ms (30 seconds) |
| `retries`     | The number of times the subscriber will attempt to process an event before sending it to the dead letter queue. | No           | `3`                 |

### Example Configuration Parameters

```ts
const subscriberConfig: SubscriberConfig = {
    clientId: 'my-subscriber-id',
    group: 'my-group',
    timeout: 5000, // 5 seconds
    count: 100,
    block: 15000, // 15 seconds
    retries: 5
};
```

### Usage

```typescript
const config = {
    group: 'my-group',
    timeout: 60000,
    count: 20,
    block: 2000,
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

The Event interface in Rivulex is used to represent messages or events that are passed through the system. It provides a structure for the event's data and metadata.

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

- `action: string`: Describes what should be done with the event. This could be something like "process-o`rder" or` "send-e`mail".

- `channel: string`: The channel or topic where the event was published. This helps in organizing and routing events.

- `attempt: number`: The number of times the event has been tried. Useful for retrying or tracking the event’s processing.

- `headers: Headers<H>`: Extra information about the event. For example, it could include metadata like the event's source or priority. You can customize what these headers contain.

- `payload: P`: The main data of the event. This is what the event is carrying. For example, if the event is about a new order, the payload might include order details.

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