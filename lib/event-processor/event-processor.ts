export class EventProcessor {
    public async process(event: any): Promise<void> {
        // Process the event
        console.log("Processing event:", event);
    }
}