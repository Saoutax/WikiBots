/** 远端文件内容及其 sha，`sha` 用于更新已存在的文件 */
interface RemoteFile {
    content: string;
    sha: string;
}

/** 待提交的本地文件 */
interface ReadmeFile {
    /** 相对仓库根目录的路径 */
    path: string;
    content: string;
}

/** 提交所需的 GitHub 操作，便于测试时替换实现 */
interface ReadmeClient {
    read(path: string): Promise<RemoteFile | undefined>;
    write(path: string, content: string, message: string, sha?: string): Promise<void>;
}

/**
 * 提交有变化的 README 文件
 *
 * 逐个比较远端内容与本地内容：内容相同则跳过，远端不存在时创建新文件，否则带上 sha 更新。
 *
 * @param client - GitHub 客户端
 * @param files - 本地文件，返回顺序与传入顺序一致
 * @param message - 提交信息
 * @returns 实际提交的路径
 */
const commitReadmes = async (
    client: ReadmeClient,
    files: ReadmeFile[],
    message: string,
): Promise<string[]> => {
    const committed: string[] = [];

    for (const file of files) {
        const remote = await client.read(file.path);
        if (remote?.content === file.content) {
            continue;
        }

        await client.write(file.path, file.content, message, remote?.sha);
        committed.push(file.path);
    }

    return committed;
};

export { commitReadmes };
export type { ReadmeClient, ReadmeFile, RemoteFile };
