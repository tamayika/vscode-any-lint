import * as vscode from "vscode";

export const openUriCommand = "any-lint.open-uri";
export const ignoreCommand = "any-lint.ignore";

export function openUri(uri: string) {
    vscode.env.openExternal(vscode.Uri.parse(uri));
}

export function ignore(documentUri: string, comment: string, range: vscode.Range) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== documentUri) {
        return;
    }
    editor.edit(edit => edit.replace(range, comment));
}
