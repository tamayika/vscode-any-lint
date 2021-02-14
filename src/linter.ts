import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { Context } from "./context";
import { DiagnosticConfiguration, DiagnosticOutputType, DiagnosticSeverity, DiagnosticType, Event, IDisposable, LinterConfiguration } from "./types";
import { safeEval } from "./eval";
import { convertResultToDiagnostic, Diagnostic, diagnosticDefaultFormat } from "./diagnostic";

const configurationKey = "any-lint";
const configurationLintersKey = "linters";

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
                selectors: configuration.diagnostic?.selectors ?? {
                    diagnostics: "",
                    file: "",
                    startLine: "",
                    startColumn: "",
                },
                lineZeroBased: configuration.diagnostic?.lineZeroBased ?? false,
                columnZeroBased: configuration.diagnostic?.columnZeroBased ?? false,
                columnCharacterBased: configuration.diagnostic?.columnCharacterBased ?? false,
                endColumnInclusive: configuration.diagnostic?.endColumnInclusive ?? false,
                severity: configuration.diagnostic?.severity ?? DiagnosticSeverity.error,
                actions: configuration.diagnostic?.actions ?? [],
            };
            const cwd = configuration.cwd ? context.substitute(configuration.cwd) : context.cwd;
            this.lint(
                context.substitute(configuration.binPath),
                (configuration.args || []).map(_ => context.substitute(_)),
                diagnosticConfiguration.output,
                cwd ,
            ).then(result => {
                this.outputChannel.appendLine(result);
                let diagnostics: Diagnostic[] = [];
                try {
                    diagnostics = convertResultToDiagnostic(document, result, diagnosticConfiguration, context);
                } catch (e) {
                    this.outputChannel.appendLine("failed to convert to diagnostic");
                    this.outputChannel.appendLine(e);
                }

                let collections = this.diagnosticCollections[configuration.name];
                if (!collections) {
                    collections = vscode.languages.createDiagnosticCollection(configuration.name);
                    this.diagnosticCollections[configuration.name] = collections;
                }
                collections.clear();
                const pathToDiagnostics: { [index: string]: Diagnostic[] } = {};
                for (const diagnostic of diagnostics) {
                    diagnostic.source = configuration.name;
                    let filePath = diagnostic.file;
                    if (!path.isAbsolute(filePath)) {
                        for (let i = 0; i < filePath.length; i++) {
                            const resolvedPath = path.resolve(cwd, filePath.substr(i));
                            if (fs.existsSync(resolvedPath)) {
                                filePath = resolvedPath;
                                break;
                            }
                        }
                    }
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
}
