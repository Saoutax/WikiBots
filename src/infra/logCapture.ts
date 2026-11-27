import { format } from 'node:util';

interface LogCaptureOptions {
    /** 保留的最大行数，默认 2000 */
    maxLines?: number;
    /** 保留的最大字节数，默认 256 KB */
    maxBytes?: number;
}

interface LogCapture {
    /** 获取当前捕获的日志文本 */
    text: () => string;
    /** 恢复原始 console 方法 */
    restore: () => void;
}

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 256 * 1024;

/**
 * 捕获当前进程的 console.log/info/warn/error 输出，并原样透传到原 console
 */
const startLogCapture = ({
    maxLines = DEFAULT_MAX_LINES,
    maxBytes = DEFAULT_MAX_BYTES,
}: LogCaptureOptions = {}): LogCapture => {
    const origLog = console.log;
    const origInfo = console.info;
    const origWarn = console.warn;
    const origError = console.error;

    const lines: string[] = [];
    let totalBytes = 0;

    const append = (text: string) => {
        for (const line of text.split(/\r?\n/)) {
            const lineBytes = Buffer.byteLength(`${line}\n`, 'utf8');
            lines.push(line);
            totalBytes += lineBytes;

            while (lines.length > maxLines || (totalBytes > maxBytes && lines.length > 1)) {
                const removed = lines.shift()!;
                totalBytes -= Buffer.byteLength(`${removed}\n`, 'utf8');
            }
        }
    };

    const wrap =
        (orig: (...args: unknown[]) => void) =>
        (...args: unknown[]) => {
            append(format(...args));
            orig.apply(console, args);
        };

    console.log = wrap(origLog);
    console.info = wrap(origInfo);
    console.warn = wrap(origWarn);
    console.error = wrap(origError);

    return {
        text: () => lines.join('\n'),
        restore: () => {
            console.log = origLog;
            console.info = origInfo;
            console.warn = origWarn;
            console.error = origError;
        },
    };
};

/**
 * 截取日志尾部（同时满足行数与字节数上限）
 */
const tailLog = (
    text: string,
    maxLines = DEFAULT_MAX_LINES,
    maxBytes = DEFAULT_MAX_BYTES,
): { tail: string; truncated: boolean } => {
    const trimmed = text.trimEnd();
    if (!trimmed) {
        return { tail: '(无日志输出)', truncated: false };
    }

    const allLines = trimmed.split(/\r?\n/);
    const sliced = allLines.slice(-maxLines);
    let truncated = allLines.length > maxLines;

    while (sliced.length > 1 && Buffer.byteLength(sliced.join('\n'), 'utf8') > maxBytes) {
        sliced.shift();
        truncated = true;
    }

    let tail = sliced.join('\n');
    if (Buffer.byteLength(tail, 'utf8') > maxBytes) {
        const buf = Buffer.from(tail, 'utf8');
        tail = buf.subarray(buf.length - maxBytes).toString('utf8');
        truncated = true;
    }

    return { tail, truncated };
};

export { startLogCapture, tailLog };
export type { LogCapture, LogCaptureOptions };
