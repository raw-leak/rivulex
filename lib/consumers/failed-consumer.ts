import { EventProcessor } from "../event-processor/event-processor";

export class FailedConsumer {
    processor: EventProcessor;

    constructor() {
        this.processor = new EventProcessor()
    }

    public consume(event: any): void {
        this.processor.process(event)
    }
}
