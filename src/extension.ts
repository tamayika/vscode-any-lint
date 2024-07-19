// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { AnyAction } from './action';
import { ignoreCommand, openUriCommand, Commands, runCommand, resetAllowRunCommand } from './command';
import { Linter } from './linter';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel("any-lint");
	const linter = new Linter(context, outputChannel);
	const commands = new Commands(context, outputChannel, linter);
	context.subscriptions.push(outputChannel);
	context.subscriptions.push(linter);
	vscode.languages.getLanguages().then(languageIds => {
		context.subscriptions.push(vscode.languages.registerCodeActionsProvider(languageIds, new AnyAction(outputChannel)));
	});
	context.subscriptions.push(vscode.commands.registerCommand(
		openUriCommand, commands.openUri,
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		ignoreCommand, commands.ignore
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		runCommand, commands.run
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		resetAllowRunCommand, commands.resetAllowRun
	));
}

// this method is called when your extension is deactivated
export function deactivate() {
	// noop
}
