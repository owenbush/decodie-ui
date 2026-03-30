#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
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

program.parse();
