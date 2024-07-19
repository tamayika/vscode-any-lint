import * as vscode from "vscode";
import * as cp from "child_process";
import { Linter } from "./linter";
import { configurationKey, disableConfirmToAllowToRunKey } from "./configuration";

export const openUriCommand = "any-lint.open-uri";
export const ignoreCommand = "any-lint.ignore";
export const runCommand = "any-lint.run";
export const resetAllowRunCommand = "any-lint.reset-allow-run";

export class Commands {
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;
    private linter: Linter;

    constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, linter: Linter) {
        this.context = context;
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
    public run = async (documentUri: string, binPath: string, args: string[], cwd: string, lintAfterRun: boolean, orgBinPath: string, orgArgs: string[]) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.toString() !== documentUri) {
            return;
        }
        const command = [binPath, ...args].join(" ");
        if (cwd) {
            this.outputChannel.appendLine(cwd);
        }
        this.outputChannel.appendLine(command);
        if (!(await this.confirm(orgBinPath, orgArgs))) {
            return;
        }
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

    private async confirm(binPath: string, args: string[]): Promise<boolean> {
        if (vscode.workspace.getConfiguration(configurationKey, null).get<boolean>(disableConfirmToAllowToRunKey)) {
            return true;
        }
        const confirmKey = `allowRun.${binPath}.${JSON.stringify(args)}`;
        const confirmedConfiguration = this.context.workspaceState.get(confirmKey);
        if (confirmedConfiguration === false) {
            return false;
        }
        if (confirmedConfiguration === true) {
            return true;
        }
        const result = await vscode.window.showInformationMessage(`linter action has never executed before or binPath/args was changed in this workspace.
Are you sure to allow to execute this linter action?`, {
            modal: true, detail: `binPath: ${binPath}
args: ${JSON.stringify(args)}`
        }, "Yes", "No");
        if (result === "Yes") {
            await this.context.workspaceState.update(confirmKey, true);
            return true;
        }
        if (result === "No") {
            await this.context.workspaceState.update(confirmKey, false);
        }
        return false;
    }

    // bind required
    public resetAllowRun = async () => {
        for (const key of this.context.workspaceState.keys()) {
            if (key.startsWith("allowRun.")) {
                await this.context.workspaceState.update(key, undefined);
            }
        }
    };
}