import * as vscode from "vscode";
import { PolkadotBridge } from "./polkadotBridge.js";

export async function activate(context: vscode.ExtensionContext) {
  if (context.messagePassingProtocol) {
    vscode.window.showInformationMessage("Polkadot bridge: messagePassingProtocol detected");
  } else {
    vscode.window.showInformationMessage("Polkadot bridge: messagePassingProtocol missing");
  }

  // Usage
  const chan = new MessageChannel();
  const bridge = new PolkadotBridge(chan.port1);

  // Post port to webview
  self.postMessage({ type: "_bridge_port", port: chan.port2 }, [chan.port2]);

  // Connect and use
  bridge.connect()
    .then(async () => {
      const accounts = await bridge.accounts.get(true);
      console.log("got", { accounts });
      const unsubscribe = bridge.accounts.subscribe((accounts) => {
        console.log("Accounts updated:", accounts);
      });

      const signature = await bridge.signer.signRaw({
        address: accounts[0].address,
        data: "Hello World",
      });
      console.log("signature", { signature });
    })
    .catch((error) => console.error("Connection failed:", error));
}
