import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { format, type FormatConfig } from 'oxfmt';
import { buildSiteReadmes, type WorkflowFile } from './lib/readmes';

const WORKFLOW_DIR = resolve(process.cwd(), '.github/workflows');
const OXFMT_CONFIG_PATH = resolve(process.cwd(), '.oxfmtrc.json');

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

const readOxfmtConfig = async (): Promise<FormatConfig> =>
    JSON.parse(await readFile(OXFMT_CONFIG_PATH, 'utf-8')) as FormatConfig;

(async () => {
    const [files, oxfmtConfig] = await Promise.all([readWorkflowFiles(), readOxfmtConfig()]);
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
        const formatted = await format(path, content, oxfmtConfig);
        if (formatted.errors.length > 0) {
            throw new Error(
                `格式化失败：${path}\n${formatted.errors.map(error => error.message).join('\n')}`,
            );
        }

        const current = await readExisting(path);
        if (current === formatted.code) {
            console.log(`无变化：${path}`);
            continue;
        }

        await writeFile(resolve(process.cwd(), path), formatted.code, 'utf-8');
        changed += 1;
        console.log(`${current === undefined ? '创建' : '更新'}：${path}`);
    }

    console.log(`完成，共更新 ${changed} 个文件。`);
})();
