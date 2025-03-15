import * as vscode from 'vscode';

class SideOutputProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'gopilot';
    private _view?: vscode.WebviewView;
    private _extUri?: vscode.Uri;

    constructor() { }

    async resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true
        };
        const htmlUri = vscode.Uri.joinPath(this._extUri!, 'media/index.html');
        const html = await vscode.workspace.fs.readFile(htmlUri).then(buffer => buffer.toString());
        webviewView.webview.html = html;
    }

    setContent(data: any) {
        if (this._view) {
            if (data.image) {
                const timestamp = new Date().getTime();
                const comUri = vscode.Uri.parse(`command:NclNotebook.openImage?${JSON.stringify(data.image)}`);
                const fileName = data.image.split('/').pop();
                data.image = `<button id="copy" onclick="copyImage()">Copy</button><button id="save" name="${fileName}" onclick="saveImage()">Save</button><button id="pin" onclick="pinImage()">Pin</button><button id="crop" onclick="cropImage()">Crop</button><br><a href="${comUri}"><img id="image" onmouseout="resetScroll()" src="${this._view.webview.asWebviewUri(vscode.Uri.file(data.image)) + '?timestamp=' + timestamp}"></a>`;
            }
            if (data.pdf) {
                const timestamp = new Date().getTime();
                const fileName = data.pdf.split('/').pop().replace('.pdf', '.png');
                const comUri = vscode.Uri.parse(`command:NclNotebook.openImage?${JSON.stringify(data.pdf)}`);
                data.pdf = `${this._view.webview.asWebviewUri(vscode.Uri.file(data.pdf))}`;
                data.pdfHtml = `<button id="copy" onclick="copyImage()">Copy</button><button id="save" name="${fileName}" onclick="saveImage()">Save</button><button id="pin" onclick="pinImage()">Pin</button><button id="crop" onclick="cropImage()">Crop</button><br><a href="${comUri}"><img id="image" onmouseout="resetScroll()"></div></a>`;
            }
            this._view.webview.postMessage(data);
        } else {
            vscode.window.showWarningMessage("Output is hidden!");
        }
    }

    reveal() {
        if (this._view && !this._view.visible) {
            this._view.show(true);
        }
    }

    getExtUri(extUri: vscode.Uri) {
        this._extUri = extUri;
    }
}

const sideOutputProvider = new SideOutputProvider();

function registerSideBar(context: vscode.ExtensionContext) {
    sideOutputProvider.getExtUri(context.extensionUri);
    vscode.window.registerWebviewViewProvider(SideOutputProvider.viewType, sideOutputProvider, { webviewOptions: { retainContextWhenHidden: true } });
}

function changeOutput(data: any) {
    sideOutputProvider.setContent(data);
}

function reveal() {
    sideOutputProvider.reveal();
}

export function activate(context: vscode.ExtensionContext) {
    registerSideBar(context);
}

export function deactivate() { }
