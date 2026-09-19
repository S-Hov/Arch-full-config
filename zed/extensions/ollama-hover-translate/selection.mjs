#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";

const text = process.argv[2]?.trim() ?? "";
if (!text) {
    process.stderr.write("Сначала выделите текст.\n");
    process.exit(1);
}

const response = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
        model: "qwen3.5:4b",
        stream: false,
        think: false,
        options: { temperature: 0, num_predict: 512 },
        messages: [
            {
                role: "system",
                content:
                    "Буквально переведи весь переданный текст на русский. Ничего не пропускай. " +
                    "Если это разделённое CamelCase-имя, переведи каждое слово отдельно и сохрани порядок: " +
                    "Get Me Service Result → Получить меня сервис результат. " +
                    "Сохрани код, идентификаторы, Markdown, пунктуацию и переносы строк. " +
                    "Исправляй очевидные опечатки. Верни только перевод без заголовка и пояснений.",
            },
            { role: "user", content: text },
        ],
    }),
});

if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
const data = await response.json();
const translation = String(data?.message?.content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```(?:markdown|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

if (!translation) throw new Error("Модель вернула пустой перевод");

const clipboard = spawn("/usr/bin/wl-copy", [], { stdio: ["pipe", "ignore", "ignore"] });
clipboard.stdin.end(translation);
spawnSync("/usr/bin/notify-send", ["Перевод выделенного текста", translation]);
process.stdout.write(`${translation}\n`);
