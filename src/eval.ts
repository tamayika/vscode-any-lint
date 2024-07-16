import { Context } from "./context";
import { parse, EvalAstFactory } from "./jexpr";

const astFactory = new EvalAstFactory();

export function safeEval(code: string, $: Context) {
    const expr = parse(code, astFactory);
    if (expr === undefined) {
        return undefined;
    }
    return expr.evaluate({ $: $ });
}

export function safeEvalDiagnosticAction(code: string, $: Context, $$: unknown) {
    const expr = parse(code, astFactory);
    if (expr === undefined) {
        return undefined;
    }
    return expr.evaluate({ $: $, $$: $$ });
}
