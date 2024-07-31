import { Handler } from "../types/index";

/**
 * The `Channel` class represents a channel that can hold a collection of handlers 
 * for different actions. It allows you to register handlers for specific actions and 
 * retrieve them as needed.
 */
export class Channel {
    /**
     * A record of handlers indexed by action names.
     * @type {Record<string, Handler>}
     */
    readonly handlers: Record<string, Handler> = {};

    /**
     * Registers a handler for a specific action.
     * 
     * This method adds a handler function for a given action name. The handler 
     * will be invoked whenever an event with the corresponding action name is processed.
     * 
     * @param {string} actionName - The name of the action for which the handler is registered.
     * @param {Handler} handler - The function to handle the event with the given action name.
     * @returns {Channel} - Returns the `Channel` instance to allow for method chaining.
     * 
     * **Example Usage:**
     * 
     * ```typescript
     * channel.action('user_created', (event: Event<Payload, Headers<Custom>>) => {
     *   // Handle the event
     *   await event.ack();
     * });
     * ```
     */
    action(actionName: string, handler: Handler): Channel {
        this.handlers[actionName] = handler;
        return this;
    }

    /**
     * Retrieves the handler function for a specific action.
     * 
     * This method returns the handler function that was registered for the specified action name.
     * If no handler was registered for the action name, it returns `undefined`.
     * 
     * @param {string} action - The name of the action for which to retrieve the handler.
     * @returns {Handler | undefined} - The handler function for the action, or `undefined` if no handler was registered.
     */
    getActionHandler(action: string): Handler | undefined {
        return this.handlers[action];
    }

    /**
     * Retrieves all registered handlers.
     * 
     * This method returns a record of all handlers indexed by their action names. 
     * It provides a complete view of the handlers that have been registered in the channel.
     * 
     * @returns {Record<string, Handler>} - A record of all action-handler pairs.
     */
    getHandlers(): Record<string, Handler> {
        return this.handlers;
    }
}
