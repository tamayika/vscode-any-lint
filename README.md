# VSCode Any Lint

VSCode Any Lint allows you to lint any files with any command line tools.

## Features

* Any file type
* Any command line tool

## Extension Settings


* `any-lint.linters`: Linter settings. Please see below Linter Configuration

### Linter Configuration

| Key        | Type                    | Required           | Detail                                                                           |
| ---------- | ----------------------- | ------------------ | -------------------------------------------------------------------------------- |
| name       | string                  | :heavy_check_mark: | the linter name. This is used for [Diagnostic.source][1].                        |
| binPath    | string                  | :heavy_check_mark: | the command line tool path.                                                      |
| args       | Array\<string\>         |                    | the command line tool arguments.                                                 |
| cwd        | string                  |                    | the current working directory. default is file's directory.                      |
| condition  | string                  |                    | if this JavaScript expression returns truthy value, linter starts.               |
| on         | Array\<string\>         |                    | `change`: on file changed. `save`: on file saved.                                |
| disabled   | boolean                 |                    | force disable linting. this is usedful for debug when you have multiple linters. |
| diagnostic | DiagnosticConfiguration |                    | the diagnostic configuration                                                     |

#### condition

You can write any JavaScript expression in condition.
You can access below context by `$` variable like `$.file`. This is based on [VSCode Variables Reference][2].

Example supposes following requirements.

1. A file located at `/home/your-username/your-project/folder/file.ext` opened in your editor;
2. The directory `/home/your-username/your-project` opened as your root workspace.

| Key                     | Detail                                                           | Example                                            |
| ----------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| workspaceFolder         | the path of the folder opened in VS Code                         | `/home/your-username/your-project`                 |
| workspaceFolderBasename | the name of the folder opened in VS Code without any slashes (/) | `your-project`                                     |
| file                    | the current opened file                                          | `/home/your-username/your-project/folder/file.ext` |
| fileWorkspaceFolder     | the current opened file's workspace folder                       | `/home/your-username/your-project`                 |
| relativeFile            | the current opened file relative to `workspaceFolder`            | `folder/file.ext`                                  |
| relativeFileDirname     | the current opened file's dirname relative to `workspaceFolder`  | `folder`                                           |
| fileBasename            | the current opened file's basename                               | `file.ext`                                         |
| fileBasenameNoExtension | the current opened file's basename with no file extension        | `file`                                             |
| fileDirname             | the current opened file's dirname                                | `/home/your-username/your-project/folder`          |
| fileExtname             | the current opened file's extension                              | `.ext`                                             |
| cwd                     | the same as `fileDirname`                                        | `/home/your-username/your-project/folder`          |
| lineNumber              | the line number of the cursor                                    |                                                    |
| selectedText            | the selected text in your code editor                            |                                                    |
| pathSeparator           | `/` on macOS or linux, `\\` on Windows                           |                                                    |
| languageId              | the current opened file's languageId                             |                                                    |

### Diagnostic Configuration

| Key                  | Type                      | Required | Detail                                                                                   |
| -------------------- | ------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| output               | string                    |          | the output type. `stdout` or `stderr`. default is `stderr`                               |
| type                 | string                    |          | the output format type. `lines`, `json` or `yaml`. default is `lines`                    |
| format               | string                    |          | the `lines` format option. default is `${file}:${startLine}:${startColumn}: ${message}`  |
| selectors            | DiagnosticSelectors       |          | the `json` or `yaml` selectors option.                                                   |
| lineZeroBased        | boolean                   |          | the reported diagnostic line is zero based or not. default is `false`                    |
| columnZeroBased      | boolean                   |          | the reported diagnostic column is zero based or not. default is `false`                  |
| columnCharacterBased | boolean                   |          | the reported diagnostic column unit is character or not. default is `false` (i.e. bytes) |
| endColumnInclusive   | boolean                   |          | the reported diagnostic end column is inclusive. default is `false` (i.e. exclusive)     |
| severity             | string                    |          | the severity. `error`, `warning`, `info` or `hint`. default is `error`                   |
| actions              | Array\<DiagnosticAction\> |          | the code actions.                                                                        |

#### format

format supports below placeholders

| Key         | Required           | Detail                         |
| ----------- | ------------------ | ------------------------------ |
| file        | :heavy_check_mark: | the file path                  |
| startLine   | :heavy_check_mark: | the start line of diagnostic   |
| startColumn | :heavy_check_mark: | the start column of diagnostic |
| endLine     |                    | the end line of diagnostic     |
| endColumn   |                    | the end column of diagnostic   |
| message     |                    | the message of diagnostic      |

#### DiagnosticSelectors

You can write any JavaScript expression as selector.
You can access below context by `$` variable like `$.file`.

| Key            | Required           | Detail                                               |
| -------------- | ------------------ | ---------------------------------------------------- |
| diagnostics    | :heavy_check_mark: | the diagnostics selector. result must be `Array`     |
| file           | :heavy_check_mark: | the file path selector. result must be `string`      |
| subDiagnostics |                    | the sub diagnostics selector. result must be `Array` |
| startLine      | :heavy_check_mark: | the start line selector. result must be `number`     |
| startColumn    | :heavy_check_mark: | the start column selector. result must be `number`   |
| endLine        |                    | the end line selector. result must be `number`       |
| endColumn      |                    | the end column selector. result must be `number`     |
| message        |                    | the message selector. result must be `string`        |

```js
// routine pseudo code
diagnostics = []
for (diagnostic of $[`diagnostics`]) {
    file = diagnostic[`file`]
    if (diagnostic[`subDiagnostics`]) {
        for (subDiagnostic of diagnostic[`subDiagnostics`]) {
            file = subDiangostic[`file`] || file
            diagnostics.push(
                file,
                subDiangostic[`startLine`],
                subDiangostic[`startColumn`],
                subDiangostic[`endLine`],
                subDiangostic[`endColumn`],
                subDiangostic[`message`]
            )
        } 
    } else {
        diagnostics.push(
            file,
            diangostic[`startLine`],
            diangostic[`startColumn`],
            diangostic[`endLine`],
            diangostic[`endColumn`],
            diangostic[`message`]
        )
    }
}
```

#### DiagnosticAction

This is code action setting for diagnostic. There are several types supported

* `openUri`: this is for opening lint rule documentation
* `ignore`: this is for inserting ignore rule comment

You can use two variables in configurations which support JavaScript expression.

* `$`: the same as `condition` setting
* `$$`: the reported diagnostic object. When you specify `subDiagnostics` selector, this is sub diagnostic.

| Key      | Type   | Required           | Detail                                                                                                                           |
| -------- | ------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| type     | string | :heavy_check_mark: | `openUri` or `ignore`                                                                                                            |
| title    | string | :heavy_check_mark: | the title of code action. JavaScript expression. result must be `string`                                                         |
| uri      | string |                    | the opening uri for `openUri`. JavaScript expression. result must be `string`                                                    |
| comment  | string |                    | the inserting comment for `ignore`. JavaScript expression. result must be `string`                                               |
| location | string |                    | the inserting comment location for `ignore`. `startFile`, `previousLine`, `currentLine` or `nextLine`. default is `previousLine` |

Please see below example for comment location.

```js
// startLine

// previousLine
foo // currentLine
// nextLine
```

### Examples

Please see [examples][3]

[1]:https://code.visualstudio.com/api/references/vscode-api#Diagnostic
[2]:https://code.visualstudio.com/docs/editor/variables-reference
[3]:https://github.com/tamayika/vscode-any-lint/tree/main/examples
