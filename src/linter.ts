import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import { Context } from "./context";
import { DiagnosticConfiguration, DiagnosticOutputType, DiagnosticType, Event, IDisposable, LinterConfiguration } from "./types";
import { safeEval } from "./eval";
import { byteBasedToCharacterBased, escapeRegexp } from "./util";
import { Diagnostic } from "./diagnostic";

const configurationKey = "any-lint";
const configurationLintersKey = "linters";
const diagnosticFileKey = "file";
const diagnosticStartLineKey = "startLine";
const diagnosticStartColumnKey = "startColumn";
const diagnosticEndLineKey = "endLine";
const diagnosticEndColumnKey = "endColumn";
const diagnosticMessageKey = "message";
const diagnosticKeys = [
    diagnosticFileKey,
    diagnosticStartLineKey,
    diagnosticStartColumnKey,
    diagnosticEndLineKey,
    diagnosticEndColumnKey,
    diagnosticMessageKey
];
const diagnosticDefaultFormat = `\${${diagnosticFileKey}}:\${${diagnosticStartLineKey}}:\${${diagnosticStartColumnKey}}: \${${diagnosticMessageKey}}`;

const debounceIntervals = {
    [Event.change]: 500,
    [Event.save]: 0
};

export class Linter {
    private outputChannel: vscode.OutputChannel;
    private lastTimeout: NodeJS.Timeout | undefined;
    private disaposables: IDisposable[] = [];
    private diagnosticCollections: { [name: string]: vscode.DiagnosticCollection } = {};

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.disaposables.push(vscode.workspace.onDidChangeTextDocument(e => {
            this.lintDocument(e.document, Event.change);
        }));
        this.disaposables.push(vscode.workspace.onDidSaveTextDocument(document => {
            this.lintDocument(document, Event.save);
        }));
        this.disaposables.push(vscode.workspace.onDidChangeConfiguration(() => {
            const configurations = vscode.workspace.getConfiguration(configurationKey, null).get<LinterConfiguration[]>(configurationLintersKey) || [];
            const currentNames = configurations.map(_ => _.name);
            const diagnosticNames = Object.keys(this.diagnosticCollections);
            const removeNames = diagnosticNames.filter(_ => currentNames.indexOf(_) < 0);
            for (const removeName of removeNames) {
                this.diagnosticCollections[removeName].dispose();
                delete this.diagnosticCollections[removeName];
            }
        }));
    }

    public dispose() {
        for (const disposable of this.disaposables) {
            disposable.dispose();
        }
        this.disaposables = [];
        for (const key of Object.keys(this.diagnosticCollections)) {
            this.diagnosticCollections[key].dispose();
        }
        this.diagnosticCollections = {};
    }

    private lintDocument(document: vscode.TextDocument, event: Event) {
        const selection = vscode.window.activeTextEditor?.selection ?? new vscode.Selection(0, 0, 0, 0);
        const context = new Context(document, selection);
        if (this.lastTimeout) {
            clearTimeout(this.lastTimeout);
        }
        this.lastTimeout = setTimeout(() => this.lintDocumentImpl(document, context, event), debounceIntervals[event]);
    }

    private lintDocumentImpl(document: vscode.TextDocument, context: Context, event: Event) {
        const configurations = vscode.workspace.getConfiguration(configurationKey, null).get<LinterConfiguration[]>(configurationLintersKey) || [];
        for (const configuration of configurations) {
            if (!(configuration.on || [Event.save]).some(_ => _ === event)) {
                continue;
            }
            if (configuration.disabled) {
                continue;
            }
            if (!configuration.binPath) {
                continue;
            }
            if (configuration.condition) {
                try {
                    if (!safeEval(configuration.condition, context)) {
                        continue;
                    }
                } catch (e) {
                    console.log(e);
                    this.outputChannel.appendLine(e);
                }
            }
            const diagnosticConfiguration: Required<DiagnosticConfiguration> = {
                output: configuration.diagnostic?.output ?? DiagnosticOutputType.stderr,
                type: configuration.diagnostic?.type ?? DiagnosticType.lines,
                format: configuration.diagnostic?.format ?? diagnosticDefaultFormat,
                lineZeroBased: configuration.diagnostic?.lineZeroBased ?? false,
                columnZeroBased: configuration.diagnostic?.columnZeroBased ?? false,
                columnCharacterBased: configuration.diagnostic?.columnCharacterBased ?? false,
            };
            const cwd = configuration.cwd ? context.substitute(configuration.cwd) : context.cwd;
            this.lint(
                context.substitute(configuration.binPath),
                (configuration.args || []).map(_ => context.substitute(_)),
                diagnosticConfiguration.output,
                cwd ,
            ).then(result => {
                if (!result) {
                    return;
                }
                this.outputChannel.appendLine(result);
                const diagnostics = this.convertResultToDiagnostic(document, result, diagnosticConfiguration);

                let collections = this.diagnosticCollections[configuration.name];
                if (!collections) {
                    collections = vscode.languages.createDiagnosticCollection(configuration.name);
                    this.diagnosticCollections[configuration.name] = collections;
                }
                collections.clear();
                const pathToDiagnostics: { [index: string]: Diagnostic[] } = {};
                for (const diagnostic of diagnostics) {
                    diagnostic.source = configuration.name;
                    const filePath = path.isAbsolute(diagnostic.file) ? diagnostic.file : path.resolve(cwd, diagnostic.file);
                    pathToDiagnostics[filePath] ||= [];
                    pathToDiagnostics[filePath].push(diagnostic);
                }
                for (const path of Object.keys(pathToDiagnostics)) {
                    collections.set(vscode.Uri.file(path), pathToDiagnostics[path]);
                }
            });
        }
    }

    private lint(binPath: string, args: string[], outputType: DiagnosticOutputType, cwd?: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const command = [binPath, ...args].join(" ");
            if (cwd) {
                this.outputChannel.appendLine(cwd);
            }
            this.outputChannel.appendLine(command);
            cp.execFile(binPath, args, { cwd: cwd }, (err, stdout, stderr) => {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if (err && (<any>err).code === 'ENOENT') {
                        this.outputChannel.appendLine(`${binPath} does not exist`);
                        return resolve("");
                    }
                    if (err) {
                        console.log(err);
                        this.outputChannel.appendLine(`${command} failed`);
                    }
                    switch (outputType) {
                        case DiagnosticOutputType.stdout:
                            resolve(stdout);
                            break;
                        case DiagnosticOutputType.stderr:
                            resolve(stderr);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    private convertResultToDiagnostic(document: vscode.TextDocument, result: string, diagnosticConfiguration: Required<DiagnosticConfiguration>): Diagnostic[] {
        let diagnosticStrings: string[] = [result];
        switch (diagnosticConfiguration.type) {
            case DiagnosticType.lines:
                diagnosticStrings = result.trim().replace("\r\n", "\n").replace("\r", "\n").split("\n");
                break;
        }
        const regexp = this.formatToRegexp(diagnosticConfiguration.format);
        const diagnostics: Diagnostic[] = [];
        for (const diagnosticString of diagnosticStrings) {
            const match = diagnosticString.match(regexp);
            if (!match || !match.groups) {
                continue;
            }
            const file = match.groups[diagnosticFileKey];
            const startLineString = match.groups[diagnosticStartLineKey];
            const startColumnString = match.groups[diagnosticStartColumnKey];
            const endLineString = match.groups[diagnosticEndLineKey];
            const endColumnString = match.groups[diagnosticEndColumnKey];
            const message = match.groups[diagnosticMessageKey];
            if (!file || !startLineString || !startColumnString) {
                continue;
            }
            const startLine = parseInt(startLineString) - (diagnosticConfiguration.lineZeroBased ? 0 : 1);
            let startColumn = parseInt(startColumnString) - (diagnosticConfiguration.columnZeroBased ? 0 : 1);
            if (!diagnosticConfiguration.columnCharacterBased) {
                startColumn = byteBasedToCharacterBased(document.lineAt(startLine).text, startColumn);
            }
            const endLine = endLineString ? parseInt(endLineString) - (diagnosticConfiguration.lineZeroBased ? 0 : 1) : startLine;
            const endColumn = endColumnString ?
                diagnosticConfiguration.columnCharacterBased ?
                    parseInt(endColumnString) - (diagnosticConfiguration.columnZeroBased ? 0 : 1)
                    : byteBasedToCharacterBased(document.lineAt(startLine).text, parseInt(endColumnString) - (diagnosticConfiguration.columnZeroBased ? 0 : 1))
                : document.lineAt(startLine).text.length;
            diagnostics.push(new Diagnostic(file, new vscode.Range(startLine, startColumn, endLine, endColumn), message, vscode.DiagnosticSeverity.Error));
        }
        return diagnostics;
    }

    private formatToRegexp(format: string): RegExp {
        const patternRanges: { key: string, start: number, length: number }[] = [];
        for (const diagnosticKey of diagnosticKeys) {
            let position = 0;
            while (true) {
                const index = format.indexOf(`\${${diagnosticKey}}`, position);
                if (index < 0) {
                    break;
                }
                patternRanges.push({ key: diagnosticKey, start: index, length: diagnosticKey.length + 3 });
                position = index + diagnosticKey.length + 3;
            }
        }
        patternRanges.sort((r1, r2) => r1.start - r2.start);
        let position = 0;
        let pattern = "";
        for (const range of patternRanges) {
            if (position < range.start) {
                pattern += escapeRegexp(format.substring(position, range.start));
            }
            pattern += `(?<${range.key}>.*)`;
            position = range.start + range.length;
        }
        if (position < format.length) {
            pattern += escapeRegexp(format.substring(position));
        }
        return new RegExp(pattern);
    }
}
