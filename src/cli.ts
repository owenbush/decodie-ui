#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import { startServer } from './server/index';

const program = new Command();

program
  .name('decodie')
  .description('Presentation layer for Decodie')
  .version('0.1.0');

program
  .command('serve')
  .description('Start the Decodie web server')
  .option('-p, --port <number>', 'Port to listen on', '8081')
  .option(
    '-d, --dir <path>',
    'Project root directory (containing .decodie/)',
    process.cwd()
  )
  .option('--no-open', 'Do not open the browser automatically')
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(`Invalid port: ${opts.port}`);
      process.exit(1);
    }

    const projectDir = path.resolve(opts.dir);

    console.log('Starting Decodie...');
    startServer({ port, projectDir });

    // Optionally open the browser
    if (opts.open !== false) {
      try {
        const open = (await import('open')).default;
        await open(`http://localhost:${port}`);
      } catch {
        // If open fails (e.g., headless env), just continue
      }
    }
  });

program
  .command('install-skill')
  .description('Install the Decodie commands for Claude Code')
  .option(
    '--scope <scope>',
    'Install scope: "personal" (~/.claude/commands) or "project" (.claude/commands)',
    'personal'
  )
  .option(
    '--dir <path>',
    'Project directory (only used with --scope project)',
    process.cwd()
  )
  .action(async (opts) => {
    const scope = opts.scope;
    let commandsBase: string;

    if (scope === 'project') {
      commandsBase = path.join(path.resolve(opts.dir), '.claude', 'commands', 'decodie');
    } else {
      commandsBase = path.join(os.homedir(), '.claude', 'commands', 'decodie');
    }

    const repo = 'owenbush/decodie-skill';
    const branch = 'main';
    const baseUrl = `https://raw.githubusercontent.com/${repo}/${branch}`;

    const files = [
      { remote: 'commands/decodie/observe.md', local: path.join(commandsBase, 'observe.md') },
      { remote: 'commands/decodie/analyze.md', local: path.join(commandsBase, 'analyze.md') },
      { remote: 'commands/decodie/ask.md', local: path.join(commandsBase, 'ask.md') },
      { remote: 'commands/decodie/explain.md', local: path.join(commandsBase, 'explain.md') },
    ];

    console.log(`Installing Decodie commands (${scope})...`);
    console.log(`Target: ${commandsBase}`);

    fs.mkdirSync(commandsBase, { recursive: true });

    for (const file of files) {
      const url = `${baseUrl}/${file.remote}`;
      try {
        await downloadFile(url, file.local);
        console.log(`  ✓ ${path.basename(file.remote)}`);
      } catch (err) {
        console.error(`  ✗ ${path.basename(file.remote)}: ${(err as Error).message}`);
        process.exit(1);
      }
    }

    console.log('\nDone! Decodie commands are now available in Claude Code:');
    console.log('  /decodie:observe  — Document decisions as you code');
    console.log('  /decodie:analyze  — Analyze existing code');
    console.log('  /decodie:ask      — Ask questions about entries');
    console.log('  /decodie:explain  — Explain a code selection');
    if (scope === 'project') {
      console.log('\nCommit .claude/commands/decodie/ to share with your team.');
    }
  });

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location;
        if (!location) return reject(new Error('Redirect with no location'));
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
      reject(err);
    });
  });
}

program.parse();
