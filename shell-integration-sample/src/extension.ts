import { dirname } from 'path';
import * as vscode from 'vscode';

const terminalProfileName = 'Tracking Editor';


export function activate(context: vscode.ExtensionContext) {
	const trackedTerminals = new Set<vscode.Terminal>();

	context.subscriptions.push(
		vscode.window.registerTerminalProfileProvider(
			"shell-integration-sample.track-editor-directory",
			{
			  provideTerminalProfile(token) {
				return {
				  options: {
					name: terminalProfileName,
					pty: echoPty(),
					// location: vscode.TerminalLocation.Editor,
					// isTransient: false,
				  },
				};
			  },
			},
		  ),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
		  "extension.createNewTerminal3",
		  async () => {
			vscode.window.createTerminal({
			  name: `EchoShell`,
			  pty: echoPty(),
			  location: vscode.TerminalLocation.Editor,
			});
		  },
		),
	  );
}

function echoPty(): vscode.Pseudoterminal {
	const writeEmitter = new vscode.EventEmitter<string>();
	let log = vscode.window.createOutputChannel("go-vscode-echo");
	return {
	  onDidWrite: writeEmitter.event,
	  open: (initialDimensions: vscode.TerminalDimensions | undefined) => {
		(async () => {
		  if (initialDimensions) {
			const { columns, rows } = initialDimensions;
			let payload = JSON.stringify({
			  "version": 2,
			  "width": columns,
			  "height": rows,
			  "cmd": ["/bin/bash"],
			  "env": {
				"TERM": "xterm-256color",
				"FOO": "BAR",
			  },
			});
			log.appendLine(`open: ${payload}`);
		  }
		})();
	  },
	  close: () => {
		log.appendLine(`close`);
	  },
	  handleInput: (data: string) => {
		let payload = JSON.stringify([0, "i", data]);
		writeEmitter.fire(data);
		log.appendLine(`handleInput: ${payload}`);
	  },
	  setDimensions: (dimensions: vscode.TerminalDimensions) => {
		const { columns, rows } = dimensions;
		let payload = JSON.stringify({
		  "version": 2,
		  "width": columns,
		  "height": rows,
		});
		log.appendLine(`setDimensions: ${payload}`);
	  },
	};
  }