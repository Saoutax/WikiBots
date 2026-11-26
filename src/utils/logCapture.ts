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

export { startLogCapture };
export type { LogCapture, LogCaptureOptions };
