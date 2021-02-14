export interface IDisposable {
    dispose: () => unknown;
}

export enum Event {
    change = "change",
    save = "save",
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

export interface DiagnosticConfiguration {
    output?: DiagnosticOutputType;
    type?: DiagnosticType;
    format?: string;
    selectors?: DiagnosticSelectors;
    lineZeroBased?: boolean;
    columnZeroBased?: boolean;
    columnCharacterBased?: boolean;
    endColumnInclusive?: boolean;
    severity?: DiagnosticSeverity;
    actions?: DiagnosticAction[];
}

export interface DiagnosticSelectors {
    diagnostics: string;
    file: string;
    subDiagnostics?: string;
    startLine: string;
    startColumn: string;
    endLine?: string;
    endColumn?: string;
    message?: string;
}

export enum DiagnosticActionType {
    openUri = "openUri",
    ignore = "ignore",
}

export enum DiagnosticCommentLocation {
    startFile = "startFile",
    previousLine = "previousLine",
    currentLine = "currentLine",
    nextLine = "nextLine",
}

export interface DiagnosticAction {
    type: DiagnosticActionType;
    title: string;
    uri: string;
    comment: string;
    location?: DiagnosticCommentLocation
}
