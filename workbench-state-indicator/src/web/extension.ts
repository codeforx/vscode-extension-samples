import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "workbench-state-indicator.show",
    () => {
      vscode.window.showInformationMessage(getWorkbenchState());
    },
  );

  context.subscriptions.push(disposable);
}

function getWorkbenchState(): "empty" | "folder" | "workspace" {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  // No folder/workspace opened
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return "empty";
  }

  // Check if a workspace file (.code-workspace) is loaded
  if (vscode.workspace.workspaceFile) {
    console.log("workspace:", vscode.workspace.workspaceFile);
    return "workspace";
  }

  // Single folder or multiple opened (no workspace file)
  workspaceFolders.forEach((folder) => console.log("folder:", folder));
  return "folder";
}

export function deactivate() {}
