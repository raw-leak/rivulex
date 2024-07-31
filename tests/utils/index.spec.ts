import { setDefaultMinMax } from '../../lib/utils';

describe('setDefaultMinMax', () => {
    test('should use the default value if the initial value is undefined', () => {
        expect(setDefaultMinMax(undefined as any, 10)).toBe(10);
    });

    test('should return the value if it is within the bounds', () => {
        expect(setDefaultMinMax(5, 10)).toBe(5);
    });

    test('should return the minVal if the value is below the minVal', () => {
        expect(setDefaultMinMax(-5, 10, 0, 100)).toBe(0);
    });

    test('should return the maxVal if the value is above the maxVal', () => {
        expect(setDefaultMinMax(150, 10, 0, 100)).toBe(100);
    });

    test('should use default min and max values if only default value is provided', () => {
        expect(setDefaultMinMax(5, 10)).toBe(5);
        expect(setDefaultMinMax(-1, 10)).toBe(0);
        expect(setDefaultMinMax(1_000_001, 10)).toBe(1_000_000);
    });
});
