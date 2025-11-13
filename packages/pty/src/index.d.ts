export interface PtyValidation {
    fileExists?: string[];
    commandInPath?: string;
    errorHints?: Record<string, string>;
}
export interface PtyOptions {
    command: string;
    port: number;
    cwd?: string;
    env?: Record<string, string>;
    validation?: PtyValidation;
}
/**
 * Start a generic PTY with HTTP bridge for logs and commands
 * Supports validation, custom environments, and enhanced error handling
 */
export declare function startPty(options: PtyOptions): void;
/**
 * Legacy function signature for backward compatibility
 * @deprecated Use startPty(options) instead
 */
export declare function startPtyLegacy(bin: string, args: string[], port: number, cwd?: string): void;
