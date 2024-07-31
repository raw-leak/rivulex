import { Logger } from "../lib/types";

export function sleep(milliseconds: number) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export class SilentLogger implements Logger {
    log(message: string, ...optionalParams: any[]): void {
        // Intentionally left empty
    }

    error(message: string, ...optionalParams: any[]): void {
        // Intentionally left empty
    }

    warn(message: string, ...optionalParams: any[]): void {
        // Intentionally left empty
    }

    debug(message: string, ...optionalParams: any[]): void {
        // Intentionally left empty
    }
}