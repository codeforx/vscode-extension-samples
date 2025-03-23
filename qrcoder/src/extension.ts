import * as vscode from "vscode";
import qrcode from "qrcode-generator";

// Function to generate QR code as data URL
function generateQRCodeDataURL(
  text: string,
  errorCorrectionLevel: "L" | "M" | "Q" | "H" = "L",
): string {
  const qr = qrcode(0, errorCorrectionLevel); // Type 0 auto-detects size, 'L' is error correction level
  qr.addData(text);
  qr.make();
  return "data:image/svg+xml;utf8," + encodeURIComponent(qr.createSvgTag());
}

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage("qrcoder::activate");

  let disposable = vscode.commands.registerCommand(
    "qrcoder.text2qrcode",
    () => {
      getSelectedTextOrPrompt("Text to convert into QR code").then((text) => {
        if (!text) return;

        try {
          const url = generateQRCodeDataURL(text, "L");
          const panel = vscode.window.createWebviewPanel(
            "Text2QRCode",
            "Text2QRCode",
            vscode.ViewColumn.One,
            {},
          );
          panel.webview.html = getPreviewHtml(url);
        } catch (err) {
          vscode.window.showErrorMessage(
            err instanceof Error ? err.message : String(err),
          );
        }
      });
    },
  );

  context.subscriptions.push(disposable);
}

function getPreviewHtml(image: string): string {
  return `<!DOCTYPE html>
    <html lang="en" style="height: 100%;">
    <head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>QR Coder</title>
    </head>
    <body style="margin: 0; height: 100%;">
    <div style="display: flex; height: 100vh; width: 100vw;">
	<div style="display: flex; flex: 1; align-items: center; justify-content: center;">
	    <img src="${image}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;" />
	</div>
    </div>
    </body>
    </html>`;
}

function getSelectedTextOrPrompt(prompt: string): Thenable<string | undefined> {
  const activeTextEditor = vscode.window.activeTextEditor;

  if (activeTextEditor) {
    const selection = activeTextEditor.selection;
    const start = selection.start;
    const end = selection.end;

    if (start.line !== end.line || start.character !== end.character) {
      return Promise.resolve(activeTextEditor.document.getText(selection));
    }
  }

  return vscode.window.showInputBox({ prompt });
}

export function deactivate(): void {
  vscode.window.showInformationMessage("qrcoder::deactivate");
}
