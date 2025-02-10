import { dirname } from "path";
import * as vscode from "vscode";

const terminalProfileName = "EchoShell";
const dec = new TextDecoder();
const enc = new TextEncoder();

function ab2json(arrayBuffer: ArrayBuffer): any {
  try {
    // Convert ArrayBuffer to string
    const jsonString = dec.decode(arrayBuffer);

    // Parse the JSON string
    const jsonObject = JSON.parse(jsonString);

    return {
      str: jsonString,
      obj: jsonObject,
    };
  } catch (error) {
    console.error("Error converting ArrayBuffer to JSON:", error);
    return null;
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerTerminalProfileProvider(
      "btwiuse.echoshell",
      {
        provideTerminalProfile(token) {
          return {
            options: {
              name: terminalProfileName,
              pty: echoPty(),
              location: vscode.TerminalLocation.Editor,
              isTransient: false,
            },
          };
        },
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "echoshell.createNewTerminal",
      async () => {
        // Show an input box to the user
        const userInput = await getOrAppendURL();

        if (!userInput) {
          return;
        }

        // Do something with the user input
        if (!userInput.startsWith("wss://") && !userInput.startsWith("ws://")) {
          vscode.window.showInformationMessage(
            `Invalid WS URL. Launching echo terminal...`,
          );
          vscode.window.createTerminal({
            name: `EchoShell`,
            pty: echoPty(),
            location: vscode.TerminalLocation.Editor,
          });
          return;
        }

        const wss = new WebSocket(userInput);
        wss.binaryType = "arraybuffer";
        vscode.window.createTerminal({
          name: `WebShell`,
          pty: wsPty(wss),
          location: vscode.TerminalLocation.Editor,
        });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("myExtension.editConfigArray", async () => {
      await vscode.commands.executeCommand(
        "workbench.action.openSettingsJson",
        { revealSetting: { key: "echoshell.terminalEndpoints", edit: true } },
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("myExtension.showConfigArray", async () => {
      const items: vscode.QuickPickItem[] = [
        ...getMyConfigArray(),
        {
          label: "ADD",
          description: `Add Custom Endpoint`, // Optional: Add a description
          alwaysShow: true,
        },
      ];
      const selectedItem = await vscode.window.showQuickPick(items, {
        placeHolder: "Select an item from the config array",
      });

      if (!selectedItem) {
        return;
      }
      let wssURL = "";
      if (selectedItem.label === "ADD") {
        const userInput = await vscode.window.showInputBox({
          prompt: "Please enter some text",
          placeHolder: "Type here...",
        });
        if (!userInput) return;
        await addMyConfigArray({ label: userInput });
        wssURL = userInput;
      } else {
        wssURL = selectedItem.label;
      }

      vscode.window.showInformationMessage(
        `Selected item: ${selectedItem.label}`,
      );
    }),
  );
}

async function getOrAppendURL(): Promise<string | undefined> {
  const items: vscode.QuickPickItem[] = [
    ...getMyConfigArray(),
    {
      label: "ADD",
      description: `Add and connect to custom endpoint`,
      alwaysShow: true,
    },
    {
      label: "EDIT",
      description: `Open endpoint settings`,
      alwaysShow: true,
    },
  ];
  const selectedItem = await vscode.window.showQuickPick(items, {
    placeHolder: "Select an item from the config array",
  });

  if (!selectedItem) {
    return;
  }
  if (selectedItem.label === "EDIT") {
    await vscode.commands.executeCommand(
      "workbench.action.openSettingsJson",
      { revealSetting: { key: "echoshell.terminalEndpoints", edit: true } },
    );
    return;
  }
  let wssURL = "";
  if (selectedItem.label === "ADD") {
    const userInput = await vscode.window.showInputBox({
      prompt: "Please enter some text",
      placeHolder: "Type here...",
    });
    if (!userInput) return;
    await addMyConfigArray({ label: userInput });
    wssURL = userInput;
  } else {
    wssURL = selectedItem.label;
  }
  return wssURL;
}

function getMyConfigArray(): vscode.QuickPickItem[] {
  const config = vscode.workspace.getConfiguration("echoshell");
  return config.get("terminalEndpoints") || [];
}

async function addMyConfigArray(newItem: vscode.QuickPickItem) {
  const config = vscode.workspace.getConfiguration("echoshell");
  const oldEntries: vscode.QuickPickItem[] = config.get("terminalEndpoints") ||
    [];
  await config.update(
    "terminalEndpoints",
    [...oldEntries, newItem],
    vscode.ConfigurationTarget.Global,
  );
  vscode.window.showInformationMessage(`Item added: ${newItem.label}`);
}

function waitForWebSocketOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      // If the WebSocket is already open, resolve immediately
      resolve();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      // Wait for the 'open' event
      ws.addEventListener("open", () => resolve(), { once: true });
      // Handle connection errors
      ws.addEventListener("error", (err: any) => {
        vscode.window.showInformationMessage(
          `WebSocket error observed: ${err.message}`,
        );
        reject(err);
      }, { once: true });
      // Handle connection closure before opening
      ws.addEventListener("close", (event) => {
        vscode.window.showInformationMessage("WebSocket is closed now.");
        reject(new Error(`WebSocket closed before opening: ${event.reason}`));
      }, { once: true });
    } else {
      // If the WebSocket is in CLOSING or CLOSED state, reject
      reject(new Error(`WebSocket is in state ${ws.readyState}`));
    }
  });
}

function wsPty(wss: WebSocket): vscode.Pseudoterminal {
  const writeEmitter = new vscode.EventEmitter<string>();
  let log = vscode.window.createOutputChannel("echoshell-wsPty");
  wss.addEventListener("message", ({ data }: any) => {
    const { str, obj } = ab2json(data);
    let payload = JSON.stringify(obj);
    // log.appendLine(`recv: ${payload}`);
    if (obj[1] === "o") {
      writeEmitter.fire(obj[2]);
    }
  });
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
          try {
            await waitForWebSocketOpen(wss);
            log.appendLine(`open: ${payload}`);
            wss.send(enc.encode(payload + "\n"));
          } catch (err: any) {
            log.appendLine(`WebSocket error: ${err.message}`);
          }
        }
      })();
    },
    close: () => {
      wss.close();
      // log.appendLine(`close`);
    },
    handleInput: (data: string) => {
      let payload = JSON.stringify([0, "i", data]);
      // log.appendLine(`handleInput: ${payload}`);
      if (wss.readyState === WebSocket.OPEN) {
        wss.send(enc.encode(payload + "\n"));
      }
    },
    setDimensions: (dimensions: vscode.TerminalDimensions) => {
      const { columns, rows } = dimensions;
      let payload = JSON.stringify({
        "version": 2,
        "width": columns,
        "height": rows,
      });
      // log.appendLine(`setDimensions: ${payload}`);
      if (wss.readyState === WebSocket.OPEN) {
        wss.send(enc.encode(payload + "\n"));
      }
    },
  };
}

function echoPty(): vscode.Pseudoterminal {
  const writeEmitter = new vscode.EventEmitter<string>();
  let log = vscode.window.createOutputChannel("echoshell-echoPty");
  let line = "";
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
      log.appendLine(`handleInput: ${payload}`);
      if (data === "\r") { // Enter
        writeEmitter.fire(`\r\n`);
        line = "";
        return;
      }
      if (data === "\u0003") {
        writeEmitter.fire(`^C`);
        return;
      }
      if (data === "\x7f") { // Backspace
        if (line.length === 0) {
          return;
        }
        line = line.substr(0, line.length - 1);
        // Move cursor backward
        writeEmitter.fire("\x1b[D");
        // Delete character
        writeEmitter.fire("\x1b[P");
        return;
      }
      /*
		if (data === '\f') {
			writeEmitter.fire();
			return;
		}
		*/
      line += data;
      writeEmitter.fire(data);
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
