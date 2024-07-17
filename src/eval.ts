import { Arena } from "quickjs-emscripten-sync";
import { Context } from "./context";
import { getQuickJS, QuickJSWASMModule } from "quickjs-emscripten";

let quickJS: QuickJSWASMModule | undefined;

export async function safeEval(code: string, $: Context) {
    const quickJS = await ensureQuickJS();
    const ctx = quickJS.newContext();
    const area = new Arena(ctx, { isMarshalable: true });
    area.expose({ $: $ });
    const ret = area.evalCode(code);
    area.dispose();
    ctx.dispose();
    return ret;
}

export async function safeEvalDiagnosticAction(code: string, $: Context, $$: unknown) {
    const quickJS = await ensureQuickJS();
    const ctx = quickJS.newContext();
    const area = new Arena(ctx, { isMarshalable: true });
    area.expose({ $: $, $$: $$ });
    const ret = area.evalCode(code);
    area.dispose();
    ctx.dispose();
    return ret;
}

async function ensureQuickJS() {
    if (quickJS !== undefined) {
        return quickJS;
    }
    quickJS = await getQuickJS();
    return quickJS;
}
