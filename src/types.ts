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
    lines = "lines"
}


export interface DiagnosticConfiguration {
    output?: DiagnosticOutputType;
    type?: DiagnosticType;
    format?: string;
    lineZeroBased?: boolean;
    columnZeroBased?: boolean;
    columnCharacterBased?: boolean;
}
