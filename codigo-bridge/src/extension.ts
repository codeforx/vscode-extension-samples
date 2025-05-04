import * as vscode from "vscode";
import { HostFS } from "./hostfs.js";
import { createTerminal } from "./terminal.js";

//@ts-ignore
import * as duplex from "./duplex/duplex.min.js";

export async function activate(context: vscode.ExtensionContext) {
  if (context.messagePassingProtocol) {
    vscode.window.showInformationMessage(
      "Codigo bridge: messagePassingProtocol detected",
    );
  } else {
    vscode.window.showInformationMessage(
      "Codigo bridge: messagePassingProtocol missing",
    );
  }

  const channel = new MessageChannel();
  self.postMessage({ type: "_port", port: channel.port2 }, [channel.port2]);

  const sess = new duplex.Session(new duplex.PortConn(channel.port1));
  const peer = new duplex.Peer(sess, new duplex.CBORCodec());
  peer.respond();

  const fs = new HostFS(peer);
  context.subscriptions.push(fs);

  const terminal = createTerminal(peer);

  // Register command to create new terminal
  context.subscriptions.push(
    vscode.commands.registerCommand("extension.createNewTerminal", async () => {
      const newTerminal = createTerminal(peer);
    }),
  );
}
