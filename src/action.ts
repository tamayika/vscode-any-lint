import * as vscode from "vscode";
import { ignoreCommand, openUriCommand } from "./command";
import { Diagnostic, diagnosticCode } from "./diagnostic";
import { safeEvalDiagnosticAction } from "./eval";
import { DiagnosticAction, DiagnosticActionType, DiagnosticCommentLocation } from "./types";
import { getDocumentEol } from "./util";


export class AnyAction implements vscode.CodeActionProvider {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        const actions: vscode.CodeAction[] = [];
        for (const diagnostic of context.diagnostics.filter(isAnyLintDiagnostic).filter(_ => _.hasActions)) {
            actions.push(...this.createCodeActions(document, diagnostic));
        }
        return actions;
    }

    private createCodeActions(document: vscode.TextDocument, diagnostic: Diagnostic) {
        const actions: vscode.CodeAction[] = [];
        for (const diagnosticAction of diagnostic.diagnosticConfiguration.actions) {
            const action = this.createCodeAction(document, diagnostic, diagnosticAction);
            if (action) {
                actions.push(action);
            }
        }
        return actions;
    }

    private createCodeAction(document: vscode.TextDocument, diagnostic: Diagnostic, diagnosticAction: DiagnosticAction) {
        switch (diagnosticAction.type) {
            case DiagnosticActionType.openUri:
                return this.createOpenUriCodeAction(diagnostic, diagnosticAction);
            case DiagnosticActionType.ignore:
                return this.createIgnoreCodeAction(document, diagnostic, diagnosticAction);
        }
    }

    private createOpenUriCodeAction(diagnostic: Diagnostic, diagnosticAction: DiagnosticAction) {
        const title = this.safeEval(diagnosticAction.title, diagnostic);
        if (title === undefined) {
            return;
        }
        const uri = this.safeEval(diagnosticAction.uri, diagnostic);
        if (title === undefined) {
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

    private createIgnoreCodeAction(document: vscode.TextDocument, diagnostic: Diagnostic, diagnosticAction: DiagnosticAction) {
        const title = this.safeEval(diagnosticAction.title, diagnostic);
        if (title === undefined || typeof title !== "string") {
            return;
        }
        let comment = this.safeEval(diagnosticAction.comment, diagnostic);
        if (comment === undefined || typeof comment !== "string") {
            return;
        }
        const action = new vscode.CodeAction(title);
        let location: vscode.Range | undefined;
        const eol = getDocumentEol(document);
        switch (diagnosticAction.location ?? DiagnosticCommentLocation.previousLine) {
            case DiagnosticCommentLocation.startFile:
                location = new vscode.Range(0, 0, 0, 0);
                if (!comment.endsWith(eol)) {
                    comment += eol;
                }
                break;
            case DiagnosticCommentLocation.previousLine:
                {
                    location = new vscode.Range(diagnostic.range.start.line, 0, diagnostic.range.start.line, 0);
                    const line = document.lineAt(diagnostic.range.start.line).text;
                    const indent = getIndent(line);
                    comment = comment.split("\n").map(_ => indent + _).join(eol);
                    if (!comment.endsWith(eol)) {
                        comment += eol;
                    }
                }
                break;
            case DiagnosticCommentLocation.currentLine:
                {
                    const line = document.lineAt(diagnostic.range.start.line).text;
                    location = new vscode.Range(diagnostic.range.start.line, line.length, diagnostic.range.start.line, line.length);
                }
                break;
            case DiagnosticCommentLocation.nextLine:
                {
                    location = new vscode.Range(diagnostic.range.start.line + 1, 0, diagnostic.range.start.line + 1, 0);
                    const line = document.lineAt(diagnostic.range.start.line).text;
                    const indent = getIndent(line);
                    comment = comment.split("\n").map(_ => indent + _).join(eol);
                    if (!comment.endsWith(eol)) {
                        comment += eol;
                    }
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
                comment,
                location,
            ]
        };
        return action;
    }

    private safeEval(code: string, diagnostic: Diagnostic) {
        try {
            return safeEvalDiagnosticAction(code, diagnostic.context, diagnostic.rawData);
        } catch (e) {
            this.outputChannel.appendLine("failed to eval");
            this.outputChannel.appendLine(e);
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