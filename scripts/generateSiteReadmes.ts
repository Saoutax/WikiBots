import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { buildSiteReadmes } from './lib/readmes';
import type { WorkflowFile } from './lib/readmes';

const WORKFLOW_DIR = resolve(process.cwd(), '.github/workflows');

const isWorkflowFile = (fileName: string) => /\.ya?ml$/i.test(fileName);

const readWorkflowFiles = async (): Promise<WorkflowFile[]> => {
    const entries = await readdir(WORKFLOW_DIR, { withFileTypes: true });
    const files: WorkflowFile[] = [];

    for (const entry of entries) {
        if (!entry.isFile() || !isWorkflowFile(entry.name)) {
            continue;
        }

        files.push({
            fileName: entry.name,
            raw: await readFile(join(WORKFLOW_DIR, entry.name), 'utf-8'),
        });
    }

    return files.sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
};

const readExisting = async (path: string) => {
    try {
        return await readFile(resolve(process.cwd(), path), 'utf-8');
    } catch {
        return undefined;
    }
};

/** 忽略表格对齐留白后的内容，用于判断是否真的需要改写。 */
const normalize = (content: string) =>
    content
        .split(/\r?\n/)
        .map(line => {
            const compact = line.trimEnd().replace(/\s*\|\s*/g, '|');

            return /^\|(:?-+:?\|)+$/.test(compact) ? compact.replace(/-{2,}/g, '---') : compact;
        })
        .join('\n')
        .trimEnd();

(async () => {
    const files = await readWorkflowFiles();
    const { readmes, warnings, scripts } = buildSiteReadmes(files);

    warnings.forEach(warning => console.warn(warning));

    for (const script of scripts) {
        try {
            await access(resolve(process.cwd(), script));
        } catch {
            console.warn(`引用的脚本不存在：${script}`);
        }
    }

    let changed = 0;
    for (const { path, content } of readmes) {
        const current = await readExisting(path);
        if (current !== undefined && normalize(current) === normalize(content)) {
            console.log(`无变化：${path}`);
            continue;
        }

        await writeFile(resolve(process.cwd(), path), content, 'utf-8');
        changed += 1;
        console.log(`${current === undefined ? '创建' : '更新'}：${path}`);
    }

    console.log(`完成，共更新 ${changed} 个文件。`);
})();
