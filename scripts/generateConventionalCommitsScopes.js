import { promises as fs } from "fs";
import path from "path";

const SRC = path.resolve("src");
const SETTINGS = path.resolve(".vscode/settings.json");

const formatFolder = name => (name === "utils" ? name : name.toUpperCase());

async function getScopes() {
    const entries = await fs.readdir(SRC, { withFileTypes: true });
    const scopes = [];

    for (const dir of entries.filter(d => d.isDirectory())) {
        const folder = dir.name;
        const prefix = formatFolder(folder);

        const files = await fs.readdir(path.join(SRC, folder));

        for (const file of files.filter(f => f.endsWith(".js"))) {
            scopes.push(`${prefix}/${file.replace(/\.js$/, "")}`);
        }
    }

    return scopes.sort();
}

async function updateSettings(scopes) {
    let settings = {};

    try {
        settings = JSON.parse(await fs.readFile(SETTINGS, "utf8"));
    } catch {
        // ignore: settings.json不存在时使用默认设置
    }

    settings["conventionalCommits.scopes"] = scopes;

    await fs.writeFile(SETTINGS, JSON.stringify(settings, null, 4));
}

(async () => {
    const scopes = await getScopes();
    await updateSettings(scopes);
    console.log("Updated scopes:", scopes);
})();
