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
  .description('Install the Decodie skill for Claude Code')
  .option(
    '--scope <scope>',
    'Install scope: "personal" (~/.claude/skills) or "project" (.claude/skills)',
    'personal'
  )
  .option(
    '--dir <path>',
    'Project directory (only used with --scope project)',
    process.cwd()
  )
  .action(async (opts) => {
    const scope = opts.scope;
    let skillDir: string;

    if (scope === 'project') {
      skillDir = path.join(path.resolve(opts.dir), '.claude', 'skills', 'decodie');
    } else {
      skillDir = path.join(os.homedir(), '.claude', 'skills', 'decodie');
    }

    const scriptsDir = path.join(skillDir, 'scripts');
    const repo = 'owenbush/decodie-skill';
    const branch = 'main';
    const baseUrl = `https://raw.githubusercontent.com/${repo}/${branch}`;

    const files = [
      { remote: 'SKILL.md', local: path.join(skillDir, 'SKILL.md') },
      { remote: 'SKILL-ANALYZE.md', local: path.join(skillDir, 'SKILL-ANALYZE.md') },
      { remote: 'scripts/summarize-index.sh', local: path.join(scriptsDir, 'summarize-index.sh') },
    ];

    console.log(`Installing Decodie skill (${scope})...`);
    console.log(`Target: ${skillDir}`);

    fs.mkdirSync(scriptsDir, { recursive: true });

    for (const file of files) {
      const url = `${baseUrl}/${file.remote}`;
      try {
        await downloadFile(url, file.local);
        console.log(`  ✓ ${file.remote}`);
      } catch (err) {
        console.error(`  ✗ ${file.remote}: ${(err as Error).message}`);
        process.exit(1);
      }
    }

    // Make scripts executable
    try {
      fs.chmodSync(path.join(scriptsDir, 'summarize-index.sh'), 0o755);
    } catch {
      // Windows doesn't support chmod — that's fine
    }

    console.log('\nDone! The Decodie skill is now available in Claude Code.');
    if (scope === 'project') {
      console.log('Commit .claude/skills/decodie/ to share it with your team.');
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
