import { Handler } from '../../lib/types';
import { Channel } from '../../lib/channel/channel';

describe('Channel unit', () => {
    let channel: Channel;

    beforeEach(() => {
        channel = new Channel();
    });

    describe('action method', () => {
        it('should add a handler for a given action', () => {
            const actionName = 'test-action';
            const handler: Handler = jest.fn();

            channel.action(actionName, handler);

            expect(channel.getActionHandler(actionName)).toBe(handler);
        });

        it('should overwrite an existing handler for the same action', () => {
            const actionName = 'test-action';
            const handler1: Handler = jest.fn();
            const handler2: Handler = jest.fn();

            channel.action(actionName, handler1);
            channel.action(actionName, handler2);

            expect(channel.getActionHandler(actionName)).toBe(handler2);
        });

        it('should return the channel instance for chaining', () => {
            const actionName = 'test-action';
            const handler: Handler = jest.fn();

            const result = channel.action(actionName, handler);

            expect(result).toBe(channel);
        });
    });

    describe('getActionHandler method', () => {
        it('should return undefined if no handler is set for an action', () => {
            const actionName = 'non-existent-action';

            expect(channel.getActionHandler(actionName)).toBeUndefined();
        });

        it('should return the correct handler for an action', () => {
            const actionName = 'test-action';
            const handler: Handler = jest.fn();

            channel.action(actionName, handler);

            expect(channel.getActionHandler(actionName)).toBe(handler);
        });
    });

    describe('getHandlers method', () => {
        it('should return an empty object initially', () => {
            expect(channel.getHandlers()).toEqual({});
        });

        it('should return all handlers added to the channel', () => {
            const action1 = 'action1';
            const action2 = 'action2';
            const handler1: Handler = jest.fn();
            const handler2: Handler = jest.fn();

            channel.action(action1, handler1);
            channel.action(action2, handler2);

            expect(channel.getHandlers()).toEqual({
                [action1]: handler1,
                [action2]: handler2,
            });
        });

        it('should return an updated list of handlers when new handlers are added', () => {
            const action1 = 'action1';
            const action2 = 'action2';
            const handler1: Handler = jest.fn();
            const handler2: Handler = jest.fn();
            const handler3: Handler = jest.fn();

            channel.action(action1, handler1);
            channel.action(action2, handler2);
            channel.action(action1, handler3); // Overwriting handler1 with handler3

            expect(channel.getHandlers()).toEqual({
                [action1]: handler3,
                [action2]: handler2,
            });
        });
    });

    describe('Edge Cases', () => {
        it('should handle action names with special characters', () => {
            const actionName = 'action@#%&*';
            const handler: Handler = jest.fn();

            channel.action(actionName, handler);

            expect(channel.getActionHandler(actionName)).toBe(handler);
        });

        it('should handle an empty string as an action name', () => {
            const actionName = '';
            const handler: Handler = jest.fn();

            channel.action(actionName, handler);

            expect(channel.getActionHandler(actionName)).toBe(handler);
        });

        it('should handle multiple handlers with empty or special characters in action names', () => {
            const specialAction = 'action@#%&*';
            const emptyAction = '';
            const handler1: Handler = jest.fn();
            const handler2: Handler = jest.fn();

            channel.action(specialAction, handler1);
            channel.action(emptyAction, handler2);

            expect(channel.getActionHandler(specialAction)).toBe(handler1);
            expect(channel.getActionHandler(emptyAction)).toBe(handler2);
        });

        it('should not retain handlers after creating a new Channel instance', () => {
            const actionName = 'test-action';
            const handler: Handler = jest.fn();

            channel.action(actionName, handler);
            const newChannel = new Channel();

            expect(newChannel.getActionHandler(actionName)).toBeUndefined();
        });
    });
});
