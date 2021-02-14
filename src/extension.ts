// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { AnyAction } from './action';
import { ignore, ignoreCommand, openUri, openUriCommand } from './command';
import { Linter } from './linter';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel("any-lint");
	context.subscriptions.push(outputChannel);
	context.subscriptions.push(new Linter(outputChannel));
	vscode.languages.getLanguages().then(languageIds => {
		context.subscriptions.push(vscode.languages.registerCodeActionsProvider(languageIds, new AnyAction(outputChannel)));
	});
	context.subscriptions.push(vscode.commands.registerCommand(
		openUriCommand, openUri
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		ignoreCommand, ignore
	));
}

// this method is called when your extension is deactivated
export function deactivate() {
	// noop
}
