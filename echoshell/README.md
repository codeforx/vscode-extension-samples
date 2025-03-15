# EchoShell

EchoShell is a Visual Studio Code extension that provides enhanced terminal integration. It allows you to create and manage terminal profiles, connect to WebSocket endpoints, and configure terminal settings directly from the VS Code interface.

## Features

- **Create New Terminal**: Launch a new terminal with a custom profile.
- **Show Config Array**: Display the current configuration array of terminal endpoints.
- **Add to Config Array**: Add a new terminal endpoint to the configuration array.
- **Edit Config Array**: Open the settings JSON to edit the terminal endpoints.

## Commands

The extension contributes the following commands:

- `echoshell.createNewTerminal`: Create a new terminal with a custom profile.
- `echoshell.showConfigArray`: Show the current configuration array of terminal endpoints.
- `echoshell.addToConfigArray`: Add a new terminal endpoint to the configuration array.
- `echoshell.editConfigArray`: Open the settings JSON to edit the terminal endpoints.

## Configuration

The extension provides the following configuration settings:

- `echoshell.terminalEndpoints`: An array of WebSocket URLs as QuickPickItem. Each item can have the following properties:
  - `label`: Display name for the terminal endpoint.
  - `value`: Actual terminal endpoint value/URL.
  - `description`: Optional description text.
  - `alwaysShow`: Whether to always show this endpoint.

## Usage

1. **Create New Terminal**: Use the command palette (`Ctrl+Shift+P`) and run `EchoShell: Create New Terminal`. You can select an existing endpoint or add a new one.
2. **Show Config Array**: Use the command palette and run `EchoShell: Show Config Array` to display the current configuration array.
3. **Add to Config Array**: Use the command palette and run `EchoShell: Add to Config Array` to add a new terminal endpoint.
4. **Edit Config Array**: Use the command palette and run `EchoShell: Edit Config Array` to open the settings JSON and edit the terminal endpoints.

## Development

To build and run the extension locally:

1. Clone the repository.
2. Install dependencies using `yarn install`.
3. Compile the TypeScript code using `yarn compile`.
4. Open the project in VS Code and press `F5` to start debugging.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.

## Acknowledgements

This extension uses the `vscode` API and WebSocket for terminal integration.

## Contact

For any questions or feedback, please open an issue on the [GitHub repository](https://github.com/example).
