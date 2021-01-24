import * as vscode from "vscode";
import * as path from "path";

export class Context {
    public readonly workspaceFolder: string;
    public readonly workspaceFolderBasename: string;
    public readonly file: string;
    public readonly fileWorkspaceFolder: string;
    public readonly relativeFile: string;
    public readonly relativeFileDirname: string;
    public readonly fileBasename: string;
    public readonly fileBasenameNoExtension: string;
    public readonly fileDirname: string;
    public readonly fileExtname: string;
    public readonly cwd: string;
    public readonly lineNumber: string;
    public readonly selectedText: string;
    public readonly pathSeparator: string;
    public readonly languageId: string;

    constructor(document: vscode.TextDocument, selection: vscode.Selection) {
        const workspace = vscode.workspace?.workspaceFolders?.length ? vscode.workspace.workspaceFolders[0] : undefined;
        const absoluteFilePath = document?.uri.fsPath;
        this.workspaceFolder = workspace?.uri.fsPath ?? "";
        this.workspaceFolderBasename = workspace?.name ?? "";
        this.file = absoluteFilePath;
        let activeWorkspace = workspace;
        let relativeFilePath = document.uri.fsPath;
        for (const workspace of vscode.workspace.workspaceFolders ?? []) {
            if (absoluteFilePath.replace(workspace.uri.fsPath, '') !== absoluteFilePath) {
                activeWorkspace = workspace;
                relativeFilePath = absoluteFilePath.replace(workspace.uri.fsPath, '');
                if (relativeFilePath.startsWith(path.sep)) {
                    relativeFilePath = relativeFilePath.substr(path.sep.length);
                }
                break;
            }
        }
        const parsedPath = path.parse(this.file);
        this.fileWorkspaceFolder = activeWorkspace?.uri.fsPath ?? "";
        this.relativeFile = relativeFilePath;
        this.relativeFileDirname = relativeFilePath.substr(0, relativeFilePath.lastIndexOf(path.sep));
        this.fileBasename = parsedPath.base;
        this.fileBasenameNoExtension = parsedPath.name;
        this.fileDirname = parsedPath.dir;
        this.fileExtname = parsedPath.ext;
        this.cwd = parsedPath.dir;
        this.lineNumber = (selection.start.line + 1).toString();
        this.selectedText = document.getText(new vscode.Range(selection.start, selection.end));
        this.pathSeparator = path.sep;
        this.languageId = document.languageId;
    }

    public substitute(input: string) {
        input = input.replace(/\${workspaceFolder}/g, this.workspaceFolder);
        input = input.replace(/\${workspaceFolderBasename}/g, this.workspaceFolderBasename);
        input = input.replace(/\${file}/g, this.file);
        input = input.replace(/\${fileWorkspaceFolder}/g, this.fileWorkspaceFolder);
        input = input.replace(/\${relativeFile}/g, this.relativeFile);
        input = input.replace(/\${relativeFileDirname}/g, this.relativeFileDirname);
        input = input.replace(/\${fileBasename}/g, this.fileBasename);
        input = input.replace(/\${fileBasenameNoExtension}/g, this.fileBasenameNoExtension);
        input = input.replace(/\${fileDirname}/g, this.fileDirname);
        input = input.replace(/\${fileExtname}/g, this.fileExtname);
        input = input.replace(/\${cwd}/g, this.cwd);
        input = input.replace(/\${lineNumber}/g, this.lineNumber);
        input = input.replace(/\${selectedText}/g, this.selectedText);
        input = input.replace(/\${pathSeparator}/g, this.pathSeparator);
        input = input.replace(/\${languageId}/g, this.languageId);
        return input;
    }
}
