import * as vscode from "vscode";

const TerminalProfileName = "EchoShell";
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

class SideOutputProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "echoshell";

  constructor(private readonly extUri: vscode.Uri) {}

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
    };

    const htmlUri = vscode.Uri.joinPath(this.extUri, "media/index.html");
    const buffer = await vscode.workspace.fs.readFile(htmlUri);

    updateEndpoints = async () => {
      webviewView.webview.postMessage({
        command: "updateEndpoints",
        endpoints: await getMyConfigArray(),
      });
    };

    webviewView.webview.html = new TextDecoder("utf-8").decode(buffer);
    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "ADD":
            await handleAdd();
            break;
          case "EDIT":
            await handleEdit();
            break;
          case "UPDATE_ENDPOINTS":
            await updateEndpoints();
            break;
          case "openTerminal":
            await vscode.commands.executeCommand(
              "echoshell.createNewTerminal",
              message.endpoint,
            );
            break;
          default:
            vscode.window.showInformationMessage(
              `Unknown command: ${message.command}`,
            );
        }
      },
    );
  }
}

let updateEndpoints = async () => {
  vscode.window.showInformationMessage(
    `Updating endpoints...`,
  );
};

export function activate(context: vscode.ExtensionContext) {
  const provider = new SideOutputProvider(context.extensionUri);
  vscode.window.registerWebviewViewProvider(
    SideOutputProvider.viewType,
    provider,
    { webviewOptions: { retainContextWhenHidden: false } },
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("echoshell.addToConfigArray", async () => {
      await handleAdd();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("echoshell.editConfigArray", async () => {
      await handleEdit();
    }),
  );

  // Add an event listener to trigger webview refresh when settings.json is updated
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("echoshell.terminalEndpoints")) {
      updateEndpoints();
    }
  });

  context.subscriptions.push(
    vscode.window.registerTerminalProfileProvider(
      "btwiuse.echoshell",
      {
        provideTerminalProfile(token) {
          return {
            options: {
              name: TerminalProfileName,
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
      async (input: any) => {
        // Use input object if provided, otherwise show input box
        const selected = input?.value && input?.label
          ? input
          : await getOrAppendURL();

        if (!selected) {
          return;
        }

        // Do something with the user input
        if (
          !selected.value.startsWith("wss://") &&
          !selected.value.startsWith("ws://")
        ) {
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

        vscode.window.createTerminal({
          name: selected.label,
          pty: PersistentPty(selected.value),
          location: vscode.TerminalLocation.Editor,
          iconPath: new vscode.ThemeIcon("terminal"),
        });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("echoshell.showConfigArray", async () => {
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
        await addMyConfigArray({ label: userInput, value: userInput });
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

async function getOrAppendURL(): Promise<
  { label: string; value: string } | undefined
> {
  const items = [
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
    await handleEdit();
    return;
  }
  let selected = undefined;
  if (selectedItem.label === "ADD") {
    selected = await handleAdd();
  } else {
    selected = { label: selectedItem.label, value: selectedItem.value };
  }
  return selected;
}

function getMyConfigArray(): any[] {
  const config = vscode.workspace.getConfiguration("echoshell");
  return config.get("terminalEndpoints") || [];
}

async function addMyConfigArray(newItem: any) {
  const config = vscode.workspace.getConfiguration("echoshell");
  const oldEntries: any[] = config.get("terminalEndpoints") ||
    [];
  await config.update(
    "terminalEndpoints",
    [...oldEntries, newItem],
    vscode.ConfigurationTarget.Global,
  );
  vscode.window.showInformationMessage(`Item added: ${newItem.label}`);
}

function initWebsocket(ws: WebSocket, payload: any): Promise<void> {
  const sendInitPayload = () => {
    ws.send(enc.encode(payload + "\n"));
  };
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      // If the WebSocket is already open, resolve immediately
      sendInitPayload();
      resolve();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      // Wait for the 'open' event
      ws.addEventListener("open", () => {
        sendInitPayload();
        resolve();
      }, { once: true });
      // Handle connection errors
      ws.addEventListener("error", (err: any) => {
        vscode.window.showInformationMessage(
          `WebSocket error ${err}. Press enter to reconnect.`,
        );
        reject(err);
      }, { once: true });
      // Handle connection closure before opening
      ws.addEventListener("close", (event) => {
        vscode.window.showInformationMessage(
          "WebSocket closed. Press enter to reconnect.",
        );
        reject(new Error(`WebSocket closed before opening: ${event.reason}`));
      }, { once: true });
    } else {
      // If the WebSocket is in CLOSING or CLOSED state, reject
      reject(new Error(`WebSocket is in state ${ws.readyState}`));
    }
  });
}

function newWss(wsUrl: string, writeEmitter: vscode.EventEmitter<string>) {
  const wss = new WebSocket(wsUrl);
  wss.binaryType = "arraybuffer";
  wss.addEventListener("message", ({ data }: any) => {
    const { str, obj } = ab2json(data);
    const payload = JSON.stringify(obj);
    // log.appendLine(`recv: ${payload}`);
    if (obj[1] === "o") {
      writeEmitter.fire(obj[2]);
    }
  });
  return wss;
}

const InitPayload = {
  "version": 2,
  "width": 80,
  "height": 32,
  "cmd": ["/bin/bash"],
  "env": {
    "TERM": "xterm-256color",
    "FOO": "BAR",
  },
};

function PersistentPty(wsUrl: string): vscode.Pseudoterminal {
  const writeEmitter = new vscode.EventEmitter<string>();
  let log = vscode.window.createOutputChannel("echoshell-PersistentPty");
  let wss = newWss(wsUrl, writeEmitter);
  let initPayload = "";
  const open = (dimensions: vscode.TerminalDimensions | undefined) => {
    initPayload = JSON.stringify({
      ...InitPayload,
      "width": dimensions!.columns,
      "height": dimensions!.rows,
    });
    const onOpen = async () => {
      try {
        await initWebsocket(wss, initPayload);
        log.appendLine(`open: ${initPayload}`);
      } catch (err: any) {
        log.appendLine(`WebSocket error: ${err.message}`);
      }
    };
    onOpen();
  };
  const reOpen = async () => {
    vscode.window.showInformationMessage(`Reconnecting...`);
    wss = newWss(wsUrl, writeEmitter);
    await initWebsocket(wss, initPayload);
  };
  const close = () => {
    wss.close();
    // log.appendLine(`close`);
  };
  const handleInput = (data: string) => {
    const payload = JSON.stringify([0, "i", data]);
    // log.appendLine(`handleInput: ${payload}`);
    if (wss.readyState === WebSocket.OPEN) {
      wss.send(enc.encode(payload + "\n"));
    } else {
      reOpen();
    }
  };
  const setDimensions = (dimensions: vscode.TerminalDimensions) => {
    const payload = JSON.stringify({
      "version": 2,
      "width": dimensions.columns,
      "height": dimensions.rows,
    });
    // log.appendLine(`setDimensions: ${payload}`);
    if (wss.readyState === WebSocket.OPEN) {
      wss.send(enc.encode(payload + "\n"));
    }
  };
  return {
    onDidWrite: writeEmitter.event,
    open,
    close,
    handleInput,
    setDimensions,
  };
}

function echoPty(): vscode.Pseudoterminal {
  const writeEmitter = new vscode.EventEmitter<string>();
  let log = vscode.window.createOutputChannel("echoshell-echoPty");
  let line = "";
  return {
    onDidWrite: writeEmitter.event,
    open: (dimensions: vscode.TerminalDimensions | undefined) => {
      (async () => {
        if (dimensions) {
          let payload = JSON.stringify({
            "version": 2,
            "width": dimensions.columns,
            "height": dimensions.rows,
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
      let payload = JSON.stringify({
        "version": 2,
        "width": dimensions.columns,
        "height": dimensions.rows,
      });
      log.appendLine(`setDimensions: ${payload}`);
    },
  };
}

async function handleAdd(): Promise<
  { label: string; value: string } | undefined
> {
  const userInput = await vscode.window.showInputBox({
    prompt: "Please enter some text",
    placeHolder: "Type here...",
  });
  if (!userInput) return;
  const newItem = { label: userInput, value: userInput };
  await addMyConfigArray(newItem);
  return newItem;
}

async function handleEdit() {
  await vscode.commands.executeCommand(
    "workbench.action.openSettingsJson",
    { revealSetting: { key: "echoshell.terminalEndpoints", edit: true } },
  );
}
