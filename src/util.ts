import * as vscode from "vscode";

export function escapeRegexp(source: string): string {
    return source.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

export function byteBasedToCharacterBased(text: string, offset: number): number {
    let sum = 0;
    for (let i = 0; i < text.length; i++) {
        const byteLength = Buffer.byteLength(text.substr(i, 1));
        sum += byteLength;
        if (offset < sum) {
            return i;
        }
    }
    return text.length;
}

export function getDocumentEol(document: vscode.TextDocument) {
    switch (document.eol) {
        case vscode.EndOfLine.CRLF:
            return "\r\n";
        case vscode.EndOfLine.LF:
            return "\n";
    }
    return "\n";
}