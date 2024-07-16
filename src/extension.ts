// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { AnyAction } from './action';
import { ignoreCommand, openUriCommand, Commands, runCommand } from './command';
import { Linter } from './linter';
import { getQuickJS } from "quickjs-emscripten";
import { Arena } from "quickjs-emscripten-sync";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel("any-lint");
	const linter = new Linter(outputChannel);
	const commands = new Commands(outputChannel, linter);
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
	(async () => {
		const ctx = (await getQuickJS()).newContext();
		const arena = new Arena(ctx, { isMarshalable: true });
		console.log(arena.evalCode("1 + 1"));
	})();
}

// this method is called when your extension is deactivated
export function deactivate() {
	// noop
}
