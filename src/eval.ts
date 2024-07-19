import * as path from "path";
import { Worker } from "worker_threads";
import * as url from "url";
import { Context } from "./context";

const worker = new Worker(
    url.pathToFileURL(path.join(__dirname, "/worker/quickjs-worker.js"))
);

let id = 0;
const idPromises = new Map<number, { resolve: (_: unknown) => void, reject: (_: unknown) => void }>();

function setIdPromise(id: number, resolve: (_: unknown) => void, reject: (_: unknown) => void) {
    idPromises.set(id, { resolve, reject });
}

function getIdPromise(id: number): { resolve: (_: unknown) => void, reject: (_: unknown) => void } | undefined {
    const promise = idPromises.get(id);
    if (!promise) {
        return;
    }
    idPromises.delete(id);
    return promise;
}

worker.on("message", ((payload: { id: number, result: unknown } | { id: number, error: string }) => {
    const promise = getIdPromise(payload.id);
    if (!promise) {
        return;
    }
    if ("result" in payload) {
        promise.resolve(payload.result);
    } else if ("error" in payload) {
        promise.reject(new Error(payload.error));
    }
}));


export async function safeEval(code: string, $: Context) {
    const currentId = id++;
    const promise = new Promise<unknown>((resolve, reject) => {
        setIdPromise(currentId, resolve, reject);
    });
    worker.postMessage({
        id: currentId,
        type: "safeEval",
        payload: {
            code,
            $,
        },
    });
    return promise;
}

export async function safeEvalDiagnosticAction(code: string, $: Context, $$: unknown) {
    const currentId = id++;
    const promise = new Promise<unknown>((resolve, reject) => {
        setIdPromise(currentId, resolve, reject);
    });
    worker.postMessage({
        id: currentId,
        type: "safeEvalDiagnosticAction",
        payload: {
            code,
            $,
            $$,
        },
    });
    return promise;
}
