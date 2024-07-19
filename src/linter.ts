import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { Context } from "./context";
import { DiagnosticConfiguration, DiagnosticConfigurationLines, DiagnosticOutputType, DiagnosticSeverity, DiagnosticType, Event, IDisposable, LinterConfiguration } from "./types";
import { safeEval } from "./eval";
import { convertResultToDiagnostic, Diagnostic, diagnosticDefaultFormat } from "./diagnostic";
import { configurationKey, configurationLintersKey, disableConfirmToAllowToRunKey } from "./configuration";

const debounceIntervals = {
    [Event.change]: 500,
    [Event.save]: 0,
    [Event.force]: 0
};

export class Linter {
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;
    private lastTimeout: NodeJS.Timeout | undefined;
    private disaposables: IDisposable[] = [];
    private diagnosticCollections: { [name: string]: vscode.DiagnosticCollection } = {};

    constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
        this.disaposables.push(vscode.workspace.onDidChangeTextDocument(e => {
            this.lintDocument(e.document, Event.change);
        }));
        this.disaposables.push(vscode.workspace.onDidSaveTextDocument(document => {
            this.lintDocument(document, Event.save);
        }));
        this.disaposables.push(vscode.workspace.onDidOpenTextDocument(document => {
            this.lintDocument(document, Event.open);
        }));
        this.disaposables.push(vscode.workspace.onDidCloseTextDocument(document => {
            this.clearLintDocument(document);
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
        for (const document of vscode.workspace.textDocuments) {
            this.lintDocument(document, Event.open);
        }
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

    public async lintDocumentByUri(uri: string) {
        const document = vscode.workspace.textDocuments.find(_ => _.uri.toString() === uri);
        if (!document) {
            return;
        }
        await this.lintDocument(document, Event.force);
    }

    private clearLintDocument(document: vscode.TextDocument) {
        const configurations = vscode.workspace.getConfiguration(configurationKey, null).get<LinterConfiguration[]>(configurationLintersKey) || [];
        for (const configuration of configurations) {
            const collections = this.diagnosticCollections[configuration.name];
            if (collections) {
                collections.set(vscode.Uri.file(document.fileName), []);
            }
        }
    }

    private async lintDocument(document: vscode.TextDocument, event: Event) {
        const selection = vscode.window.activeTextEditor?.selection ?? new vscode.Selection(0, 0, 0, 0);
        const context = new Context(document, selection);
        if (event === Event.open) {
            await this.lintDocumentImpl(document, context, Event.force);
        } else {
            if (this.lastTimeout) {
                clearTimeout(this.lastTimeout);
            }
            this.lastTimeout = setTimeout(() => this.lintDocumentImpl(document, context, event), debounceIntervals[event]);
        }
    }

    private async lintDocumentImpl(document: vscode.TextDocument, context: Context, event: Event) {
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
                    if (!(await safeEval(configuration.condition, context))) {
                        continue;
                    }
                } catch (e) {
                    console.log(e);
                    this.appendErrorToOutputChannel(e);
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
                        severityMap: diagnosticConfiguration?.severityMap ?? {
                            [DiagnosticSeverity.error]: DiagnosticSeverity.error,
                            [DiagnosticSeverity.warning]: DiagnosticSeverity.warning,
                            [DiagnosticSeverity.info]: DiagnosticSeverity.info,
                            [DiagnosticSeverity.hint]: DiagnosticSeverity.hint,
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
                        severityMap: diagnosticConfiguration?.severityMap ?? {
                            [DiagnosticSeverity.error]: DiagnosticSeverity.error,
                            [DiagnosticSeverity.warning]: DiagnosticSeverity.warning,
                            [DiagnosticSeverity.info]: DiagnosticSeverity.info,
                            [DiagnosticSeverity.hint]: DiagnosticSeverity.hint,
                        },
                    };
                    break;
                case DiagnosticType.lines:
                default:
                    requiredDiagnosticConfiguration = {
                        ...commonDiagnosticConfiguration,
                        type: DiagnosticType.lines,
                        format: (diagnosticConfiguration as DiagnosticConfigurationLines)?.format ?? diagnosticDefaultFormat,
                        severityMap: diagnosticConfiguration?.severityMap ?? {
                            [DiagnosticSeverity.error]: DiagnosticSeverity.error,
                            [DiagnosticSeverity.warning]: DiagnosticSeverity.warning,
                            [DiagnosticSeverity.info]: DiagnosticSeverity.info,
                            [DiagnosticSeverity.hint]: DiagnosticSeverity.hint,
                        },
                    };
                    break;
            }
            const cwd = configuration.cwd ? context.substitute(configuration.cwd) : context.cwd;
            const binPath = context.substitute(configuration.binPath);
            if (!(await this.confirm(configuration.name, binPath, configuration.args ?? []))) {
                return;
            }
            const result = await this.lint(
                document,
                binPath,
                (configuration.args || []).map(_ => context.substitute(_)),
                requiredDiagnosticConfiguration.output,
                cwd,
                event,
            );
            this.outputChannel.appendLine(result);
            let diagnostics: Diagnostic[] = [];
            try {
                diagnostics = await convertResultToDiagnostic(document, result, requiredDiagnosticConfiguration, context);
            } catch (e) {
                this.outputChannel.appendLine("failed to convert to diagnostic");
                this.appendErrorToOutputChannel(e);
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
        }
    }

    private async lint(document: vscode.TextDocument, binPath: string, args: string[], outputType: DiagnosticOutputType, cwd: string, event: Event): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const command = [binPath, ...args].join(" ");
            if (cwd) {
                this.outputChannel.appendLine(cwd);
            }
            this.outputChannel.appendLine(command);
            const handleResult = (err: Error | undefined, stdout: string, stderr: string) => {
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
            };
            if (event === Event.change) {
                const child = cp.spawn(binPath, args, { cwd: cwd });
                let err: Error | undefined;
                let stdout = "";
                let stderr = "";
                child.stdout.on("data", (data) => stdout += data.toString());
                child.stderr.on("data", (data) => stderr += data.toString());
                child.stdin.write(document.getText());
                child.stdin.end();
                child.on("error", (e) => err = e);
                child.on("close", () => {
                    handleResult(err, stdout, stderr);
                });
            } else {
                cp.execFile(binPath, args, { cwd: cwd }, (err, stdout, stderr) => {
                    handleResult(err === null ? undefined : err, stdout, stderr);
                });
            }
        });
    }

    private async confirm(name: string, binPath: string, args: string[]): Promise<boolean> {
        if (vscode.workspace.getConfiguration(configurationKey, null).get<boolean>(disableConfirmToAllowToRunKey)) {
            return true;
        }
        const confirmKey = `allowRun.${name}`;
        const confirmedConfiguration = this.context.workspaceState.get(confirmKey);
        if (confirmedConfiguration === false) {
            return false;
        }
        const confirmingConfiguration = JSON.stringify({
            binPath,
            args
        });
        if (confirmedConfiguration === confirmingConfiguration) {
            return true;
        }
        const result = await vscode.window.showInformationMessage(`"${name}" linter has never executed before or binPath/args was changed in this workspace.
Are you sure to allow to execute this linter?`, {
            modal: true, detail: `binPath: ${binPath}
args: ${JSON.stringify(args)}`
        }, "Yes", "No");
        if (result === "Yes") {
            await this.context.workspaceState.update(confirmKey, confirmingConfiguration);
            return true;
        }
        if (result === "No") {
            await this.context.workspaceState.update(confirmKey, false);
        }
        return false;
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
