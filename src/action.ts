import * as vscode from "vscode";
import { ignoreCommand, openUriCommand, runCommand } from "./command";
import { Diagnostic, diagnosticCode } from "./diagnostic";
import { safeEvalDiagnosticAction } from "./eval";
import { DiagnosticAction, DiagnosticActionIgnore, DiagnosticActionOpenUri, DiagnosticActionRun, DiagnosticActionType, DiagnosticCommentLocation } from "./types";
import { getDocumentEol } from "./util";


export class AnyAction implements vscode.CodeActionProvider {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        return this.provideCodeActionsImpl(document, range, context);
    }

    private async provideCodeActionsImpl(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext) {
        const actions: vscode.CodeAction[] = [];
        for (const diagnostic of context.diagnostics.filter(isAnyLintDiagnostic).filter(_ => _.hasActions)) {
            actions.push(...(await this.createCodeActions(document, diagnostic)));
        }
        return actions;
    }

    private async createCodeActions(document: vscode.TextDocument, diagnostic: Diagnostic) {
        const actions: vscode.CodeAction[] = [];
        for (const diagnosticAction of diagnostic.diagnosticConfiguration.actions) {
            const action = await this.createCodeAction(document, diagnostic, diagnosticAction);
            if (action) {
                actions.push(action);
            }
        }
        return actions;
    }

    private async createCodeAction(document: vscode.TextDocument, diagnostic: Diagnostic, diagnosticAction: DiagnosticAction) {
        if (diagnosticAction.condition) {
            if (!(await this.safeEval(diagnosticAction.condition, diagnostic))) {
                return;
            }
        }
        switch (diagnosticAction.type) {
            case DiagnosticActionType.openUri:
                return await this.createOpenUriCodeAction(diagnostic, diagnosticAction);
            case DiagnosticActionType.ignore:
                return await this.createIgnoreCodeAction(document, diagnostic, diagnosticAction);
            case DiagnosticActionType.run:
                return this.createRunCodeAction(document, diagnostic, diagnosticAction);
        }
    }

    private async createOpenUriCodeAction(diagnostic: Diagnostic, diagnosticAction: DiagnosticActionOpenUri) {
        const title = await this.safeEval(diagnosticAction.title, diagnostic);
        if (title === undefined || typeof title !== "string") {
            return;
        }
        const uri = await this.safeEval(diagnosticAction.uri, diagnostic);
        if (uri === undefined || typeof uri !== "string") {
            return;
        }
        const action = new vscode.CodeAction(title);
        action.command = {
            title,
            command: openUriCommand,
            arguments: [
                uri,
            ]
        };
        return action;
    }

    private async createIgnoreCodeAction(document: vscode.TextDocument, diagnostic: Diagnostic, diagnosticAction: DiagnosticActionIgnore) {
        const title = await this.safeEval(diagnosticAction.title, diagnostic);
        if (title === undefined || typeof title !== "string") {
            return;
        }
        const action = new vscode.CodeAction(title);
        let location: vscode.Range | undefined;
        const eol = getDocumentEol(document);
        let replacement = "";
        switch (diagnosticAction.location ?? DiagnosticCommentLocation.previousLine) {
            case DiagnosticCommentLocation.startFile:
                {
                    const commentResult = await this.safeEval(diagnosticAction.comment, diagnostic);
                    if (commentResult === undefined || typeof commentResult !== "string") {
                        return;
                    }
                    replacement = commentResult;
                    location = new vscode.Range(0, 0, 0, 0);
                    if (!replacement.endsWith(eol)) {
                        replacement += eol;
                    }
                }
                break;
            case DiagnosticCommentLocation.previousLine:
                {
                    const commentResult = await this.safeEval(diagnosticAction.comment, diagnostic);
                    if (commentResult === undefined || typeof commentResult !== "string") {
                        return;
                    }
                    replacement = commentResult;
                    location = new vscode.Range(diagnostic.range.start.line, 0, diagnostic.range.start.line, 0);
                    const line = document.lineAt(diagnostic.range.start.line).text;
                    const indent = getIndent(line);
                    replacement = replacement.split("\n").map(_ => indent + _).join(eol);
                    if (!replacement.endsWith(eol)) {
                        replacement += eol;
                    }
                }
                break;
            case DiagnosticCommentLocation.currentLine:
                {
                    const commentResult = await this.safeEval(diagnosticAction.comment, diagnostic);
                    if (commentResult === undefined || typeof commentResult !== "string") {
                        return;
                    }
                    replacement = commentResult;
                    const line = document.lineAt(diagnostic.range.start.line).text;
                    location = new vscode.Range(diagnostic.range.start.line, line.length, diagnostic.range.start.line, line.length);
                }
                break;
            case DiagnosticCommentLocation.nextLine:
                {
                    const commentResult = await this.safeEval(diagnosticAction.comment, diagnostic);
                    if (commentResult === undefined || typeof commentResult !== "string") {
                        return;
                    }
                    replacement = commentResult;
                    location = new vscode.Range(diagnostic.range.start.line + 1, 0, diagnostic.range.start.line + 1, 0);
                    const line = document.lineAt(diagnostic.range.start.line).text;
                    const indent = getIndent(line);
                    replacement = replacement.split("\n").map(_ => indent + _).join(eol);
                    if (!replacement.endsWith(eol)) {
                        replacement += eol;
                    }
                }
                break;
            case DiagnosticCommentLocation.rewriteLine:
                {
                    location = new vscode.Range(diagnostic.range.start.line, diagnostic.range.start.character,
                        diagnostic.range.end.line, diagnostic.range.end.character);
                    const line = document.lineAt(diagnostic.range.start.line).text;
                    const indent = getIndent(line);
                    const content = document.getText(diagnostic.range);
                    const commentResult = await this.safeEval(diagnosticAction.comment, diagnostic,
                        { indent, content, eol }
                    );
                    if (commentResult === undefined || typeof commentResult !== "string") {
                        return;
                    }
                    replacement = commentResult;
                }
                break;
        }
        if (location === undefined) {
            return;
        }
        action.command = {
            title,
            command: ignoreCommand,
            arguments: [
                document.uri.toString(),
                replacement,
                location,
            ]
        };
        return action;
    }

    private async createRunCodeAction(document: vscode.TextDocument, diagnostic: Diagnostic, diagnosticAction: DiagnosticActionRun) {
        const title = await this.safeEval(diagnosticAction.title, diagnostic);
        if (title === undefined || typeof title !== "string") {
            return;
        }
        if (!diagnosticAction.binPath) {
            return;
        }
        const binPath = await this.safeEval(diagnosticAction.binPath, diagnostic);
        const action = new vscode.CodeAction(title);
        const args = (await Promise.all((diagnosticAction.args ?? []).map(async (_) => await this.safeEval(_, diagnostic)))).filter(_ => !!_);
        const cwd = diagnosticAction.cwd ? await this.safeEval(diagnosticAction.cwd, diagnostic) : diagnostic.context.cwd;
        const lintAfterRun = diagnosticAction.lintAfterRun ? await this.safeEval(diagnosticAction.lintAfterRun, diagnostic) : false;
        action.command = {
            title,
            command: runCommand,
            arguments: [
                document.uri.toString(),
                binPath,
                args,
                cwd,
                lintAfterRun,
                diagnosticAction.binPath,
                diagnosticAction.args ?? []
            ]
        };
        return action;
    }

    private async safeEval(code: string, diagnostic: Diagnostic, additional?: object) {
        try {
            let rawData = diagnostic.rawData;
            if (additional) {
                if (typeof rawData === "object" && rawData !== undefined) {
                    rawData = { ...rawData, ...additional };
                }
            }
            return await safeEvalDiagnosticAction(code, diagnostic.context, rawData);
        } catch (e) {
            this.outputChannel.appendLine("failed to eval");
            this.appendErrorToOutputChannel(e);
        }
    }

    private appendErrorToOutputChannel(e: unknown) {
        if (e instanceof Error) {
            this.outputChannel.appendLine(e.message);
            if (e.stack) {
                this.outputChannel.appendLine(e.stack);
            }
        }
    }
}

function getIndent(line: string) {
    const match = line.match(/^\s+/);
    if (match) {
        return match[0];
    }
    return "";
}

function isAnyLintDiagnostic(diagnostic: vscode.Diagnostic): diagnostic is Diagnostic {
    return diagnostic.code === diagnosticCode;
}