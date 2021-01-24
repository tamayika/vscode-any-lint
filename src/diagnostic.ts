import * as vscode from "vscode";

export class Diagnostic extends vscode.Diagnostic {
    public file: string;

    constructor(file: string, range: vscode.Range, message: string, severity: vscode.DiagnosticSeverity) {
        super(range, message, severity);
        this.file = file;
    }
}