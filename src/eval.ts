import { Context } from "./context";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function safeEval(code: string, $: Context) {
    return eval(code);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function safeEvalDiagnosticAction(code: string, $: Context, $$: unknown) {
    return eval(code);
}