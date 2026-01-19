import type { Route } from "./+types/terminal";
import Input from "../components/input";
import Popover from "../components/popover";
import { useState, useRef, useEffect } from "react";

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
        createUser: (username: string) => void;
        changeUser: (username: string) => void;
        enterRoom: (roomName: string) => void;
        getHistory: () => void;
        getRooms: () => void;
    }
) => void | Promise<void>;

/** Command registry (Dict) */
const COMMANDS: Record<string, CmdHandler> = {
    help: async (_args, ctx) => {
        ctx.pushMessage(
            "Verfügbare Befehle: " + Object.keys(COMMANDS).join(", "), "INFO"
        );
    },
    whoami: (_args, ctx) => {
        ctx.pushMessage("Aktueller Benutzer: <" + ctx.user + ">", "INFO");
    },
    clear: (_args, ctx) => {
        // handled specially by caller (could also return a flag)
        ctx.pushMessage("", "CLEAR"); // Marker
    },
    history: (_args, ctx) => {
        ctx.getHistory();
    },
    send: (args, ctx) => {
        if (args.length === 0) throw new Error("send: Nachricht fehlt");
        ctx.pushMessage(args.join(" "), "OUT");
        ctx.pushMessage("Sende Nachricht...", "TEMPINFO");
    },
    forge: (args, ctx) => {
        if (!args[0]) throw new Error("forge: Benutzername fehlt");
        ctx.createUser(args[0]);
        ctx.pushMessage(`Erstelle neuen Nutzer '${args[0]}'...`, "TEMPINFO");
    },
    impersonate: (args, ctx) => {
        if (!args[0]) throw new Error("impersonate: Benutzername fehlt");
        ctx.changeUser(args[0]);
        ctx.pushMessage(`Wechsel zu Nutzer '${args[0]}'...`, "TEMPINFO");
    },
    enter: (args, ctx) => {
        if (!args[0]) throw new Error("enter: Raumname fehlt");
        ctx.pushMessage(`Wechsel zu Raum '${args[0]}'...`, "TEMPINFO");
        ctx.enterRoom(args[0]);
    },
    roomtour: (args, ctx) => {
        ctx.getRooms();
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

    const [[roomID, roomName], setRoom] = useState<[number, string]>([-1, "null"]);
    const [rooms, setRooms] = useState<{ id: number; name: string; }[]>([]);

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

    const ws = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const onlineFlag = useRef<boolean>(false);

    const connectWebSocket = () => {
        ws.current = new WebSocket("ws://localhost:12000/ws");
        pushMessage("Connecting...", "TEMPINFO");
        
        ws.current.onopen = () => { onlineFlag.current = true; pushMessage("Connected to Shello Server.", "INFO"); };

        //wenn der Server was schickt, wird das hier ausgeführt
        ws.current.onmessage = (event) => {
            const data = JSON.parse(event.data); //event.data ist der Text vom Server
            console.log("Nachricht vom Server:", data);
            switch (data.response) {
                case "get_rooms":
                    // Ergebnis kann z.B. [{ ID: 1, Name: "Raum" }, ...] sein
                    const mappedRooms = Array.isArray(data.result)
                        ? data.result.map((r: any) => ({
                              id: r.ID ?? r.id,
                              name: r.Name ?? r.name ?? "",
                          }))
                        : [];

                    setRooms(mappedRooms);

                    if (mappedRooms.length === 0) {
                        pushMessage("Keine Räume verfügbar.", "TEMPINFO");
                        return;
                    }

                    const roomNames = mappedRooms.map((r: { id: number; name: string }) => r.name);
                    pushMessage(
                        `Verfügbare Räume: \n ${roomNames.join(", ")}`,
                        "TEMPINFO"
                    );
                    break;
                case "get_messages":
                    console.log(data.result);
                    setMessages(
                        Array.isArray(data.result)
                            ? data.result.map((msg: any) => ({
                                    id: msg.MessageID,
                                    text: msg.Text ?? "",
                                    kind: "IN",
                                }))
                            : []
                    );
                    break;
                case "login_as":
                    setUser(data.result.Username);
                    pushMessage(`Gewechselt zu Nutzer ${data.result.Username}.`, "INFO");
                    break;
                case "create_user":
                    setUser(data.result.Username);
                    pushMessage(`Gewechselt zu neu ertelltem Nutzer '${data.result.Username}'.`, "INFO");
                    break;
                case "msg":
                    if (data.error !== null)
                        pushMessage(data.error, "ERROR");
                    else if (data.result !== null && data.result.length > 0)
                        pushMessage(data.result, "IN");
                    break;
            }
        }

        ws.current.onclose = () => {
            if (onlineFlag.current) {
                pushMessage("Disconnected from Shello Server.", "INFO");
                onlineFlag.current = false;
            }
            // Automatisch nach 3 Sekunden wieder verbinden
            if (ws.current) {
                ws.current.onclose = null;
                ws.current.onopen = null;
                ws.current.onmessage = null;
                ws.current = null;
            }
            reconnectTimeoutRef.current = setTimeout(() => {
                connectWebSocket();
            }, 3000);
        };
    };

    useEffect(() => {
        connectWebSocket();

        return () => {
            // Cleanup: Timeout abbrechen und WebSocket schließen
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            ws.current?.close();
        };
    }, []);

    function sendMessage(text: string) {
        // Nachricht an Server senden
        ws.current?.send(JSON.stringify({ func: "msg", text: text, room_id: roomID }));
    };

    function createUser(username: string) {
        // Nachricht an Server senden
        ws.current?.send(JSON.stringify({ func: "create_user", username: username }));
    };

    function changeUser(username: string) {
        // Nachricht an Server senden
        ws.current?.send(JSON.stringify({ func: "login_as", username: username }));
    };

    function getHistory() {
        // Nachricht an Server senden
        ws.current?.send(JSON.stringify({ func: "get_messages", room_id: roomID }));
    };

    function getRooms() {
        // Nachricht an Server senden
        ws.current?.send(JSON.stringify({ func: "get_rooms" }));
    };

    function enterRoom(roomName: string) {
        const match = rooms.find((r) => r.name === roomName);
        if (!match) {
            pushMessage(`Raum '${roomName}' nicht gefunden.`, "ERROR");
            return;
        }
        setRoom([match.id, match.name]);
        pushMessage(`Zu Raum '${roomName}' gewechselt.`, "INFO");
    }

    function pushMessage(text: string, kind: string = "OUT") {
        if (kind === "CLEAR") {
            //falls kind: clear alle nachichten löschen (nur lokal)
            setMessages([]);
            return;
        }
        if (kind === "OUT") {
            //falls kind: out, nachicht an server senden
            sendMessage(text);
        }

        //Neue Nachricht anhängen, aber vorher aufräumen
        setMessages((m) => {
            let updated = [...m];
            
            // Wenn kind der aktuellen Nachricht INFO oder OUT ist, lösche alle COMMAND, ERROR und TEMPINFO
            if (kind === "INFO" || kind === "OUT" || kind === "IN") {
                updated = updated.filter((msg) => 
                    msg.kind !== "COMMAND" && msg.kind !== "ERROR" && msg.kind !== "TEMPINFO"
                );
            }
            
            if (kind !== "OUT")
                return [...updated, { id: idRef.current++, text, kind }];
            else 
                return updated;
        });
    }

    function showPopover(text: string) {
        setPopoverText(text);
    }

    async function handleCommandLine(line: string) {
        if (!line.trim()) return;
        pushMessage(`> ${line}`, "COMMAND");

        try {
            const { cmd, args } = parseCommand(line);
            const handler = COMMANDS[cmd];
            if (!handler) throw new Error("Unbekannter Befehl: " + cmd);
            await handler(args, { user, setUser, pushMessage, createUser, changeUser, enterRoom, getRooms, getHistory });
        } catch (err: any) {
            showPopover(err?.message ?? String(err));
            pushMessage(err?.message ?? String(err), "ERROR");
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
                {/* Messages: nimmt verbleibenden Platz ein, extra padding-bottom damit nichts vom Input verdeckt wird */}
                <div className="flex-1 overflow-auto p-4 pb-32 bg-black text-white font-mono">
                    <div ref={messagesRef} className="w-full">
                        {messages.map((m) => (
                            <div
                                key={m.id}
                                className={
                                    m.kind === "ERROR"
                                        ? "text-red-400"
                                        : m.kind === "INFO"
                                          ? "text-yellow-300"
                                          : m.kind === "COMMAND"
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
