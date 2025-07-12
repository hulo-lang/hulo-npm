#!/usr/bin/env node

import { createWriteStream, rmSync, readdirSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import axios from 'axios';
import { Styled } from 'opencmd-tinge';

interface ChecksumEntry {
    hash: string;
    filename: string;
}

// 下载文件
async function downloadFile(url: string, destPath: string): Promise<void> {
    const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        maxRedirects: 5
    });

    const file = createWriteStream(destPath);
    response.data.pipe(file);

    return new Promise((resolve, reject) => {
        file.on('finish', () => {
            file.close();
            resolve();
        });

        file.on('error', (err) => {
            reject(err);
        });
    });
}

// 下载文本文件
async function downloadText(url: string): Promise<string> {
    const response = await axios({
        method: 'GET',
        url: url,
        timeout: 10000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        maxRedirects: 5
    });

    return response.data;
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

// 主函数
async function main(): Promise<void> {
    const version = process.argv[2] || 'v0.1.0';
    const baseUrl = `https://github.com/hulo-lang/hulo/releases/download/${version}`;

    // 立即清空temp目录
    const tempDir = join(process.cwd(), 'temp');
    const clearTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    console.log(Styled()
        .Grey(`[${clearTime}]`)
        .Space()
        .Text('Clearing temp directory...')
        .toString()
    );

    try {
        rmSync(tempDir, { recursive: true, force: true });

        // 检查目录是否真的被清空了
        try {
            const remainingFiles = readdirSync(tempDir);
            if (remainingFiles.length > 0) {
                console.log(Styled()
                    .Grey(`[${clearTime}]`)
                    .Space()
                    .Bold('Error:')
                    .Space()
                    .Text(`Temp directory not cleared! Remaining files: ${remainingFiles.join(', ')}`)
                    .toString()
                );
                process.exit(1);
            }
        } catch (error) {
            // 目录不存在，说明清空成功
        }

        console.log(Styled()
            .Grey(`[${clearTime}]`)
            .Space()
            .Text('Temp directory cleared successfully')
            .toString()
        );
    } catch (error) {
        console.log(Styled()
            .Grey(`[${clearTime}]`)
            .Space()
            .Bold('Error:')
            .Space()
            .Text(`Failed to clear temp directory: ${error instanceof Error ? error.message : 'Unknown error'}`)
            .toString()
        );
        process.exit(1);
    }

    // 显示启动信息
    const startTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    console.log(Styled()
        .Grey(`[${startTime}]`)
        .Space()
        .Bold('Starting Hulo downloader...')
        .toString()
    );

    try {

        // 创建temp目录
        await mkdir(tempDir, { recursive: true });

        // 下载 checksums.txt
        const fetchTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        console.log(Styled()
            .Grey(`[${fetchTime}]`)
            .Space()
            .Text('Fetching checksums...')
            .toString()
        );

        const checksumsText = await downloadText(`${baseUrl}/checksums.txt`);

        const successTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        console.log(Styled()
            .Grey(`[${successTime}]`)
            .Space()
            .Text('Checksums fetched successfully')
            .toString()
        );

        // 解析 checksums
        const checksums = parseChecksums(checksumsText);

        const foundTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        console.log(Styled()
            .Grey(`[${foundTime}]`)
            .Space()
            .Text(`Found ${checksums.length} files to download`)
            .toString()
        );

        // 保存 checksums.txt 到 temp 目录
        await writeFile(join(tempDir, 'checksums.txt'), checksumsText);

        // 并发下载所有文件
        const downloadStartTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        console.log(Styled()
            .Grey(`[${downloadStartTime}]`)
            .Space()
            .Bold('Starting concurrent downloads...')
            .toString()
        );

        const downloadPromises = checksums.map(async (entry) => {
            const downloadPath = join(tempDir, entry.filename);

            try {
                const downloadTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                console.log(Styled()
                    .Indent(2)
                    .Grey(`[${downloadTime}]`)
                    .Space()
                    .Text(`Downloading ${entry.filename}`)
                    .toString()
                );
                await downloadFile(`${baseUrl}/${entry.filename}`, downloadPath);
                const downloadSuccessTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                console.log(Styled()
                    .Indent(2)
                    .Grey(`[${downloadSuccessTime}]`)
                    .Space()
                    .Text(`Downloaded ${entry.filename}`)
                    .toString()
                );
                return { success: true, filename: entry.filename };
            } catch (error) {
                const errorTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                console.log(Styled()
                    .Indent(2)
                    .Grey(`[${errorTime}]`)
                    .Space()
                    .Text(`Failed to download ${entry.filename}`)
                    .toString()
                );
                return { success: false, filename: entry.filename, error };
            }
        });

        const results = await Promise.all(downloadPromises);

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        // 显示下载总结
        const summaryTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        console.log(Styled()
            .Newline()
            .Grey(`[${summaryTime}]`)
            .Space()
            .Bold('Download Summary')
            .Newline()
            .Indent(2)
            .Grey(`[${summaryTime}]`)
            .Space()
            .Text(`Successfully downloaded: ${successCount} files`)
            .toString()
        );

        if (failCount > 0) {
            console.log(Styled()
                .Indent(2)
                .Grey(`[${summaryTime}]`)
                .Space()
                .Text(`Failed to download: ${failCount} files`)
                .toString()
            );
        }

        // 显示完成信息
        const completeTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        console.log(Styled()
            .Newline()
            .Grey(`[${completeTime}]`)
            .Space()
            .Bold('All files downloaded successfully!')
            .Newline()
            .Indent(2)
            .Grey(`[${completeTime}]`)
            .Space()
            .Text('Check the temp/ directory for downloaded files')
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
