import * as vscode from "vscode";
import * as YAML from "js-yaml";
import { DiagnosticConfiguration, DiagnosticConfigurationJSON, DiagnosticConfigurationLines, DiagnosticConfigurationYAML, DiagnosticSeverity, DiagnosticType } from "./types";
import { byteBasedToCharacterBased, escapeRegexp } from "./util";
import { safeEval } from "./eval";
import { Context } from "./context";

const diagnosticFileKey = "file";
const diagnosticStartLineKey = "startLine";
const diagnosticStartColumnKey = "startColumn";
const diagnosticEndLineKey = "endLine";
const diagnosticEndColumnKey = "endColumn";
const diagnosticMessageKey = "message";
const diagnosticSeverityKey = "severity";

enum DiagnosticFormatKeyType {
    string,
    number,
}
interface DiagnosticFormatKey {
    key: string;
    type: DiagnosticFormatKeyType;
}
const diagnosticFormatKeys: DiagnosticFormatKey[] = [
    { key: diagnosticFileKey, type: DiagnosticFormatKeyType.string },
    { key: diagnosticStartLineKey, type: DiagnosticFormatKeyType.number },
    { key: diagnosticStartColumnKey, type: DiagnosticFormatKeyType.number },
    { key: diagnosticEndLineKey, type: DiagnosticFormatKeyType.number },
    { key: diagnosticEndColumnKey, type: DiagnosticFormatKeyType.number },
    { key: diagnosticMessageKey, type: DiagnosticFormatKeyType.string },
    { key: diagnosticSeverityKey, type: DiagnosticFormatKeyType.string },
];
export const diagnosticDefaultFormat = `\${${diagnosticFileKey}}:\${${diagnosticStartLineKey}}:\${${diagnosticStartColumnKey}}: \${${diagnosticMessageKey}}`;

export const diagnosticSeverityMap = {
    [DiagnosticSeverity.error]: vscode.DiagnosticSeverity.Error,
    [DiagnosticSeverity.warning]: vscode.DiagnosticSeverity.Warning,
    [DiagnosticSeverity.info]: vscode.DiagnosticSeverity.Information,
    [DiagnosticSeverity.hint]: vscode.DiagnosticSeverity.Hint,
};

export const diagnosticCode = "any-lint";

export class Diagnostic extends vscode.Diagnostic {
    public file: string;
    public diagnosticConfiguration: Required<DiagnosticConfiguration>;
    public context: Context;
    public rawData: unknown;

    constructor(file: string, range: vscode.Range, message: string, severity: vscode.DiagnosticSeverity,
        diagnosticConfiguration: Required<DiagnosticConfiguration>, context: Context, rawData: unknown) {
        super(range, message, severity);
        this.code = diagnosticCode;
        this.diagnosticConfiguration = diagnosticConfiguration;
        this.context = context;
        this.file = file;
        this.rawData = rawData;
    }

    public get hasActions() {
        return this.diagnosticConfiguration.actions.length > 0;
    }
}

export async function convertResultToDiagnostic(document: vscode.TextDocument, result: string, diagnosticConfiguration: Required<DiagnosticConfiguration>, context: Context): Promise<Diagnostic[]> {
    switch (diagnosticConfiguration.type) {
        case DiagnosticType.lines:
            return convertResultToDiagnosticByLines(document, result, diagnosticConfiguration, context);
        case DiagnosticType.json:
            return await convertResultToDiagnosticByObject(document, JSON.parse(result), diagnosticConfiguration, context);
        case DiagnosticType.yaml:
            return await convertResultToDiagnosticByObject(document, YAML.load(result), diagnosticConfiguration, context);
    }
    return [];
}

function convertResultToDiagnosticByLines(document:vscode.TextDocument, result: string, diagnosticConfiguration: Required<DiagnosticConfigurationLines>, context: Context) {
    let diagnosticStrings: string[] = [result];
    switch (diagnosticConfiguration.type) {
        case DiagnosticType.lines:
            diagnosticStrings = result.trim().replace("\r\n", "\n").replace("\r", "\n").split("\n");
            break;
    }
    const [regexp, keys] = formatToRegexpAndKeys(diagnosticConfiguration.format);
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
        const severity = match.groups[diagnosticSeverityKey];
        if (!file || !startLineString) {
            continue;
        }
        let startLine = parseInt(startLineString);
        if (!diagnosticConfiguration.lineZeroBased) {
            startLine--;
        };
        let startColumn = 0;
        if (startColumnString) {
            startColumn = parseInt(startColumnString);
            if (!diagnosticConfiguration.columnZeroBased) {
                startColumn--;
            }
            if (!diagnosticConfiguration.columnCharacterBased) {
                startColumn = byteBasedToCharacterBased(document.lineAt(startLine).text, startColumn);
            }
        }
        let endLine = endLineString ? parseInt(endLineString) : undefined;
        if (endLine === undefined) {
            endLine = startLine;
        } else if (!diagnosticConfiguration.lineZeroBased) {
            endLine--;
        }
        let endColumn = endColumnString ? parseInt(endColumnString) : undefined;
        if (endColumn === undefined) {
            endColumn = document.lineAt(endLine).text.length;
        } else {
            if (!diagnosticConfiguration.columnZeroBased) {
                endColumn--;
            }
            if (!diagnosticConfiguration.columnCharacterBased) {
                endColumn = byteBasedToCharacterBased(document.lineAt(endLine).text, endColumn);
            }
            if (diagnosticConfiguration.endColumnInclusive) {
                endColumn++;
            }
        }
        const rawData: { [index: string]: string } = {};
        for (const key of keys) {
            rawData[key] = match.groups[key];
        }
        diagnostics.push(new Diagnostic(
            file,
            new vscode.Range(startLine, startColumn, endLine, endColumn),
            message,
            diagnosticSeverityMap[severity ? diagnosticConfiguration.severityMap[severity] : diagnosticConfiguration.severity],
            diagnosticConfiguration,
            context,
            rawData,
        ));
    }
    return diagnostics;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function convertResultToDiagnosticByObject(document: vscode.TextDocument, result: any, diagnosticConfiguration: Required<DiagnosticConfigurationJSON | DiagnosticConfigurationYAML>, context: Context) {
    const diagnostics: Diagnostic[] = [];
    const selectors = diagnosticConfiguration.selectors;
    if (!selectors.diagnostics || !selectors.file || !selectors.startLine || !selectors.startColumn) {
        return diagnostics;
    }
    const resultDiagnostics = await safeEval(selectors.diagnostics, result);
    if (!resultDiagnostics || !Array.isArray(resultDiagnostics)) {
        return diagnostics;
    }
    for (const resultDiagnostic of resultDiagnostics) {
        const file = await safeEval(selectors.file, resultDiagnostic);
        if (!file) {
            continue;
        }
        if (selectors.subDiagnostics) {
            const subResultDiagnostics = await safeEval(selectors.subDiagnostics, resultDiagnostic);
            if (!subResultDiagnostics || !Array.isArray(subResultDiagnostics)) {
                continue;
            }
            for (const subResultDiagnostic of subResultDiagnostics) {
                const diagnostic = await convertDiagnosticObject(document, subResultDiagnostic, diagnosticConfiguration, context, file);
                if (diagnostic) {
                    diagnostics.push(diagnostic);
                }
            }
        } else {
            const diagnostic = await convertDiagnosticObject(document, resultDiagnostic, diagnosticConfiguration, context, file);
            if (diagnostic) {
                diagnostics.push(diagnostic);
            }
        }
    }
    return diagnostics;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function convertDiagnosticObject(document: vscode.TextDocument, result: any, diagnosticConfiguration: Required<DiagnosticConfigurationJSON | DiagnosticConfigurationYAML>, context: Context, parentFile: string) {
    const selectors = diagnosticConfiguration.selectors;
    const file = await safeEval(selectors.file, result) || parentFile;
    if (!file) {
        return;
    }
    const message = selectors.message ? await safeEval(selectors.message, result) : "";
    let startLine = await safeEval(selectors.startLine, result);
    if (typeof startLine !== "number") {
        return;
    }
    if (!diagnosticConfiguration.lineZeroBased) {
        startLine--;
    }
    let startColumn = await safeEval(selectors.startColumn, result);
    if (typeof startColumn !== "number") {
        return;
    }
    if (!diagnosticConfiguration.columnZeroBased) {
        startColumn--;
    }
    if (!diagnosticConfiguration.columnCharacterBased) {
        startColumn = byteBasedToCharacterBased(document.lineAt(startLine).text, startColumn);
    }
    let endLine = selectors.endLine ? await safeEval(selectors.endLine, result) : undefined;
    if (typeof endLine !== "number" && typeof endLine !== "undefined") {
        return;
    }
    if (endLine === undefined) {
        endLine = startLine;
    } else if (!diagnosticConfiguration.lineZeroBased) {
        endLine--;
    }
    let endColumn = selectors.endColumn ? await safeEval(selectors.endColumn, result) : undefined;
    if (typeof endColumn !== "number" && typeof endColumn !== "undefined") {
        return;
    }
    if (endColumn === undefined) {
        endColumn = document.lineAt(endLine).text.length;
    } else {
        if (!diagnosticConfiguration.columnZeroBased) {
            endColumn--;
        }
        if (!diagnosticConfiguration.columnCharacterBased) {
            endColumn = byteBasedToCharacterBased(document.lineAt(endLine).text, endColumn);
        }
        if (diagnosticConfiguration.endColumnInclusive) {
            endColumn++;
        }
    }
    const severity = selectors.severity ? await safeEval(selectors.severity, result) : undefined;
    return new Diagnostic(
        file,
        new vscode.Range(startLine, startColumn, endLine, endColumn),
        message,
        diagnosticSeverityMap[severity ? diagnosticConfiguration.severityMap[severity] : diagnosticConfiguration.severity],
        diagnosticConfiguration,
        context,
        result
    );
}

function formatToRegexpAndKeys(format: string): [RegExp, Set<string>] {
    const keys = new Set<string>();
    let position = 0;
    let pattern = "";
    for (; ;) {
        const match = format.substring(position).match(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/);
        if (!match || match.index === undefined || match.index === null) {
            break;
        }
        const actualPosition = match.index + position;
        if (position < actualPosition) {
            pattern += escapeRegexp(format.substring(position, actualPosition));
        }
        keys.add(match[1]);
        const found = diagnosticFormatKeys.find(key => key.key === match[1]);
        const keyType = found ? found.type : DiagnosticFormatKeyType.string;
        const globPattern = keyType === DiagnosticFormatKeyType.string ? ".*" : "\\d+";
        pattern += `(?<${match[1]}>${globPattern})`;
        position += match.index + match[0].length;
    }
    if (position < format.length) {
        pattern += escapeRegexp(format.substring(position));
    }
    return [new RegExp(pattern), keys];
}