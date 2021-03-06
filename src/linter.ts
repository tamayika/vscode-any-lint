import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { Context } from "./context";
import { DiagnosticConfiguration, DiagnosticConfigurationLines, DiagnosticOutputType, DiagnosticSeverity, DiagnosticType, Event, IDisposable, LinterConfiguration } from "./types";
import { safeEval } from "./eval";
import { convertResultToDiagnostic, Diagnostic, diagnosticDefaultFormat } from "./diagnostic";

const configurationKey = "any-lint";
const configurationLintersKey = "linters";

const debounceIntervals = {
    [Event.change]: 500,
    [Event.save]: 0,
    [Event.force]: 0
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

    public lintDocumentByUri(uri: string) {
        const document = vscode.workspace.textDocuments.find(_ => _.uri.toString() === uri);
        if (!document) {
            return;
        }
        this.lintDocument(document, Event.force);
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
            if (!(configuration.on || [Event.save]).some(_ => _ === event) && event !== Event.force) {
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
            const diagnosticConfiguration = configuration.diagnostic;
            const commonDiagnosticConfiguration = {
                output: diagnosticConfiguration?.output ?? DiagnosticOutputType.stderr,
                lineZeroBased: diagnosticConfiguration?.lineZeroBased ?? false,
                columnZeroBased: diagnosticConfiguration?.columnZeroBased ?? false,
                columnCharacterBased: diagnosticConfiguration?.columnCharacterBased ?? false,
                endColumnInclusive: diagnosticConfiguration?.endColumnInclusive ?? false,
                severity: diagnosticConfiguration?.severity ?? DiagnosticSeverity.error,
                actions: diagnosticConfiguration?.actions ?? [],
            };
            let requiredDiagnosticConfiguration: Required<DiagnosticConfiguration>;
            switch (diagnosticConfiguration?.type) {
                case DiagnosticType.json:
                    requiredDiagnosticConfiguration = {
                        ...commonDiagnosticConfiguration,
                        type: DiagnosticType.json,
                        selectors: diagnosticConfiguration?.selectors ?? {
                            diagnostics: "",
                            file: "",
                            startLine: "",
                            startColumn: "",
                        },
                    };
                    break;
                case DiagnosticType.yaml:
                    requiredDiagnosticConfiguration = {
                        ...commonDiagnosticConfiguration,
                        type: DiagnosticType.yaml,
                        selectors: diagnosticConfiguration?.selectors ?? {
                            diagnostics: "",
                            file: "",
                            startLine: "",
                            startColumn: "",
                        },
                    };
                    break;
                case DiagnosticType.lines:
                default:
                    requiredDiagnosticConfiguration = {
                        ...commonDiagnosticConfiguration,
                        type: DiagnosticType.lines,
                        format: (diagnosticConfiguration as DiagnosticConfigurationLines)?.format ?? diagnosticDefaultFormat,
                    };
                    break;
            }
            const cwd = configuration.cwd ? context.substitute(configuration.cwd) : context.cwd;
            this.lint(
                context.substitute(configuration.binPath),
                (configuration.args || []).map(_ => context.substitute(_)),
                requiredDiagnosticConfiguration.output,
                cwd ,
            ).then(result => {
                this.outputChannel.appendLine(result);
                let diagnostics: Diagnostic[] = [];
                try {
                    diagnostics = convertResultToDiagnostic(document, result, requiredDiagnosticConfiguration, context);
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
