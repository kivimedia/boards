// ============================================================================
// WP-CLI OVER SSH CLIENT
// Execute WordPress CLI commands on remote servers via SSH.
// Used as an alternative deployment path when REST API is insufficient.
// ============================================================================

export interface WpCliSshConfig {
  host: string;
  user: string;
  keyPath?: string;
  password?: string;
  port?: number;
  wpPath?: string; // WordPress installation path, defaults to auto-detect
}

export interface WpCliResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ============================================================================
// CORE SSH EXECUTOR
// ============================================================================

/**
 * Execute a WP-CLI command over SSH.
 * Uses child_process spawn to run ssh with the command.
 */
export async function wpCliExec(
  config: WpCliSshConfig,
  command: string
): Promise<WpCliResult> {
  const { spawn } = await import('child_process');

  const port = config.port || 22;
  const wpPath = config.wpPath ? `--path=${config.wpPath}` : '';
  const fullCommand = `wp ${command} ${wpPath}`.trim();

  const sshArgs: string[] = [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=10',
    '-p', String(port),
  ];

  if (config.keyPath) {
    sshArgs.push('-i', config.keyPath);
  }

  sshArgs.push(`${config.user}@${config.host}`, fullCommand);

  return new Promise((resolve) => {
    const proc = spawn('ssh', sshArgs, {
      timeout: 30000,
      env: { ...process.env, SSHPASS: config.password },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.on('close', (code: number | null) => {
      resolve({
        success: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
      });
    });

    proc.on('error', (err: Error) => {
      resolve({
        success: false,
        stdout: '',
        stderr: err.message,
        exitCode: 1,
      });
    });
  });
}

// ============================================================================
// CONVENIENCE COMMANDS
// ============================================================================

export async function wpCliCacheFlush(config: WpCliSshConfig): Promise<WpCliResult> {
  return wpCliExec(config, 'cache flush');
}

export async function wpCliPluginList(config: WpCliSshConfig): Promise<WpCliResult> {
  return wpCliExec(config, 'plugin list --format=json');
}

export async function wpCliDbExport(
  config: WpCliSshConfig,
  outputPath?: string
): Promise<WpCliResult> {
  const path = outputPath || `/tmp/wp-db-export-${Date.now()}.sql`;
  return wpCliExec(config, `db export ${path}`);
}

export async function wpCliRewriteFlush(config: WpCliSshConfig): Promise<WpCliResult> {
  return wpCliExec(config, 'rewrite flush');
}

export async function wpCliThemeList(config: WpCliSshConfig): Promise<WpCliResult> {
  return wpCliExec(config, 'theme list --format=json');
}

export async function wpCliGetOption(
  config: WpCliSshConfig,
  option: string
): Promise<WpCliResult> {
  return wpCliExec(config, `option get ${option}`);
}

/**
 * Test SSH connectivity by running a simple wp cli version command.
 */
export async function wpCliTestConnection(config: WpCliSshConfig): Promise<{
  ok: boolean;
  wpCliVersion?: string;
  error?: string;
}> {
  const result = await wpCliExec(config, 'cli version');
  if (result.success) {
    return { ok: true, wpCliVersion: result.stdout };
  }
  return { ok: false, error: result.stderr || 'SSH connection failed' };
}
