# Change Log

## [0.2.1]

### Added

- severity selector option
- lint on open document

## [0.2.0]

### Breaking

- `eval()` had been used to evaluate condition, but currenly we use https://github.com/justinfagnani/jexpr to safe eval.

## [0.1.0]

### Breaking

- When `change` is used for `on`, current editing buffer is passed to spawned process by `STDIN`

## [0.0.9]

### Fixed

- `oepnUri` command was valid even if `uri` is undefined

## [0.0.8]

### Added

- Run code action

## [0.0.7]

### Added

- extension icon

## [0.0.6]

### Fixed

- js-yaml was not included in published extension

## [0.0.5]

### Added

- Diagnostics code actions. Opening URI and inserting ignore comment.

## [0.0.4]

### Added

- JSON and YAML output

## [0.0.3]

### Fixed

- make format's regexp accurate and resolution of file path robust

## [0.0.2]

### Added

- diagnostic.severity option has been added

### Fixed 

- Last result remains when lint success

## [0.0.1]

- Initial release