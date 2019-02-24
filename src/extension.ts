import * as vscode from 'vscode';
import * as hljs from "highlight.js";
import { readFileSync, writeFileSync } from 'fs';
import * as http from "http";
import * as child_process from "child_process";

var commandArgs: any;
var selection: vscode.Selection | undefined;
var printConfig: vscode.WorkspaceConfiguration;
const browserLaunchMap: any = { darwin: "open", linux: "xdg-open", win32: "start" };

export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('extension.print', cmdArgs => {
		commandArgs = cmdArgs;
		printConfig = vscode.workspace.getConfiguration("print", null);
		let editor = vscode.window.activeTextEditor;
		if (editor && editor.selection) {
			selection = editor.selection;
		}
		else {
			selection = undefined;
		}
		startWebserver();
		// vscode.window.showInformationMessage("vsc-print shelling browser");
		let cmd = printConfig.browserPath ? `"${printConfig.browserPath}"` : browserLaunchMap[process.platform];
		child_process.exec(`${cmd} http://localhost:${printConfig.port}/`);
	});
	context.subscriptions.push(disposable);
}

function getFileText(fname: string): string {
	// vscode.window.showInformationMessage(`vsc-print get ${fname}`);

	var text = readFileSync(fname).toString();
	//strip BOM when present
	// vscode.window.showInformationMessage(`vsc-print got ${fname}`);
	return text.indexOf('\uFEFF') === 0 ? text.substring(1, text.length) : text;
}

function getSourceCode(): string {
	var sender = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath === commandArgs.fsPath ?
		"ACTIVE TEXT EDITOR" :
		"FILE EXPLORER";
	let result = "THIS CAN'T HAPPEN";
	switch (sender) {
		case "ACTIVE TEXT EDITOR":
			if (vscode.window.activeTextEditor) {
				if (selection && !(selection.isEmpty || selection.isSingleLine)) {
					result = vscode.window.activeTextEditor.document.getText(new vscode.Range(selection.start, selection.end)).replace(/\s*$/, ""); //rtrim;
				} else {
					result = vscode.window.activeTextEditor.document.getText();
				}
			}
			break;
		case "FILE EXPLORER":
			try {
				let fileText = getFileText(commandArgs.fsPath);
				return fileText;
			} catch (error) {
				throw new Error(`Cannot access ${commandArgs.fsPath}.\n${error.Message}`);
			}
			break;
	}
	return result;
}

const lineNumberCss = `
/* Line numbers */

table {
	border: none;
	border-collapse: collapse;
}
.line-number {
	border-right: thin solid silver;
	padding-right: 0.3em;
	text-align: right;
	vertical-align: top;
}
.line-text {
	margin-left: 0.7em;
  padding-bottom: {lineSpacing}em;
	white-space: pre-wrap;
}
`;

function getRenderedSourceCode(): string {
	// vscode.window.showInformationMessage("vsc-print get rendered source");
	let x = vscode.extensions.getExtension("pdconsec.vscode-print");
	if (!x) { throw new Error("Cannot resolve extension. Has the name changed? It is defined by the publisher and the extension name defined in package.json"); }
	let stylePath = `${x.extensionPath}/node_modules/highlight.js/styles`;
	let defaultCss = getFileText(`${stylePath}/default.css`);
	let swatchCss = getFileText(`${stylePath}/${printConfig.stylesheet}.css`);
	let renderedCode = hljs.highlightAuto(getSourceCode()).value;
	let pageCss = `\n@page {margin: ${printConfig.margin}mm;} .hljs {max-width:100%;width:100%;}\n`;
	var addLineNumbers = printConfig.lineNumbers === "on" || (printConfig.lineNumbers === "inherit" && vscode.window.activeTextEditor && (vscode.window.activeTextEditor.options.lineNumbers || 0) > 0);
	if (addLineNumbers) {
		var startLine = selection && !(selection.isEmpty || selection.isSingleLine) ? selection.start.line + 1 : 1;
		renderedCode = renderedCode
			.split("\n")
			.map((line, i) => `<tr><td class="line-number">${startLine + i}</td><td class="line-text">${line}</td></tr>`)
			.join("\n")
			.replace("\n</td>", "</td>")
			;
	} else {
		renderedCode = renderedCode
			.split("\n")
			.map((line, i) => `<tr><td class="line-text">${line}</td></tr>`)
			.join("\n")
			.replace("\n</td>", "</td>")
			;
	}
	let bodyCss = `body{margin:0;padding:0;font-family: Consolas, monospace;font-size:${printConfig.fontSize};}\n`;
	let html = `<html><head><title>${commandArgs.fsPath}</title><style>${pageCss}${bodyCss}${defaultCss}\r${swatchCss}\n${lineNumberCss.replace("{lineSpacing}", (printConfig.lineSpacing - 1).toString())}</style></head><body onload="window.print();window.close();"><table class="hljs">${renderedCode}</table></body></html>`;
	try {
		writeFileSync("k:/temp/linenumbers.html", html);

	} catch (error) {
		// don't barf on other people's systems
	}
	// vscode.window.showInformationMessage("vsc-print got rendered source");
	return html;
}

var server: http.Server | undefined;
var port: number = 5050;

function startWebserver(): Promise<void> {
	return new Promise((resolve, reject) => {
		// clean up unexpected stragglers
		if (server !== undefined && printConfig.port !== port) {
			server.close(() => { });
			server = undefined;
		}
		if (server === undefined) {
			// prepare to service an http request
			server = http.createServer((request, response) => {
				if (request.url) {
					let html = getRenderedSourceCode();
					response.setHeader("Content-Type", "text/html");
					response.end(html);
				}
			});
			// report exceptions
			server.on("error", (err: any) => {
				if (err) {
					switch (err.code) {
						case "EADDRINUSE":
							// vscode.window.showInformationMessage(`PORT ${printConfig.port} OCCUPIED. CHANGE WEBSERVER CONFIG.`);
							break;
						case "EACCES":
							// vscode.window.showInformationMessage("ACCESS DENIED ESTABLISHING WEBSERVER");
							break;
					}
					if (server) {
						server.close();
						server = undefined;
						port = 0;
					}
					reject();
				}
			});
			// clean up after one request
			server.on("request", (request: any, response: any) => {
				response.on("finish", () => {
					request.socket.destroy();
				});
			});
			server.listen(printConfig.port);
		}
		resolve();
	});
}

export function deactivate() { }