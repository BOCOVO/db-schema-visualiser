/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Diagnostic,
  DiagnosticSeverity,
  type Disposable,
  type ExtensionContext,
  languages,
  Position,
  Range,
  type TextDocument,
  type TextEditor,
  Uri,
  ViewColumn,
  type WebviewPanel,
  window,
  workspace,
} from "vscode";
import { type JSONTableSchema } from "shared/types/tableSchema";
import { DiagnosticError } from "shared/types/diagnostic";

import { DIAGRAM_UPDATER_DEBOUNCE_TIME } from "../constants";
import { ExtensionConfig } from "../helper/extensionConfigs";
import { type ExtensionRenderProps } from "../types";

import { WebviewHelper } from "./helper";

export class MainPanel {
  public static currentPanel: MainPanel | undefined;
  private readonly _panel: WebviewPanel;
  public static extensionConfig: ExtensionConfig;
  private readonly _disposables: Disposable[] = [];
  // to add debouncing on diagram update after a file change
  private _lastTimeout: NodeJS.Timeout | null = null;
  public static parseCode: (code: string) => JSONTableSchema;
  public static fileExt: string;
  public static diagnosticCollection =
    languages.createDiagnosticCollection("dbml");

  private constructor(
    panel: WebviewPanel,
    context: ExtensionContext,
    extensionConfigSession: string,
  ) {
    this._panel = panel;
    this._panel.onDidDispose(
      () => {
        this.dispose();
      },
      null,
      this._disposables,
    );

    const extensionConfig = new ExtensionConfig(extensionConfigSession);
    const defaultPageConfig = extensionConfig.getDefaultPageConfig();

    const html = WebviewHelper.setupHtml(
      this._panel.webview,
      context,
      defaultPageConfig,
    );

    this._panel.webview.html = html;

    WebviewHelper.setupWebviewHooks(
      this._panel.webview,
      extensionConfig,
      this._disposables,
    );
  }

  /**
   * listen for file changes and update the diagram
   */
  public static registerDiagramUpdaterOnfFileChange(): void {
    const disposable = workspace.onDidChangeTextDocument(async (event) => {
      if (event.document.languageId === MainPanel.fileExt) {
        if (MainPanel.currentPanel?._lastTimeout !== null) {
          clearTimeout(MainPanel.currentPanel?._lastTimeout);
        }

        if (MainPanel.currentPanel !== undefined) {
          MainPanel.currentPanel._lastTimeout = setTimeout(() => {
            void MainPanel.publishSchema(event.document);
          }, DIAGRAM_UPDATER_DEBOUNCE_TIME);
        }
      }
    });

    MainPanel.currentPanel?._disposables.push(disposable);
  }

  public static render({
    context,
    extensionConfigSession,
    webviewConfig,
    parser,
    fileExt,
  }: ExtensionRenderProps): void {
    MainPanel.parseCode = parser;
    MainPanel.fileExt = fileExt;

    const editor = window.activeTextEditor;
    if (editor == null) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      window.showErrorMessage("No active text editor found.");
      return;
    }

    const activeTextEditorColumn =
      window.activeTextEditor?.viewColumn ?? ViewColumn.One;

    const previewColumn = activeTextEditorColumn + 1;

    if (MainPanel.currentPanel != null) {
      MainPanel.currentPanel._panel.reveal(previewColumn);
    } else {
      const panel = window.createWebviewPanel(
        webviewConfig.name,
        webviewConfig.title,
        previewColumn,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        },
      );

      panel.iconPath = {
        dark: Uri.joinPath(
          context.extensionUri,
          "assets",
          "icons",
          "preview-dark.svg",
        ),
        light: Uri.joinPath(
          context.extensionUri,
          "assets",
          "icons",
          "preview.svg",
        ),
      };

      MainPanel.currentPanel = new MainPanel(
        panel,
        context,
        extensionConfigSession,
      );
      MainPanel.registerDiagramUpdaterOnfFileChange();
    }

    void MainPanel.publishSchema(editor.document);
  }

  static getCurrentEditor(): TextEditor | undefined {
    const editor = window.activeTextEditor;
    if (editor == null) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      window.showErrorMessage("No active text editor found.");
      return;
    }

    return editor;
  }

  static publishSchema = async (document: TextDocument): Promise<void> => {
    let code = document.getText();

    switch (document.languageId) {
      // if document is prisma file and the parent folder is "schema" folder, then read all *.prisma files in the folder and merge them.
      case "prisma": {
        // Get the parent folder name of the file
        const folderPath = document.uri.fsPath.split("/");
        const folderName = folderPath[folderPath.length - 2];

        if (folderName !== "schema") break;

        const schemaFolder = folderPath
          .slice(0, folderPath.length - 1)
          .join("/");

        // Get all prisma files in the folder
        const files = await workspace.findFiles(`**/*.prisma`);

        // Clear code
        code = "";

        // Merge all prisma files
        for (const uri of files) {
          // Check file in the same folder
          if (!uri.fsPath.includes(schemaFolder)) continue;
          const buffer = await workspace.fs.readFile(uri);
          code += "\n" + buffer.toString();
        }
        break;
      }
    }

    try {
      const schema = MainPanel.parseCode(code);

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.currentPanel?._panel.webview.postMessage({
        type: "setSchema",
        payload: schema,
        key: document.uri.toString(),
      });

      MainPanel.diagnosticCollection.clear();
    } catch (error) {
      console.error(JSON.stringify(error));
      if (error instanceof DiagnosticError) {
        MainPanel.diagnosticCollection.set(document.uri, [
          new Diagnostic(
            new Range(
              new Position(
                error.location.start.line,
                error.location.start.column,
              ),
              new Position(error.location.end.line, error.location.end.column),
            ),
            error.message,
            DiagnosticSeverity.Error,
          ),
        ]);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        window.showErrorMessage(`${error as any}`);
      }
    }
  };

  /**
   * Cleans up and disposes of webview resources when the webview panel is closed.
   */
  public dispose(): void {
    MainPanel.currentPanel = undefined;

    // Dispose of the current webview panel
    this._panel.dispose();

    // Dispose of all disposables (i.e. commands) for the current webview panel
    while (this._disposables.length > 0) {
      const disposable = this._disposables.pop();
      if (disposable != null) {
        disposable.dispose();
      }
    }
  }
}
