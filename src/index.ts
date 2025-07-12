#!/usr/bin/env node

import { exec } from 'child_process';
import { arch, platform } from 'os';
import { Styled } from 'opencmd-tinge';

const platformMap: Record<string, string> = {
    'win32': 'windows',
    'darwin': 'darwin',
    'linux': 'linux'
};

const archMap: Record<string, string> = {
    'x64': 'x86-64',
    'arm64': 'arm64',
    'ia32': 'i386'
};

function getPlatform(): string {
    const platformName = platformMap[platform()] || platform();
    const archName = archMap[arch()] || arch();
    return `${platformName}-${archName}`;
}

async function main(): Promise<void> {
    const platformName = getPlatform();
    const packageName = `@hulo/${platformName}`;

    const startTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    console.log(Styled()
        .Grey(`[${startTime}]`)
        .Space()
        .Text(`Installing ${packageName}...`)
        .toString()
    );

    try {
        const installCommand = `npm install -g ${packageName}`;
        exec(installCommand, (error: any, _stdout: any) => {
            if (error) {
                const errorTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                console.log(Styled()
                    .Grey(`[${errorTime}]`)
                    .Space()
                    .Bold('Error:')
                    .Space()
                    .Text(`Failed to install ${packageName}: ${error.message}`)
                    .toString()
                );
                process.exit(1);
            }

            const successTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            console.log(Styled()
                .Grey(`[${successTime}]`)
                .Space()
                .Text(`Successfully installed ${packageName}`)
                .toString()
            );
        });
    } catch (error: any) {
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

main().catch(console.error);
