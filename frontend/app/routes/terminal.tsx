import type { Route } from "./+types/terminal";
import Input from "../components/input";
import Popover from "../components/popover";
import Character from "~/components/character/Character";
import { useState, useRef, useEffect } from "react";
import { EmotionKey } from "~/components/character/types";

export function meta({}: Route.MetaArgs) {
    return [
        { title: "Testing" },
        { name: "description", content: "Welcome to React Router!" },
    ];
}

function parseCommand(input: string) {
    const args: string[] = [];
    let cur = "";
    let inQuote = false;
    let quoteChar = "";
    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (inQuote) {
            if (ch === quoteChar) {
                inQuote = false;
                quoteChar = "";
                if (cur !== "") {
                    args.push(cur);
                    cur = "";
                }
            } else {
                cur += ch;
            }
        } else {
            if (ch === '"' || ch === "'") {
                inQuote = true;
                quoteChar = ch;
            } else if (/\s/.test(ch)) {
                if (cur !== "") {
                    args.push(cur);
                    cur = "";
                }
            } else {
                cur += ch;
            }
        }
    }
    if (cur !== "") args.push(cur);
    if (inQuote) throw new Error("Unterminated quote");
    const cmd = args.shift() || "";
    return { cmd, args };
}

/** Command handler signature */
type CmdHandler = (
    args: string[],
    ctx: {
        user: string;
        setUser: (s: string) => void;
        pushMessage: (s: string, kind?: string) => void;
    }
) => void | Promise<void>;

/** Command registry (Dict) */
const COMMANDS: Record<string, CmdHandler> = {
    help: async (_args, ctx) => {
        ctx.pushMessage(
            "Verfügbare Befehle: " + Object.keys(COMMANDS).join(", ")
        );
    },
    whoami: (_args, ctx) => {
        ctx.pushMessage("Aktueller Benutzer: <" + ctx.user + ">");
    },
    clear: (_args, ctx) => {
        // handled specially by caller (could also return a flag)
        ctx.pushMessage("__CLEAR__"); // Marker
    },
    history: (_args, ctx) => {
        ctx.pushMessage("history not implemented");
    },
    send: (args, ctx) => {
        if (args.length === 0) throw new Error("send: Nachricht fehlt");
        ctx.pushMessage(args.join(" "));
    },
    forge: (args, ctx) => {
        if (!args[0]) throw new Error("forge: Benutzername fehlt");
        ctx.setUser(args[0]); // Abgleich ob der schon existiert
        ctx.pushMessage(`Neuer Nutzer '${args[0]}' erstellt`);
    },
    impersonate: (args, ctx) => {
        if (!args[0]) throw new Error("impersonate: Benutzername fehlt");
        ctx.setUser(args[0]); // Abgleich ob der existiert
        ctx.pushMessage(`Wechsle zu ${args[0]}`);
    },
};

export default function Terminal() {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<
        { id: number; text: string; kind?: string }[]
    >([]);
    const [user, setUser] = useState("guest");
    const [popoverText, setPopoverText] = useState(
        "Benutzen Sie 'help' für Hilfe."
    );
    const idRef = useRef(1);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const messagesRef = useRef<HTMLDivElement | null>(null);

    const commands = Object.keys(COMMANDS);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        const el = messagesRef.current;

        if (!el) return;

        // sofort ans Ende scrollen; für smooth: behavior: 'smooth'
        el.parentElement?.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    }, [messages]);

    function pushMessage(text: string, kind: string = "out") {
        // special clear marker handling
        if (text === "__CLEAR__") {
            setMessages([]);
            return;
        }
        setMessages((m) => [...m, { id: idRef.current++, text, kind }]);
    }

    function showPopover(text: string) {
        setPopoverText(text);
    }

    async function handleCommandLine(line: string) {
        if (!line.trim()) return;
        pushMessage(`> ${line}`, "info");

        try {
            const { cmd, args } = parseCommand(line);
            const handler = COMMANDS[cmd];
            if (!handler) throw new Error("Unbekannter Befehl: " + cmd);
            await handler(args, { user, setUser, pushMessage });
        } catch (err: any) {
            showPopover(err?.message ?? String(err));
        }
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            handleCommandLine(input);
            setInput("");
            e.preventDefault();
        } else if (e.key === "Tab") {
            e.preventDefault();
            const cur = input.split(/\s+/)[0];
            const match = commands.find((c) => c.startsWith(cur));
            if (match) setInput((s) => s.replace(/^[^\s]*/, match));
        }
    }

    return (
        <div className="flex items-center justify-center h-screen bg-gray-600">
            <div className="flex flex-col w-full h-full max-w-5xl">
                <Character emotion={EmotionKey.Surprised} />
                {/* Messages: nimmt verbleibenden Platz ein, extra padding-bottom damit nichts vom Input verdeckt wird */}
                <div className="flex-1 overflow-auto p-4 pb-32 bg-black text-white font-mono">
                    <div ref={messagesRef} className="w-full">
                        {messages.map((m) => (
                            <div
                                key={m.id}
                                className={
                                    m.kind === "error"
                                        ? "text-red-400"
                                        : m.kind === "info"
                                          ? "text-yellow-300"
                                          : ""
                                }
                            >
                                {m.text}
                            </div>
                        ))}
                    </div>
                </div>
                {/* Sticky wrapper for bottom bar */}
                <div className="sticky bottom-0 relative z-50">
                    {/* Popover for error messages*/}
                    {popoverText && (
                        <Popover
                            text={popoverText}
                            className="absolute inset-x-0 flex bottom-full justify-center z-40"
                            onClose={() => {
                                setPopoverText("");
                                inputRef.current?.focus();
                            }}
                        />
                    )}

                    {/* Input Bar */}
                    <div className="flex items-center gap-2 mx-auto z-50 p-2 bg-gray-900 border-t border-gray-700 relative">
                        <span className="text-gray-400 font-mono">
                            {user}@chat:$
                        </span>
                        <div className="flex-1">
                            <Input
                                inputRef={inputRef}
                                input={input}
                                setInput={setInput}
                                onKeyDown={onKeyDown}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
