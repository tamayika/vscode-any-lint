import { parentPort, MessagePort } from "worker_threads";
import variant from "@jitl/quickjs-singlefile-cjs-release-sync";
import { newQuickJSWASMModuleFromVariant, QuickJSWASMModule } from "quickjs-emscripten-core";
import { Arena } from "quickjs-emscripten-sync";
import { Context } from "../context";

let quickJS: QuickJSWASMModule | undefined;

async function safeEval(code: string, $: Context) {
    const quickJS = await ensureQuickJS();
    const ctx = quickJS.newContext();
    const area = new Arena(ctx, { isMarshalable: true });
    area.expose({ $: $ });
    const ret = area.evalCode(code);
    area.dispose();
    ctx.dispose();
    return ret;
}

async function safeEvalDiagnosticAction(code: string, $: Context, $$: unknown) {
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
    quickJS = await newQuickJSWASMModuleFromVariant(variant);
    return quickJS;
}


function initialize(parentPort: MessagePort) {
    parentPort.on("message", async ({ id, type, payload }) => {
        switch (type) {
            case "safeEval": {
                const { code, $ } = payload;
                try {
                    const result = await safeEval(code, $);
                    parentPort.postMessage({
                        id,
                        type,
                        result,
                    });
                } catch (error) {
                    parentPort.postMessage({
                        id,
                        type,
                        error,
                    });
                }
                break;
            }
            case "safeEvalDiagnosticAction": {
                const { code, $, $$ } = payload;
                try {
                    const result = await safeEvalDiagnosticAction(code, $, $$);
                    parentPort.postMessage({
                        id,
                        type,
                        result,
                    });
                } catch (error) {
                    parentPort.postMessage({
                        id,
                        type,
                        error,
                    });
                }
                break;
            }
        }
    });
}

if (parentPort) {
    initialize(parentPort);
}
