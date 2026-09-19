#!/usr/bin/env node

import { spawn } from "node:child_process";

const HOME = process.env.HOME;
if (!HOME) throw new Error("HOME is not set");
const ZED_DATA = `${process.env.XDG_DATA_HOME ?? `${HOME}/.local/share`}/zed`;
const VTSLS = `${ZED_DATA}/languages/vtsls/node_modules/@vtsls/language-server/bin/vtsls.js`;
const BIOME_TRANSLATOR = `${ZED_DATA}/extensions/installed/ollama-hover-translate/biome-server.mjs`;
const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const MODEL = "qwen3.5:4b";

const child = spawn("/usr/bin/node", [VTSLS, "--stdio"], {
    stdio: ["pipe", "pipe", "inherit"],
});
const biome = spawn("/usr/bin/node", [BIOME_TRANSLATOR], {
    stdio: ["pipe", "pipe", "inherit"],
});

const documents = new Map();
const pendingHovers = new Map();
const cache = new Map();
const BIOME_INITIALIZE_ID = "ollama-hover-biome-initialize";
let biomeReady = false;
let clientInitialized = false;
let biomeInitialized = false;
const biomeNotificationQueue = [];

function initializeBiome(params) {
    writeMessage(biome.stdin, {
        jsonrpc: "2.0",
        id: BIOME_INITIALIZE_ID,
        method: "initialize",
        params,
    });
}

function maybeNotifyBiomeInitialized() {
    if (biomeReady && clientInitialized) {
        writeMessage(biome.stdin, { jsonrpc: "2.0", method: "initialized", params: {} });
        clientInitialized = false;
        biomeInitialized = true;
        for (const message of biomeNotificationQueue.splice(0)) {
            writeMessage(biome.stdin, message);
        }
    }
}

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
                process.stderr.write(`hover translator: invalid LSP message: ${error}\n`);
            }
        }
    });
}

function writeMessage(stream, message) {
    const body = Buffer.from(JSON.stringify(message), "utf8");
    stream.write(`Content-Length: ${body.length}\r\n\r\n`);
    stream.write(body);
}

function wordAndContext(uri, position) {
    const text = documents.get(uri) ?? "";
    const lines = text.split(/\r?\n/);
    const lineIndex = Math.max(0, Math.min(position?.line ?? 0, lines.length - 1));
    const line = lines[lineIndex] ?? "";
    const character = Math.max(0, Math.min(position?.character ?? 0, line.length));
    let start = character;
    let end = character;
    while (start > 0 && /[$\p{L}\p{N}_]/u.test(line[start - 1])) start--;
    while (end < line.length && /[$\p{L}\p{N}_]/u.test(line[end])) end++;
    const word = line.slice(start, end);
    const from = Math.max(0, lineIndex - 5);
    const to = Math.min(lines.length, lineIndex + 6);
    return { word, context: lines.slice(from, to).join("\n") };
}

function hoverText(contents) {
    if (!contents) return "";
    if (typeof contents === "string") return contents;
    if (Array.isArray(contents)) return contents.map(hoverText).filter(Boolean).join("\n\n");
    if (typeof contents.value === "string") return contents.value;
    return "";
}

function cleanTranslation(text) {
    return text
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/^```(?:markdown|text)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .replace(/^(?:перевод|translation)\s*:\s*/i, "")
        .trim();
}

function splitIdentifier(word) {
    return word
        .replace(/([a-z\d])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function parseTranslation(text) {
    const cleaned = cleanTranslation(text);
    try {
        const parsed = JSON.parse(cleaned);
        const literal = String(parsed.literal ?? "").trim();
        const contextual = String(parsed.context ?? "").trim();
        if (literal) return { literal, contextual };
    } catch {
        // Some small local models occasionally wrap otherwise valid JSON in prose.
    }
    const literal = cleaned
        .replace(/^.*?"?literal"?\s*:\s*"?/i, "")
        .split(/"?\s*,\s*"?context"?\s*:/i)[0]
        .replace(/["}\s]+$/g, "")
        .trim();
    return literal ? { literal, contextual: "" } : null;
}

async function translate(source, word, context) {
    const key = `${word}\n${source}\n${context}`.slice(0, 6000);
    if (cache.has(key)) return cache.get(key);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const prose = source
            .replace(/```[\s\S]*?```/g, " ")
            .replace(/`[^`\n]+`/g, " ")
            .replace(/^\s*(?:\([^\n]+\)|(?:const|let|var|function|class|interface|type)\b).*$/gim, " ")
            .replace(/\s+/g, " ")
            .trim();
        const identifier = splitIdentifier(word);
        const task = [
            `Имя: ${identifier || "не указано"}`,
            prose ? `Текст документации: ${prose.slice(0, 2200)}` : "Текста документации нет.",
            `Локальный контекст (только соседние строки):\n${context.slice(0, 1400)}`,
            "Верни строгий JSON без Markdown: {\"literal\":\"...\",\"context\":\"...\"}",
        ].join("\n\n");

        const response = await fetch(OLLAMA_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
                model: MODEL,
                stream: false,
                think: false,
                options: { temperature: 0, num_predict: 128 },
                messages: [
                    {
                        role: "system",
                        content:
                            "Ты быстрый переводчик для IDE. Поле literal — максимально буквальный перевод имени, " +
                            "разделённого CamelCase, либо буквальный перевод переданного текста документации/ошибки. " +
                            "Для имени переводи каждое слово отдельно, ничего не пропускай и сохраняй порядок: " +
                            "например Get Me Service Result → Получить меня сервис результат. Не делай буквальный перевод естественнее. " +
                            "Не добавляй сведения, которых нет в исходнике. Поле context — одно короткое естественное предложение " +
                            "о смысле в данном фрагменте кода. Используй только переданные соседние строки, не предполагай " +
                            "содержимое других файлов. Исправляй очевидные опечатки. Ответ — только JSON.",
                    },
                    {
                        role: "user",
                        content: task,
                    },
                ],
            }),
        });
        if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
        const data = await response.json();
        const result = parseTranslation(data?.message?.content ?? "");
        if (result) {
            cache.set(key, result);
            if (cache.size > 300) cache.delete(cache.keys().next().value);
        }
        return result;
    } catch (error) {
        process.stderr.write(`hover translator: ${error}\n`);
        return "";
    } finally {
        clearTimeout(timeout);
    }
}

function appendTranslation(result, translation) {
    const contextLine = translation.contextual
        ? `\n\n**По контексту:** ${translation.contextual}`
        : "";
    const block = `**Дословно:** ${translation.literal}${contextLine}`;
    if (!result) {
        return { contents: { kind: "markdown", value: block.trim() } };
    }
    const contents = result.contents;
    if (contents && !Array.isArray(contents) && contents.kind === "markdown") {
        contents.value += block;
    } else if (Array.isArray(contents)) {
        contents.push(block.trim());
    } else {
        result.contents = [contents, block.trim()].filter(Boolean);
    }
    return result;
}

async function handleServerMessage(message) {
    const key = message.id === undefined ? null : String(message.id);
    const hover = key === null ? null : pendingHovers.get(key);
    if (!hover) {
        writeMessage(process.stdout, message);
        return;
    }

    pendingHovers.delete(key);
    const original = hoverText(message.result?.contents);
    const translation = await translate(original, hover.word, hover.context);
    if (translation) message.result = appendTranslation(message.result, translation);
    writeMessage(process.stdout, message);
}

createReader(process.stdin, (message) => {
    if (message.method === "initialize") {
        initializeBiome(message.params);
    } else if (message.method === "initialized") {
        clientInitialized = true;
        maybeNotifyBiomeInitialized();
    } else if (
        message.method?.startsWith("textDocument/did") ||
        message.method === "workspace/didChangeConfiguration" ||
        message.method === "workspace/didChangeWatchedFiles"
    ) {
        if (biomeInitialized) writeMessage(biome.stdin, message);
        else biomeNotificationQueue.push(message);
    }

    if (message.method === "textDocument/didOpen") {
        documents.set(message.params.textDocument.uri, message.params.textDocument.text);
    } else if (message.method === "textDocument/didChange") {
        const last = message.params.contentChanges?.at(-1);
        if (last && typeof last.text === "string" && !last.range) {
            documents.set(message.params.textDocument.uri, last.text);
        }
    } else if (message.method === "textDocument/didClose") {
        documents.delete(message.params.textDocument.uri);
    } else if (message.method === "textDocument/hover" && message.id !== undefined) {
        const uri = message.params.textDocument.uri;
        pendingHovers.set(String(message.id), wordAndContext(uri, message.params.position));
    } else if (message.method === "$/cancelRequest") {
        pendingHovers.delete(String(message.params.id));
    }
    writeMessage(child.stdin, message);
});

createReader(child.stdout, (message) => {
    void handleServerMessage(message);
});

createReader(biome.stdout, (message) => {
    if (String(message.id) === BIOME_INITIALIZE_ID) {
        biomeReady = true;
        maybeNotifyBiomeInitialized();
        return;
    }
    if (message.method === "textDocument/publishDiagnostics") {
        writeMessage(process.stdout, message);
        return;
    }
    if (message.id !== undefined && message.method) {
        const result = message.method === "workspace/configuration" ? [] : null;
        writeMessage(biome.stdin, { jsonrpc: "2.0", id: message.id, result });
    }
});

child.on("exit", (code) => process.exit(code ?? 0));
process.stdin.on("end", () => {
    child.stdin.end();
    biome.stdin.end();
});
