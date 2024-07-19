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
