export interface IDisposable {
    dispose: () => unknown;
}

export enum Event {
    change = "change",
    save = "save",
    force = "force",
    open = "open",
}


export interface LinterConfiguration {
    name: string;
    disabled?: boolean;
    binPath?: string;
    args?: string[];
    cwd?: string;
    condition?: string;
    on?: Event[];
    diagnostic?: DiagnosticConfiguration;
}

export enum DiagnosticOutputType {
    stdout = "stdout",
    stderr = "stderr"
}

export enum DiagnosticType {
    lines = "lines",
    json = "json",
    yaml = "yaml"
}

export enum DiagnosticSeverity {
    error = "error",
    warning = "warning",
    info = "info",
    hint = "hint"
}

interface DiagnosticConfigurationBase {
    type?: DiagnosticType;
    output?: DiagnosticOutputType;
    lineZeroBased?: boolean;
    columnZeroBased?: boolean;
    columnCharacterBased?: boolean;
    endColumnInclusive?: boolean;
    severity?: DiagnosticSeverity;
    severityMap?: { [severity: string]: DiagnosticSeverity };
    actions?: DiagnosticAction[];
}

export type DiagnosticConfiguration = DiagnosticConfigurationLines | DiagnosticConfigurationJSON | DiagnosticConfigurationYAML;

export type DiagnosticConfigurationLines = DiagnosticConfigurationBase & {
    type: DiagnosticType.lines
    format?: string;
};

export type DiagnosticConfigurationJSON = DiagnosticConfigurationBase & {
    type: DiagnosticType.json;
    selectors?: DiagnosticSelectors;
};

export type DiagnosticConfigurationYAML = DiagnosticConfigurationBase & {
    type: DiagnosticType.yaml;
    selectors?: DiagnosticSelectors;
};

export interface DiagnosticSelectors {
    diagnostics: string;
    file: string;
    subDiagnostics?: string;
    startLine: string;
    startColumn: string;
    endLine?: string;
    endColumn?: string;
    message?: string;
    severity?: string;
}

export enum DiagnosticActionType {
    openUri = "openUri",
    ignore = "ignore",
    run = "run",
}

export enum DiagnosticCommentLocation {
    startFile = "startFile",
    previousLine = "previousLine",
    currentLine = "currentLine",
    nextLine = "nextLine",
}

interface DiagnosticActionBase {
    type: DiagnosticActionType;
    title: string;
    condition?: string;
}

export type DiagnosticAction = DiagnosticActionOpenUri | DiagnosticActionIgnore | DiagnosticActionRun;

export type DiagnosticActionOpenUri = DiagnosticActionBase & {
    type: DiagnosticActionType.openUri;
    uri: string;
};

export type DiagnosticActionIgnore = DiagnosticActionBase & {
    type: DiagnosticActionType.ignore;
    comment: string;
    location?: DiagnosticCommentLocation
};

export type DiagnosticActionRun = DiagnosticActionBase & {
    type: DiagnosticActionType.run;
    binPath?: string;
    args?: string[];
    cwd?: string;
    lintAfterRun?: string
};