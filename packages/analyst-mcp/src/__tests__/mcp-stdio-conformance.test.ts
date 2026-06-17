import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '../..');
const fixturePath = resolve(currentDir, './fixtures/config-minimal.yaml');
const cliPath = resolve(packageRoot, 'dist/cli.js');

function ensureBuildArtifacts(): void {
  if (existsSync(cliPath)) {
    return;
  }

  const buildResult = spawnSync('pnpm', ['build'], {
    cwd: packageRoot,
    encoding: 'utf-8',
  });
  if (buildResult.status !== 0) {
    throw new Error(
      `Failed to build package for MCP conformance test.\n${buildResult.stderr || buildResult.stdout}`,
    );
  }
}

async function runCliWithArgs(
  args: string[],
): Promise<{ exitCode: number | null; stderr: string }> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const processHandle = spawn(process.execPath, [cliPath, '--config', fixturePath, ...args], {
      cwd: packageRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stderrChunks: string[] = [];
    processHandle.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk.toString());
    });

    const timeout = setTimeout(() => {
      processHandle.kill('SIGTERM');
      rejectPromise(new Error(`CLI command timed out for args: ${args.join(' ')}`));
    }, 10_000);

    processHandle.once('error', (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });

    processHandle.once('close', (exitCode) => {
      clearTimeout(timeout);
      resolvePromise({ exitCode, stderr: stderrChunks.join('') });
    });
  });
}

describe.sequential('MCP stdio conformance', () => {
  let client: Client | undefined;
  let transport: StdioClientTransport | undefined;
  const stderrChunks: string[] = [];

  beforeAll(async () => {
    ensureBuildArtifacts();

    transport = new StdioClientTransport({
      command: process.execPath,
      args: [cliPath, '--config', fixturePath],
      cwd: packageRoot,
      stderr: 'pipe',
    });

    transport.stderr?.on('data', (chunk) => {
      stderrChunks.push(chunk.toString());
    });

    client = new Client({
      name: 'mcp-stdio-conformance',
      version: '0.1.0',
    });

    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('completes initialize handshake and exposes server info', () => {
    expect(client?.getServerVersion()).toBeDefined();
    expect(client?.getServerCapabilities()).toBeDefined();
  });

  it('lists tools, resources, and prompts', async () => {
    const tools = await client!.listTools();
    const resources = await client!.listResources();
    const prompts = await client!.listPrompts();

    expect(tools.tools.length).toBeGreaterThan(0);
    expect(tools.tools.some((tool) => tool.name === 'list_data_agents')).toBe(true);
    expect(resources.resources.length).toBeGreaterThan(0);
    expect(
      resources.resources.some((resource) =>
        resource.uri.startsWith('gemini-data-agent://sessions'),
      ),
    ).toBe(false);
    expect(prompts.prompts.length).toBeGreaterThan(0);
  });

  it('calls a representative tool with MCP content contract', async () => {
    const result = await client!.callTool({ name: 'list_data_agents', arguments: {} });
    const content = result.content as Array<{ type?: string; text?: string }>;

    expect(result.isError).toBeFalsy();
    expect(Array.isArray(content)).toBe(true);
    expect(content.at(0)?.type).toBe('text');
    expect(content.at(0)?.text).toContain('my-agent');
  });

  it('keeps stdout protocol clean while writing logs to stderr', () => {
    const stderrText = stderrChunks.join('');
    expect(stderrText).toContain('MCP server connected via stdio');
  });

  it('fails when http transport is requested without oauth config', async () => {
    const result = await runCliWithArgs(['--transport', 'http']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('CONFIG_OAUTH_REQUIRED');
  });
});
