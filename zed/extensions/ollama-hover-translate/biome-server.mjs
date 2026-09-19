#!/usr/bin/env node

import { spawn } from "node:child_process";

const HOME = process.env.HOME;
if (!HOME) throw new Error("HOME is not set");
const ZED_DATA = `${process.env.XDG_DATA_HOME ?? `${HOME}/.local/share`}/zed`;
const BIOME = `${ZED_DATA}/extensions/work/biome/node_modules/@biomejs/cli-linux-x64/biome`;
const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const MODEL = "qwen3.5:4b";

const child = spawn(BIOME, ["lsp-proxy"], { stdio: ["pipe", "pipe", "inherit"] });
const cache = new Map();
const generations = new Map();

function createReader(stream, onMessage) {
    let buffer = Buffer.alloc(0);
    stream.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (true) {
            const headerEnd = buffer.indexOf("\r\n\r\n");
            if (headerEnd < 0) return;
            const header = buffer.subarray(0, headerEnd).toString("ascii");
            const match = /content-length:\s*(\d+)/i.exec(header);
            if (!match) {
                buffer = buffer.subarray(headerEnd + 4);
                continue;
            }
            const length = Number(match[1]);
            const bodyStart = headerEnd + 4;
            if (buffer.length < bodyStart + length) return;
            const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
            buffer = buffer.subarray(bodyStart + length);
            try {
                onMessage(JSON.parse(body));
            } catch (error) {
                process.stderr.write(`biome translator: invalid LSP message: ${error}\n`);
            }
        }
    });
}

function writeMessage(stream, message) {
    const body = Buffer.from(JSON.stringify(message), "utf8");
    stream.write(`Content-Length: ${body.length}\r\n\r\n`);
    stream.write(body);
}

function parseTranslations(text, expected) {
    const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed) && parsed.length === expected) {
            return parsed.map((item) => String(item).trim());
        }
    } catch {
        // Forward the original diagnostics if the local model did not return valid JSON.
    }
    return [];
}

async function translateMany(messages) {
    const unique = [...new Set(messages)];
    const missing = unique.filter((message) => !cache.has(message));
    if (missing.length) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(OLLAMA_URL, {
                method: "POST",
                headers: { "content-type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    model: MODEL,
                    stream: false,
                    think: false,
                    options: { temperature: 0, num_predict: Math.min(512, 64 * missing.length) },
                    messages: [
                        {
                            role: "system",
                            content:
                                "Буквально переведи сообщения диагностики кода на русский. Сохрани имена, пути, коды правил " +
                                "и фрагменты кода без изменений. Не объясняй и не добавляй советы. Верни только JSON-массив " +
                                "строк в том же порядке и той же длины.",
                        },
                        { role: "user", content: JSON.stringify(missing) },
                    ],
                }),
            });
            if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
            const data = await response.json();
            const translated = parseTranslations(data?.message?.content ?? "", missing.length);
            translated.forEach((value, index) => {
                if (value) cache.set(missing[index], value);
            });
            while (cache.size > 500) cache.delete(cache.keys().next().value);
        } catch (error) {
            process.stderr.write(`biome translator: ${error}\n`);
        } finally {
            clearTimeout(timeout);
        }
    }
    return messages.map((message) => cache.get(message) ?? "");
}

async function addDiagnosticTranslations(message, generation) {
    const diagnostics = message.params?.diagnostics ?? [];
    const sourceMessages = diagnostics.map((diagnostic) => diagnostic.message);
    const translated = await translateMany(sourceMessages);
    const uri = message.params?.uri;
    if (!uri || generations.get(uri) !== generation || !translated.some(Boolean)) return;

    const updated = structuredClone(message);
    updated.params.diagnostics.forEach((diagnostic, index) => {
        if (translated[index]) diagnostic.message += `\n\nПеревод: ${translated[index]}`;
    });
    writeMessage(process.stdout, updated);
}

createReader(process.stdin, (message) => writeMessage(child.stdin, message));
createReader(child.stdout, (message) => {
    writeMessage(process.stdout, message);
    if (message.method === "textDocument/publishDiagnostics" && message.params?.uri) {
        const uri = message.params.uri;
        const generation = (generations.get(uri) ?? 0) + 1;
        generations.set(uri, generation);
        void addDiagnosticTranslations(message, generation);
    }
});

child.on("exit", (code) => process.exit(code ?? 0));
process.stdin.on("end", () => child.stdin.end());
