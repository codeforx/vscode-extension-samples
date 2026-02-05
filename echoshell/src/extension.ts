import * as vscode from "vscode";

const TerminalProfileName = "EchoShell";
const dec = new TextDecoder();
const enc = new TextEncoder();

enum ConnectionStatus {
  Connected = "Connected",
  Connecting = "Connecting",
  Disconnected = "Disconnected",
  Reconnecting = "Reconnecting",
  Unknown = "Unknown",
}

function arrayBufferToJson(arrayBuffer: ArrayBuffer): any {
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

class EndpointTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly value: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label || value, collapsibleState);
    this.tooltip = value;
    this.iconPath = new vscode.ThemeIcon("vm-connect");
    this.contextValue = "endpoint";
  }
}

class TerminalReferenceTreeItem extends vscode.TreeItem {
  constructor(
    public readonly terminal: vscode.Terminal,
    public readonly connectionStatus: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(terminal.name, collapsibleState);
    this.tooltip = `${connectionStatus} - Click to show ${terminal.name}`;
    this.description = connectionStatus;
    this.iconPath = this.getIconForStatus(connectionStatus);
    this.contextValue = "terminalReference";
    this.command = {
      command: "echoshell.showTerminal",
      title: "Show Terminal",
      arguments: [terminal],
    };
  }

  private getIconForStatus(status: string): vscode.ThemeIcon {
    switch (status) {
      case "Connected":
        return new vscode.ThemeIcon(
          "check",
          new vscode.ThemeColor("terminal.ansiGreen"),
        );
      case "Connecting":
        return new vscode.ThemeIcon(
          "sync~spin",
          new vscode.ThemeColor("terminal.ansiYellow"),
        );
      case "Disconnected":
        return new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("terminal.ansiRed"),
        );
      case "Reconnecting":
        return new vscode.ThemeIcon(
          "debug-disconnect",
          new vscode.ThemeColor("terminal.ansiYellow"),
        );
      default:
        return new vscode.ThemeIcon("terminal");
    }
  }
}

class EndpointTreeProvider
  implements
    vscode.TreeDataProvider<EndpointTreeItem | TerminalReferenceTreeItem> {
  public static readonly viewType = "echoshell";

  private _onDidChangeTreeData: vscode.EventEmitter<
    EndpointTreeItem | TerminalReferenceTreeItem | undefined | null | void
  > = new vscode.EventEmitter<
    EndpointTreeItem | TerminalReferenceTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData: vscode.Event<
    EndpointTreeItem | TerminalReferenceTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private terminalsByEndpoint: Map<string, vscode.Terminal[]> = new Map();
  private connectionStatusByTerminal: Map<vscode.Terminal, string> = new Map();

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  registerTerminal(endpoint: string, terminal: vscode.Terminal): void {
    const terminals = this.terminalsByEndpoint.get(endpoint) || [];
    terminals.push(terminal);
    this.terminalsByEndpoint.set(endpoint, terminals);
    this.connectionStatusByTerminal.set(terminal, ConnectionStatus.Connecting);
    this.refresh();
  }

  updateConnectionStatus(terminal: vscode.Terminal, status: string): void {
    this.connectionStatusByTerminal.set(terminal, status);
    this.refresh();
  }

  unregisterTerminal(terminal: vscode.Terminal): void {
    this.connectionStatusByTerminal.delete(terminal);
    for (const [endpoint, terminals] of this.terminalsByEndpoint.entries()) {
      const index = terminals.indexOf(terminal);
      if (index !== -1) {
        terminals.splice(index, 1);
        if (terminals.length === 0) {
          this.terminalsByEndpoint.delete(endpoint);
        }
        this.refresh();
        break;
      }
    }
  }

  getTreeItem(
    element: EndpointTreeItem | TerminalReferenceTreeItem,
  ): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: EndpointTreeItem | TerminalReferenceTreeItem,
  ): Promise<(EndpointTreeItem | TerminalReferenceTreeItem)[]> {
    if (!element) {
      // Root level - show endpoints
      const endpoints = getTerminalEndpoints();
      return endpoints.map(
        (endpoint) => {
          const hasChildren =
            (this.terminalsByEndpoint.get(endpoint.value)?.length || 0) > 0;
          return new EndpointTreeItem(
            endpoint.label,
            endpoint.value,
            hasChildren
              ? vscode.TreeItemCollapsibleState.Expanded
              : vscode.TreeItemCollapsibleState.None,
          );
        },
      );
    }

    if (element instanceof EndpointTreeItem) {
      // Child level - show terminals for this endpoint
      const terminals = this.terminalsByEndpoint.get(element.value) || [];
      return terminals.map(
        (terminal) => {
          const status = this.connectionStatusByTerminal.get(terminal) ||
            "Unknown";
          return new TerminalReferenceTreeItem(
            terminal,
            status,
            vscode.TreeItemCollapsibleState.None,
          );
        },
      );
    }

    return [];
  }
}

export function activate(context: vscode.ExtensionContext) {
  const persistedTerminals =
    context.globalState.get<TerminalEndpointInfo[]>("persistedTerminals") || [];

  const provider = new EndpointTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      EndpointTreeProvider.viewType,
      provider,
    ),
  );

  function createTrackedTerminal(info: TerminalEndpointInfo): vscode.Terminal {
    const terminal = vscode.window.createTerminal({
      name: info.label,
      pty: PersistentPty(info.value, (status: string) => {
        provider.updateConnectionStatus(terminal, status);
      }),
      location: vscode.TerminalLocation.Editor,
      iconPath: new vscode.ThemeIcon("terminal"),
    });

    provider.registerTerminal(info.value, terminal);

    const existing = persistedTerminals.find((t) =>
      t.label === info.label && t.value === info.value
    );
    if (!existing) {
      persistedTerminals.push(info);
      context.globalState.update("persistedTerminals", persistedTerminals);
    }

    const disposable = vscode.window.onDidCloseTerminal(
      (closed: vscode.Terminal) => {
        if (closed === terminal) {
          const idx = persistedTerminals.findIndex((t) =>
            t.label === info.label && t.value === info.value
          );
          if (idx !== -1) persistedTerminals.splice(idx, 1);
          context.globalState.update("persistedTerminals", persistedTerminals);
          provider.unregisterTerminal(terminal);
          disposable.dispose();
        }
      },
    );

    return terminal;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("echoshell.addToConfigArray", async () => {
      await handleAddEndpoint();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("echoshell.editConfigArray", async () => {
      await handleEditEndpoints();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "echoshell.openTerminalFromItem",
      async (item: EndpointTreeItem) => {
        if (!item) return;
        await vscode.commands.executeCommand("echoshell.createNewTerminal", {
          label: item.label,
          value: item.value,
        });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "echoshell.showTerminal",
      async (terminal: vscode.Terminal) => {
        terminal.show();
      },
    ),
  );

  // Add an event listener to trigger tree refresh when settings.json is updated
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("echoshell.terminalEndpoints")) {
      provider.refresh();
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
        const selected: TerminalEndpointInfo | undefined =
          input?.value && input?.label ? input : await selectOrCreateEndpoint();

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

        createTrackedTerminal(selected);
      },
    ),
  );

  for (const [index, info] of persistedTerminals.entries()) {
    setTimeout(() => {
      createTrackedTerminal(info);
    }, 1000 * (1 + index));
  }
}

interface TerminalEndpointInfo {
  value: string;
  label: string;
}

enum QuickPickAction {
  Add = "add",
  Edit = "edit",
}

interface EndpointQuickPickItem extends vscode.QuickPickItem {
  kind?: vscode.QuickPickItemKind;
  action?: QuickPickAction;
  endpoint?: TerminalEndpointInfo;
}

async function showEndpointQuickPick(options: {
  includeAdd?: boolean;
  includeEdit?: boolean;
  placeholder?: string;
}): Promise<TerminalEndpointInfo | QuickPickAction | undefined> {
  const items: EndpointQuickPickItem[] = [];

  // Add endpoint items
  const endpoints = getTerminalEndpoints();
  items.push(
    ...endpoints.map((endpoint) => ({
      label: `$(vm-connect) ${endpoint.label || endpoint.value}`,
      description: "",
      endpoint: endpoint,
    })),
  );

  // Add separator if we have actions
  if (options.includeAdd || options.includeEdit) {
    items.push({
      label: "",
      kind: vscode.QuickPickItemKind.Separator,
    });
  }

  // Add action items
  if (options.includeAdd) {
    items.push({
      label: "$(add) Add New Endpoint",
      description: "Create and connect to a custom endpoint",
      alwaysShow: true,
      action: QuickPickAction.Add,
    });
  }

  if (options.includeEdit) {
    items.push({
      label: "$(edit) Edit Endpoints",
      description: "Open settings to manage endpoints",
      alwaysShow: true,
      action: QuickPickAction.Edit,
    });
  }

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: options.placeholder || "Select an endpoint",
  });

  if (!selected) {
    return undefined;
  }

  // Handle actions
  if (selected.action === QuickPickAction.Add) {
    const newEndpoint = await handleAddEndpoint();
    return newEndpoint ? newEndpoint : QuickPickAction.Add;
  }

  if (selected.action === QuickPickAction.Edit) {
    await handleEditEndpoints();
    return QuickPickAction.Edit;
  }

  // Return the selected endpoint
  return selected.endpoint;
}

async function selectOrCreateEndpoint(): Promise<
  TerminalEndpointInfo | undefined
> {
  const result = await showEndpointQuickPick({
    includeAdd: true,
    includeEdit: true,
    placeholder: "Select an endpoint or create a new one",
  });

  // Handle the special cases
  if (result === QuickPickAction.Edit) {
    // User chose to edit, show picker again
    return selectOrCreateEndpoint();
  }

  if (result === QuickPickAction.Add) {
    // Add was already handled, return undefined if cancelled
    return undefined;
  }

  return result as TerminalEndpointInfo | undefined;
}

function getTerminalEndpoints(): any[] {
  const config = vscode.workspace.getConfiguration("echoshell");
  return config.get("terminalEndpoints") || [];
}

async function addTerminalEndpoint(newItem: any) {
  const config = vscode.workspace.getConfiguration("echoshell");
  const oldEntries: any[] = config.get("terminalEndpoints") ||
    [];
  await config.update(
    "terminalEndpoints",
    [...oldEntries, newItem],
    vscode.ConfigurationTarget.Global,
  );
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

function createWebSocket(
  wsUrl: string,
  writeEmitter: vscode.EventEmitter<string>,
  onStatusChange?: (status: string) => void,
) {
  const wss = new WebSocket(wsUrl);
  wss.binaryType = "arraybuffer";

  wss.addEventListener("open", () => {
    onStatusChange?.("Connected");
  });

  wss.addEventListener("close", () => {
    onStatusChange?.("Disconnected");
  });

  wss.addEventListener("error", () => {
    onStatusChange?.("Disconnected");
  });

  wss.addEventListener("message", ({ data }: any) => {
    const { str, obj } = arrayBufferToJson(data);
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

function PersistentPty(
  wsUrl: string,
  onStatusChange?: (status: string) => void,
): vscode.Pseudoterminal {
  const writeEmitter = new vscode.EventEmitter<string>();
  let log = vscode.window.createOutputChannel("echoshell-PersistentPty");
  let wss = createWebSocket(wsUrl, writeEmitter, onStatusChange);
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
        onStatusChange?.(ConnectionStatus.Connected);
      } catch (err: any) {
        log.appendLine(`WebSocket error: ${err.message}`);
        onStatusChange?.(ConnectionStatus.Disconnected);
      }
    };
    onOpen();
  };
  const reOpen = async () => {
    vscode.window.showInformationMessage(`Reconnecting...`);
    onStatusChange?.(ConnectionStatus.Reconnecting);
    wss = createWebSocket(wsUrl, writeEmitter, onStatusChange);
    try {
      await initWebsocket(wss, initPayload);
      onStatusChange?.(ConnectionStatus.Connected);
    } catch (err: any) {
      onStatusChange?.(ConnectionStatus.Disconnected);
    }
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

async function handleAddEndpoint(): Promise<
  TerminalEndpointInfo | undefined
> {
  // First ask for the wss:// URL value
  const urlValue = await vscode.window.showInputBox({
    prompt: "Enter WebSocket URL",
    placeHolder: "wss://example.com or ws://example.com",
    validateInput: (value) => {
      if (!value) {
        return "URL cannot be empty";
      }
      if (!value.startsWith("wss://") && !value.startsWith("ws://")) {
        return "URL must start with wss:// or ws://";
      }
      return null;
    },
  });
  if (!urlValue) return;

  // Then ask for a label (optional, fallback to value)
  const label = await vscode.window.showInputBox({
    prompt: "Enter a label for this endpoint (optional)",
    placeHolder: urlValue,
  });

  const newItem = { label: label || urlValue, value: urlValue };
  await addTerminalEndpoint(newItem);
  return newItem;
}

async function handleEditEndpoints() {
  await vscode.commands.executeCommand(
    "workbench.action.openSettingsJson",
    { revealSetting: { key: "echoshell.terminalEndpoints", edit: true } },
  );
}
