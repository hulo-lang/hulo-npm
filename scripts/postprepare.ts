#!/usr/bin/env node

import { readdir, readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { join, basename } from 'path';
import { spawn } from 'child_process';
import { rmSync } from 'fs';
import Handlebars from 'handlebars';
import { Styled } from 'opencmd-tinge';

// 定义 OS 和 CPU 类型
type OS = 'win32' | 'darwin' | 'linux' | 'freebsd' | 'openbsd' | 'sunos' | 'aix';
type CPU = 'x64' | 'ia32' | 'arm64' | 'arm' | 'mips' | 'ppc' | 'ppc64';

// 平台信息映射
const platformInfo: Record<string, {
    os: OS;
    arch: CPU;
    description: string;
    keywords: string[];
}> = {
    'darwin-arm64': {
        os: 'darwin',
        arch: 'arm64',
        description: 'Hulo compiler for macOS (Apple Silicon)',
        keywords: ['hulo', 'compiler', 'macos', 'darwin', 'arm64', 'apple-silicon', 'm1', 'm2']
    },
    'darwin-x86-64': {
        os: 'darwin',
        arch: 'x64',
        description: 'Hulo compiler for macOS (Intel)',
        keywords: ['hulo', 'compiler', 'macos', 'darwin', 'x86_64', 'intel']
    },
    'linux-arm64': {
        os: 'linux',
        arch: 'arm64',
        description: 'Hulo compiler for Linux (ARM64)',
        keywords: ['hulo', 'compiler', 'linux', 'arm64', 'aarch64']
    },
    'linux-i386': {
        os: 'linux',
        arch: 'ia32',
        description: 'Hulo compiler for Linux (32-bit)',
        keywords: ['hulo', 'compiler', 'linux', 'i386', '32bit']
    },
    'linux-x86-64': {
        os: 'linux',
        arch: 'x64',
        description: 'Hulo compiler for Linux (64-bit)',
        keywords: ['hulo', 'compiler', 'linux', 'x86_64', '64bit']
    },
    'windows-arm64': {
        os: 'win32',
        arch: 'arm64',
        description: 'Hulo compiler for Windows (ARM64)',
        keywords: ['hulo', 'compiler', 'windows', 'arm64']
    },
    'windows-i386': {
        os: 'win32',
        arch: 'ia32',
        description: 'Hulo compiler for Windows (32-bit)',
        keywords: ['hulo', 'compiler', 'windows', 'i386', '32bit']
    },
    'windows-x86-64': {
        os: 'win32',
        arch: 'x64',
        description: 'Hulo compiler for Windows (64-bit)',
        keywords: ['hulo', 'compiler', 'windows', 'x86_64', '64bit']
    }
};

interface ChecksumEntry {
    hash: string;
    filename: string;
}

// 解析 checksums 文件
function parseChecksums(content: string): ChecksumEntry[] {
    const entries: ChecksumEntry[] = [];

    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed) {
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2) {
                entries.push({
                    hash: parts[0],
                    filename: parts.slice(1).join(' ')
                });
            }
        }
    });

    return entries;
}

// 复制目录
async function copyDirectory(source: string, target: string): Promise<void> {
    const entries = await readdir(source, { withFileTypes: true });

    for (const entry of entries) {
        const sourcePath = join(source, entry.name);
        const targetPath = join(target, entry.name);

        if (entry.isDirectory()) {
            await mkdir(targetPath, { recursive: true });
            await copyDirectory(sourcePath, targetPath);
        } else {
            await copyFile(sourcePath, targetPath);
        }
    }
}

// 解压文件
function extractFile(filePath: string, extractDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const isZip = filePath.endsWith('.zip');
        const isTar = filePath.endsWith('.tar.gz');

        if (!isZip && !isTar) {
            // 直接复制文件
            copyFile(filePath, join(extractDir, basename(filePath)))
                .then(resolve)
                .catch(reject);
            return;
        }

        let cmd: string;
        let args: string[];

        if (isZip) {
            // Windows 使用 PowerShell，其他系统使用 unzip
            if (process.platform === 'win32') {
                cmd = 'powershell';
                args = ['-Command', `Expand-Archive -Path "${filePath}" -DestinationPath "${extractDir}" -Force`];
            } else {
                cmd = 'unzip';
                args = ['-o', filePath, '-d', extractDir];
            }
        } else {
            // tar 命令
            cmd = 'tar';
            args = ['-xzf', filePath, '-C', extractDir];
        }

        const child = spawn(cmd, args, { stdio: 'inherit' });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${cmd} failed with code ${code}`));
            }
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}

// 创建 package.json 模板
const packageJsonTemplate = Handlebars.compile(`{
    "name": "@hulo/{{platformName}}",
    "version": "{{version}}",
    "description": "{{description}}",
    "main": "index.js",
    "bin": {
        "hulo": "./bin/{{binaryName}}"
    },
    "files": [
        "bin/",
        "index.js",
        "*.md",
        "LICENSE"
    ],
    "keywords": [{{#each keywords}}"{{this}}"{{#unless @last}}, {{/unless}}{{/each}}],
    "author": "The Hulo Authors",
    "license": "MIT",
    "homepage": "https://hulo-lang.github.io/docs/",
    "repository": {
        "type": "git",
        "url": "https://github.com/hulo-lang/hulo.git"
    },
    "publishConfig": {
        "access": "public"
    },
    "os": ["{{os}}"],
    "cpu": ["{{arch}}"],
    "engines": {
        "node": ">=14.0.0"
    }
}`);

// 创建 index.js 模板
const indexJsTemplate = Handlebars.compile(`#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// 获取可执行文件路径
const exePath = path.join(__dirname, 'bin', '{{binaryName}}');

// 执行 hulo 可执行文件
const child = spawn(exePath, process.argv.slice(2), {
    stdio: 'inherit',
    cwd: process.cwd()
});

child.on('error', (err) => {
    console.error(\`Failed to start hulo: \${err.message}\`);
    process.exit(1);
});

child.on('close', (code) => {
    process.exit(code);
});
`);

// 创建 README.md 模板
const readmeTemplate = Handlebars.compile(`# @hulo/{{platformName}}

{{description}}

## Installation

\`\`\`bash
npm install @hulo/{{platformName}}
\`\`\`

## Usage

\`\`\`bash
npx @hulo/{{platformName}} -V
\`\`\`

## Platform

- **OS**: {{os}}
- **Architecture**: {{arch}}

## License

MIT License - see [LICENSE](LICENSE) for details.
`);

// 主函数
async function main(): Promise<void> {
    const version = process.argv[2] || '0.1.0';
    const tempDir = join(process.cwd(), 'temp');
    const checksumsPath = join(tempDir, 'checksums.txt');

    const startTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    console.log(Styled()
        .Grey(`[${startTime}]`)
        .Space()
        .Bold('Starting post-processing...')
        .toString()
    );

    try {
        // 检查 temp 目录是否存在
        try {
            await readdir(tempDir);
        } catch {
            const errorTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            console.log(Styled()
                .Grey(`[${errorTime}]`)
                .Space()
                .Bold('Error:')
                .Space()
                .Text('temp directory not found. Please run prepare.ts first.')
                .toString()
            );
            process.exit(1);
        }

        // 读取 checksums.txt
        const checksumsText = await readFile(checksumsPath, 'utf-8');
        const checksums = parseChecksums(checksumsText);

        const foundTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        console.log(Styled()
            .Grey(`[${foundTime}]`)
            .Space()
            .Text(`Found ${checksums.length} files in checksums.txt`)
            .toString()
        );

        // 检查 temp 目录中的文件
        const tempFiles = await readdir(tempDir);
        console.log(Styled()
            .Grey(`[${foundTime}]`)
            .Space()
            .Text(`Found ${tempFiles.length} files in temp directory`)
            .toString()
        );

        // 处理每个文件
        for (const entry of checksums) {
            // 从文件名中提取平台信息
            const match = entry.filename.match(/hulo_(.+?)\.(tar\.gz|zip)/);
            if (!match) {
                const skipTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                console.log(Styled()
                    .Grey(`[${skipTime}]`)
                    .Space()
                    .Text(`Skipping unknown format: ${entry.filename}`)
                    .toString()
                );
                continue;
            }

            const platformKey = match[1]; // Darwin_arm64
            const platformName = platformKey.toLowerCase().replace(/_/g, '-'); // darwin-arm64

            if (!platformInfo[platformName]) {
                const skipTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                console.log(Styled()
                    .Grey(`[${skipTime}]`)
                    .Space()
                    .Text(`Skipping unknown platform: ${platformKey} (${entry.filename})`)
                    .toString()
                );
                continue;
            }

            const platformData = platformInfo[platformName];
            if (!platformData) {
                const skipTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                console.log(Styled()
                    .Grey(`[${skipTime}]`)
                    .Space()
                    .Text(`No platform info for: ${platformName}`)
                    .toString()
                );
                continue;
            }

            const processTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            console.log(Styled()
                .Newline()
                .Grey(`[${processTime}]`)
                .Space()
                .Bold(`Processing ${platformName}`)
                .Newline()
                .Indent(2)
                .Grey(`[${processTime}]`)
                .Space()
                .Text(`File: ${entry.filename}`)
                .toString()
            );

            // 检查文件是否存在
            const filePath = join(tempDir, entry.filename);
            try {
                await readFile(filePath);
            } catch {
                const errorTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                console.log(Styled()
                    .Indent(2)
                    .Grey(`[${errorTime}]`)
                    .Space()
                    .Text(`File not found: ${entry.filename}`)
                    .toString()
                );
                continue;
            }

            // 创建平台目录
            const platformDir = join(process.cwd(), 'temp', 'packages', `hulo-${platformName}`);
            await mkdir(platformDir, { recursive: true });

            // 解压文件到平台目录根目录
            const extractDir = platformDir;

            const extractTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            console.log(Styled()
                .Indent(2)
                .Grey(`[${extractTime}]`)
                .Space()
                .Text('Extracting files...')
                .toString()
            );

            await extractFile(filePath, extractDir);

            const extractSuccessTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            console.log(Styled()
                .Indent(2)
                .Grey(`[${extractSuccessTime}]`)
                .Space()
                .Text(`Extracted to: ${extractDir}`)
                .toString()
            );

            // 创建 bin 目录
            const binDir = join(platformDir, 'bin');
            await mkdir(binDir, { recursive: true });

            // 移动可执行文件到 bin 目录
            const binaryName = platformName.startsWith('windows') ? 'hulo.exe' : 'hulo';
            const sourceBinary = join(platformDir, binaryName);
            const targetBinary = join(binDir, binaryName);

            const moveTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            console.log(Styled()
                .Indent(2)
                .Grey(`[${moveTime}]`)
                .Space()
                .Text(`Moving ${binaryName} to bin/ directory...`)
                .toString()
            );

            await copyFile(sourceBinary, targetBinary);

            // 移动 std 目录到 bin 目录
            const sourceStd = join(platformDir, 'std');
            const targetStd = join(binDir, 'std');

            console.log(Styled()
                .Indent(2)
                .Grey(`[${moveTime}]`)
                .Space()
                .Text('Moving std/ directory to bin/ directory...')
                .toString()
            );

            // 复制 std 目录内容
            await copyDirectory(sourceStd, targetStd);

            // 删除原始文件
            await rmSync(sourceBinary, { force: true });
            await rmSync(sourceStd, { recursive: true, force: true });

            // 生成 package.json
            const packageJsonData = {
                platformName,
                version,
                description: platformData.description,
                binaryName,
                keywords: platformData.keywords,
                os: platformData.os,
                arch: platformData.arch
            };

            const packageJson = packageJsonTemplate(packageJsonData);
            await writeFile(join(platformDir, 'package.json'), packageJson);

            // 生成 index.js
            const indexJsData = {
                binaryName
            };

            const indexJs = indexJsTemplate(indexJsData);
            await writeFile(join(platformDir, 'index.js'), indexJs);

            // 生成 README.md
            const readmeData = {
                platformName,
                description: platformData.description,
                os: platformData.os,
                arch: platformData.arch
            };

            const readme = readmeTemplate(readmeData);
            await writeFile(join(platformDir, 'README.md'), readme);

            const successTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            console.log(Styled()
                .Indent(2)
                .Grey(`[${successTime}]`)
                .Space()
                .Text(`Created package for ${platformName}`)
                .toString()
            );
        }

        const completeTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        console.log(Styled()
            .Newline()
            .Grey(`[${completeTime}]`)
            .Space()
            .Bold('All packages processed successfully!')
            .Newline()
            .Indent(2)
            .Grey(`[${completeTime}]`)
            .Space()
            .Text('Check the packages/ directory for individual platform packages')
            .toString()
        );

    } catch (error) {
        const errorTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        console.log(Styled()
            .Grey(`[${errorTime}]`)
            .Space()
            .Bold('Error:')
            .Space()
            .Text(error instanceof Error ? error.message : 'Unknown error')
            .toString()
        );
        process.exit(1);
    }
}

// 运行
if (require.main === module) {
    main().catch(console.error);
} 