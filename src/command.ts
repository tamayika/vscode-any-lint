import * as vscode from "vscode";
import * as cp from "child_process";
import { Linter } from "./linter";

export const openUriCommand = "any-lint.open-uri";
export const ignoreCommand = "any-lint.ignore";
export const runCommand = "any-lint.run";

export class Commands {
    private outputChannel: vscode.OutputChannel;
    private linter: Linter;

    constructor(outputChannel: vscode.OutputChannel, linter: Linter) {
        this.outputChannel = outputChannel;
        this.linter = linter;
    }

    // bind required
    public openUri = (uri: string) => {
        vscode.env.openExternal(vscode.Uri.parse(uri));
    };

    // bind required
    public ignore = (documentUri: string, comment: string, range: vscode.Range) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.toString() !== documentUri) {
            return;
        }
        editor.edit(edit => edit.replace(range, comment));
    };

    // bind required
    public run = (documentUri: string, binPath: string, args: string[], cwd: string, lintAfterRun: boolean) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.toString() !== documentUri) {
            return;
        }
        const command = [binPath, ...args].join(" ");
        if (cwd) {
            this.outputChannel.appendLine(cwd);
        }
        this.outputChannel.appendLine(command);
        cp.execFile(binPath, args, { cwd: cwd }, (err, stdout, stderr) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (err && (<any>err).code === 'ENOENT') {
                this.outputChannel.appendLine(`${binPath} does not exist`);
            }
            if (err) {
                console.log(err);
                this.outputChannel.appendLine(`${command} failed`);
            }
            this.outputChannel.appendLine(stderr);
            this.outputChannel.appendLine(stdout);
            if (lintAfterRun) {
                this.linter.lintDocumentByUri(documentUri);
            }
        });
    };
}