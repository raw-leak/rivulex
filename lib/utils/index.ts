
/**
 * Sets a value to a default if undefined, and ensures it is within specified minimum and maximum bounds.
 *
 * @param {number} value - The value to validate.
 * @param {number} defaultVal - The default value to use if the initial value is undefined.
 * @param {number} [minVal=0] - The minimum allowable value (default is 0).
 * @param {number} [maxVal=1_000_000] - The maximum allowable value (default is 1,000,000).
 * @returns {number} - The validated value within the specified bounds.
 */
export function setDefaultMinMax(value: number, defaultVal: number, minVal: number = 0, maxVal: number = 1_000_000): number {
    let result = value !== undefined ? value : defaultVal;
    if (result < minVal) {
        result = minVal;
    }
    if (result > maxVal) {
        result = maxVal;
    }
    return result;
}