import * as vscode from "vscode";

class SideOutputProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "gopilot";

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
    webviewView.webview.html = new TextDecoder("utf-8").decode(buffer);
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new SideOutputProvider(context.extensionUri);
  vscode.window.registerWebviewViewProvider(
    SideOutputProvider.viewType,
    provider,
    { webviewOptions: { retainContextWhenHidden: true } },
  );
}

export function deactivate() {}
