import * as vscode from "vscode";
import { DiagnosticSeverity } from "./types";

export const diagnosticSeverityMap = {
    [DiagnosticSeverity.error]: vscode.DiagnosticSeverity.Error,
    [DiagnosticSeverity.warning]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticSeverity.info]: vscode.DiagnosticSeverity.Information,
    [DiagnosticSeverity.hint]: vscode.DiagnosticSeverity.Hint,
};

export class Diagnostic extends vscode.Diagnostic {
    public file: string;

    constructor(file: string, range: vscode.Range, message: string, severity: vscode.DiagnosticSeverity) {
        super(range, message, severity);
        this.file = file;
    }
}