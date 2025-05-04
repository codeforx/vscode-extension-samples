import * as vscode from "vscode";
import { PolkadotBridge } from "./polkadotBridge.js";

export async function activate(context: vscode.ExtensionContext) {
  if (!context.messagePassingProtocol) {
    vscode.window.showInformationMessage(
      "Polkadot bridge: messagePassingProtocol missing",
    );
    return;
  }

  vscode.window.showInformationMessage(
    "Polkadot bridge: messagePassingProtocol detected",
  );
  const bridge = new PolkadotBridge(context.messagePassingProtocol);

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
