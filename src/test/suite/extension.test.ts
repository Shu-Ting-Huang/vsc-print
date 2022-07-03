import { PrintSession } from './../../print-session';
import * as assert from 'assert';
import { after } from 'mocha';
import path = require('path');
import axios from 'axios';
import * as htmlparser2 from 'htmlparser2'

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { platform } from 'os';
// import * as myExtension from '../extension';

suite('Print Extension Test Suite', () => {
	after(() => {
		vscode.window.showInformationMessage('All tests done!');
	});

	test(`Check platform browser launch command on ${process.platform}`, async () => {
		const printConfig = vscode.workspace.getConfiguration("print", null);
		await printConfig.update("alternateBrowser", false);
		let cmd: string | undefined;
		switch (process.platform) {
			case "win32":
				cmd = await vscode.commands.executeCommand<string>("extension.test.browserLaunchCommand", true);
				assert.strictEqual(cmd, "start");
				break;

			case "linux":
				cmd = await vscode.commands.executeCommand<string>("extension.test.browserLaunchCommand", true);
				assert.strictEqual(cmd, "xdg-open");
				break;

			case "darwin":
				cmd = await vscode.commands.executeCommand<string>("extension.test.browserLaunchCommand", true);
				assert.strictEqual(cmd, "open");
				break;
		}
	});

	test(`Check platform alternate browser launch command on ${process.platform}`, async () => {
		const printConfig = vscode.workspace.getConfiguration("print", null);
		await printConfig.update("alternateBrowser", true);
		let cmd: string | undefined;
		switch (process.platform) {
			case "win32":
				await printConfig.update("browserPath", "c:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
				cmd = await vscode.commands.executeCommand<string>("extension.test.browserLaunchCommand", true);
				assert.strictEqual(cmd, '"c:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"');
				break;

			case "linux":
			case "darwin":
				await printConfig.update("browserPath", "/path/with spaces/executable");
				cmd = await vscode.commands.executeCommand<string>("extension.test.browserLaunchCommand", true);
				assert.strictEqual(cmd, "/path/with\\ spaces/executable");
				break;
		}
	});

	let session: PrintSession | undefined;

	test('Print active editor', async () => {
		const W = vscode.workspace.workspaceFolders;
		let w = W![0].uri.fsPath;
		const otd = await vscode.workspace.openTextDocument(path.join(w, "sample.json"));
		assert.ok(vscode.window.activeTextEditor);
		const flags = await vscode.commands.executeCommand<Set<string>>("extension.test.flags");
		flags?.add("suppress browser");
		await vscode.window.showTextDocument(otd);
		session = await vscode.commands.executeCommand<string>("extension.print") as PrintSession | undefined;
		await session!.ready;
		const url = session!.getUrl();
		const response = await axios.get(url);
		assert.equal(response.headers["content-type"], 'text/html; charset=utf-8');
		assert.ok(response.data.includes("<title>sample.json</title>"));
	});

	test('Print folder', async () => {
		const W = vscode.workspace.workspaceFolders;
		let w = W![0].uri.fsPath;
		const flags = await vscode.commands.executeCommand<Set<string>>("extension.test.flags");
		flags?.add("suppress browser");
		session = await vscode.commands.executeCommand<string>("extension.printFolder", W![0].uri) as PrintSession | undefined;
		await session!.ready;
		const url = session!.getUrl();
		const response = await axios.get(url);
		assert.equal(response.headers["content-type"], 'text/html; charset=utf-8');
		assert.ok(response.data.includes("<title>test-docs</title>"));
	});

});