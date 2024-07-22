
<div align="center">
  <h1>Rivulex</h1>
  
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Last Tag](https://img.shields.io/github/v/tag/raw-leak/rovulex?label=Last%20Tag)
![Version](https://img.shields.io/github/v/release/raw-leak/rovulex)
![Contributors](https://img.shields.io/github/contributors/raw-leak/rovulex)

</div>

[in-progress] Rivulex is a Node.js library for managing Redis streams, providing functionality for publishing and subscribing to events with robust handling and logging.

## Table of Contents

## Installation

To install Rivulex, use npm:

```bash
npm install rivulex
```

## Getting Started

## Publisher

### Overview

The `Publisher` class is responsible for sending events to Redis streams. It supports configuration for success and error callbacks, making it flexible for various use cases.

### Usage

```typescript
import { Rivulex } from 'rivulex';

const config = {
    channel: 'my-channel',
    group: 'my-group',
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

### Advanced Examples

#### Publishing with Error Handling

```typescript
const config = {
    channel: 'users',
    group: 'products',
    onMessagePublished: (event: Event<P,H>) => { // TO DEFINE
        console.log('Message published:', data);
    },
    onPublishFailed: (data) => { // TO DEFINE
        console.error('Publish failed:', data);
    }
};

const publisher = Rivulex.publisher(config);

// Publish a message with a custom payload and headers
const payload = { userId: 123, action: 'login' };
const headers = { authToken: 'abcdef' };
publisher.publish('user-action', payload, headers);
```

## Examples

See the [Getting Started](#getting-started) section for basic usage examples. Additional examples can be found in the `examples/` directory.



///

# Rivulex

Rivulex is a Node.js library for managing Redis streams, providing robust functionality for publishing and subscribing to events with comprehensive handling and logging.

## Table of Contents

- [Installation](#installation)
- [Publisher](#publisher)
  - [Overview](#publisher-overview)
  - [Configuration](#publisher-configuration)
  - [Usage](#publisher-usage)
  - [Advanced Examples](#publisher-advanced-examples)
- [Subscriber](#subscriber)
  - [Overview](#subscriber-overview)
  - [Configuration](#subscriber-configuration)
  - [Usage](#subscriber-usage)
  - [Advanced Examples](#subscriber-advanced-examples)
- [API Reference](#api-reference)
  - [Rivulex](#rivulex)
  - [Channel](#channel)
  - [LiveConsumer](#liveconsumer)
  - [FailedConsumer](#failedconsumer)
- [Contributing](#contributing)
- [License](#license)

## Installation

To install Rivulex, use npm:

```bash
npm install rivulex
```

## Publisher

The `Publisher` class is responsible for sending events to Redis streams. It supports configuration for success and error callbacks, making it flexible for various use cases.

### Configuration

```typescript
interface PublisherConfig {
    channel: string; // The Redis stream channel to publish events to.
    group: string; // The consumer group to associate with the events.
    onMessagePublished?: (data: PublishSuccessData) => void; // Optional callback for successful message publishing.
    onPublishFailed?: (data: PublishErrorData) => void; // Optional callback for failed message publishing.
}
```

### Usage

```typescript
import { Rivulex } from 'rivulex';

const config = {
    channel: 'my-channel',
    group: 'my-group',
    onMessagePublished: (data) => {
        console.log('Message published:', data);
    },
    onPublishFailed: (data) => {
        console.error('Publish failed:', data);
    }
};

const publisher = Rivulex.publisher(config);

// Example: Publishing a message
publisher.publish('my-action', { key: 'value' }, { headerKey: 'headerValue' });
```

## Subscriber

The `Subscriber` class listens to Redis streams and processes events. It supports configurations for timeouts, blocking behavior, and retry strategies.

### Usage

```typescript
import { Rivulex } from 'rivulex';

const config = {
    group: 'users',
    timeout: 5000,
    count: 10,
    block: 1000,
    retries: 5
};

const subscriber = Rivulex.subscriber(config);

// Define a handler for a specific action
subscriber.streamAction('my-channel', 'my-action', (event: Event<P, H>, done: Done) => {
    console.log('Received event:', event);
    await done(); // Signal that processing is complete
});

// Start listening for events
await subscriber.listen();
```

### Advanced Examples

#### Handling Multiple Channels and Actions

```typescript
const config = {
    group: 'my-group',
    timeout: 60000,
    count: 20,
    block: 2000,
    retries: 3
};

const subscriber = Rivulex.subscriber(config);

// Register handlers for multiple actions
subscriber.stream('my-channel')
    .action('login', (event, done) => {
        console.log('Login event:', event);
        done();
    })
    .action('logout', (event, done) => {
        console.log('Logout event:', event);
        done();
    });

// Register another channel
subscriber.stream('another-channel')
    .action('updateProfile', (event, done) => {
        console.log('Profile update event:', event);
        done();
    });

// Start listening for events
subscriber.listen().then(() => {
    console.log('Subscriber is listening to multiple channels...');
});
```

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