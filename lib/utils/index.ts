export function Retryer(retries: number, delay: number) {
    return async (asyncFunc: Function) => {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await asyncFunc();
            } catch (error) {
                if (attempt === retries) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    };
}


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