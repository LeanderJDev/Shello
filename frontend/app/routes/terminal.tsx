import type { Route } from "./+types/terminal";
import Input from "../components/input";
import Popover from "../components/popover";
import Character from "~/components/character/Character";
import { useState, useRef, useEffect } from "react";
import { EmotionKey } from "~/components/character/types";

export function meta({}: Route.MetaArgs) {
    return [
        { title: "Shello" },
        { name: "description", content: "The shell inspired messaging app" },
    ];
}

/**
 * Speichert Session-Daten (User, Raum) in localStorage
 */
function saveSessionToStorage(user: string, roomID: number, roomName: string) {
    try {
        const sessionData = {
            user,
            roomID,
            roomName,
        };
        localStorage.setItem("shelloSession", JSON.stringify(sessionData));
    } catch (err) {
        console.error("Fehler beim Speichern der Session:", err);
    }
}

/**
 * Lädt Session-Daten (User, Raum) aus localStorage
 */
function loadSessionFromStorage(): { user: string; roomID: number; roomName: string } | null {
    try {
        const stored = localStorage.getItem("shelloSession");
        if (!stored) return null;
        return JSON.parse(stored);
    } catch (err) {
        console.error("Fehler beim Laden der Session:", err);
        return null;
    }
}

/**
 * Parst eine Kommandozeilen-Eingabe in Befehl und Argumente
 * Unterstützt Quoting mit einfachen und doppelten Anführungszeichen
 * z.B. "send 'hallo welt'" -> cmd: "send", args: ["hallo welt"]
 */
function parseCommand(input: string) {
    const args: string[] = []; // Sammelt alle Argumente
    let cur = ""; // Aktuelles Wort/Argument wird hier aufgebaut
    let inQuote = false; // Flag: befinden wir uns in Anführungszeichen?
    let quoteChar = ""; // Welches Anführungszeichen wurde geöffnet (' oder ")?

    // Zeichenweise durch Input iterieren
    for (let i = 0; i < input.length; i++) {
        const ch = input[i];

        if (inQuote) {
            // Wir sind innerhalb von Anführungszeichen
            if (ch === quoteChar) {
                // Schließendes Anführungszeichen gefunden
                inQuote = false;
                quoteChar = "";
                if (cur !== "") {
                    args.push(cur);
                    cur = "";
                }
            } else {
                // Zeichen gehört zum aktuellen Argument
                cur += ch;
            }
        } else {
            // Wir sind außerhalb von Anführungszeichen
            if (ch === '"' || ch === "'") {
                // Öffnendes Anführungszeichen
                inQuote = true;
                quoteChar = ch;
            } else if (/\s/.test(ch)) {
                // Whitespace = Trennzeichen zwischen Argumenten
                if (cur !== "") {
                    args.push(cur);
                    cur = "";
                }
            } else {
                // Normales Zeichen
                cur += ch;
            }
        }
    }

    // Letztes Argument hinzufügen, falls vorhanden
    if (cur !== "") args.push(cur);

    // Fehler wenn Anführungszeichen nicht geschlossen wurde
    if (inQuote) throw new Error("Unterminated quote");

    // Erstes Argument ist der Befehl, Rest sind Parameter
    const cmd = args.shift() || "";
    return { cmd, args };
}

/**
 * Signatur für Command Handler Funktionen
 * @param args - Array der übergebenen Argumente (ohne Befehlsnamen)
 * @param ctx - Kontext-Objekt mit:
 *   - user: aktueller Benutzername
 *   - setUser: Funktion zum Ändern des Benutzernamens
 *   - pushMessage: Funktion zum Hinzufügen von Nachrichten zur Ausgabe
 *   - themeColors: Aktuelle Theme-Farben
 *   - setThemeColors: Funktion zum Ändern des Themes
 */
type CmdHandler = (
    args: string[],
    ctx: {
        user: string;
        setUser: (s: string) => void;
        pushMessage: (s: string, kind: string, sender: string) => void;
        sendMessage: (text: string) => void;
        createUser: (username: string) => void;
        createRoom: (roomName: string) => void;
        changeUser: (username: string) => void;
        enterRoom: (roomName: string) => void;
        getHistory: () => void;
        getRooms: () => void;
        roomExists: (roomName: string) => boolean;
        getRoomByName: (roomName: string) => { id: number; name: string } | undefined;
        getAllRoomNames: () => string[];
        showSystemNotification: (text: string) => void;
        themeColors?: ThemeColors;
        setThemeColors?: (colors: ThemeColors) => void;
        deleteMsg: (msgID: number) => void;
    },
) => void | Promise<void>;

/**
 * Zentrale Befehls-Registry
 * Hier werden alle verfügbaren Terminal-Befehle definiert
 * (Sortiert nach Kategorien wie in help angezeigt)
 */
const COMMANDS: Record<string, CmdHandler> = {
    h: (_args, ctx) => {
        ctx.pushMessage(
            "Verfügbare Befehle: " + Object.keys(COMMANDS).join(", "),
            "INFO",
            "System",
        );
    },
    whoami: (_args, ctx) => {
        ctx.pushMessage(
            "Aktueller Benutzer: <" + ctx.user + ">",
            "INFO",
            "System",
        );
    },
    clear: (_args, ctx) => {
        // handled specially by caller (could also return a flag)
        ctx.pushMessage("", "CLEAR", "System"); // Marker
    },
    clearall: (_args, ctx) => {
        // handled specially by caller (could also return a flag)
        ctx.pushMessage("", "CLEAR_ALL", "System"); // Marker
    },
    history: (_args, ctx) => {
        ctx.getHistory();
    },
    send: (args, ctx) => {
        if (args.length === 0) throw new Error("send: Nachricht fehlt");
        const message = args.join(" ");
        ctx.sendMessage(message);
    },
    // Erstellt einen neuen Benutzer (oder wechselt zu einem Namen)
    forge: (args, ctx) => {
        if (!args[0]) throw new Error("forge: Benutzername fehlt");
        ctx.createUser(args[0]);
        ctx.pushMessage(
            `Erstelle neuen Nutzer '${args[0]}'...`,
            "TEMPINFO",
            "System",
        );
        ctx.showSystemNotification(`Neuer Nutzer '${args[0]}' erstellt`);
    },

    // Wechselt zu einem anderen Benutzer
    impersonate: (args, ctx) => {
        if (!args[0]) throw new Error("impersonate: Benutzername fehlt");
        ctx.changeUser(args[0]);
        ctx.pushMessage(
            `Wechsel zu Nutzer '${args[0]}'...`,
            "TEMPINFO",
            "System",
        );
    },

    // Neuen Raum erstellen
    "create room": (args, ctx) => {
        if (!args[0]) throw new Error("create room: Raumname fehlt");

        const roomName = args.join(" "); // Unterstütze Leerzeichen im Namen

        // Prüfe ob Raum bereits existiert
        if (ctx.roomExists(roomName)) {
            throw new Error(`Raum '${roomName}' existiert bereits`);
        }

        // Sende create_room an Server (Erfolgsmeldung kommt vom Server)
        ctx.createRoom(roomName);
    },

    //raum betreten
    accede: (args, ctx) => {
        if (!args[0]) throw new Error("enter: Raumname fehlt");
        ctx.pushMessage(
            `Wechsel zu Raum '${args[0]}'...`,
            "TEMPINFO",
            "System",
        );
        ctx.enterRoom(args[0]);
    },

    //alle räume anzeigen
    roomtour: (args, ctx) => {
        ctx.getRooms();
    },

    annihilate: (args, ctx) => {
        const num = parseInt(args[0]);
        if (!Number.isNaN(num)) {
            ctx.deleteMsg(num);
        }
        else throw new Error("annihilate: parameter not a number");
    },

    // === PERSONALISIERUNG ===

    // theme - Passe die Farben und Schriftarten des Terminals an.
    // Optionen:
    //   -tc <Farbe>  - Textfarbe (text color)
    //   -bg <Farbe>  - Hintergrundfarbe (background)
    //   -bc <Farbe>  - Randfarbe (border color)
    //   -ob <Farbe>  - Äußere Hintergrundfarbe (outer background)
    //   -hv <Farbe>  - Button Hover Farbe
    //   -sc <Farbe>  - System-Nachrichten Farbe (system color)
    //   -f <Schriftart> - Schriftart (font)
    theme: (args, ctx) => {
        if (!ctx.setThemeColors || !ctx.themeColors) {
            ctx.showSystemNotification("Theme-Verwaltung nicht verfügbar");
            return;
        }

        // Parse Argumente
        let textColor: string | null = null;
        let bgColor: string | null = null;
        let borderColor: string | null = null;
        let outerBgColor: string | null = null;
        let hoverColor: string | null = null;
        let systemColor: string | null = null;
        let font: string | null = null;

        for (let i = 0; i < args.length; i++) {
            if (args[i] === "-tc" && i + 1 < args.length) {
                textColor = args[i + 1];
                i++;
            } else if (args[i] === "-bg" && i + 1 < args.length) {
                bgColor = args[i + 1];
                i++;
            } else if (args[i] === "-bc" && i + 1 < args.length) {
                borderColor = args[i + 1];
                i++;
            } else if (args[i] === "-ob" && i + 1 < args.length) {
                outerBgColor = args[i + 1];
                i++;
            } else if (args[i] === "-hv" && i + 1 < args.length) {
                hoverColor = args[i + 1];
                i++;
            } else if (args[i] === "-sc" && i + 1 < args.length) {
                systemColor = args[i + 1];
                i++;
            } else if (args[i] === "-f" && i + 1 < args.length) {
                font = args[i + 1];
                i++;
            }
        }

        if (
            !textColor &&
            !bgColor &&
            !borderColor &&
            !outerBgColor &&
            !hoverColor &&
            !systemColor &&
            !font
        ) {
            ctx.showSystemNotification(
                "Verwendung: theme [Optionen]\n" +
                    "Optionen:\n" +
                    "  -tc <Farbe>  Textfarbe\n" +
                    "  -bg <Farbe>  Hintergrundfarbe\n" +
                    "  -bc <Farbe>  Randfarbe\n" +
                    "  -ob <Farbe>  Äußere Hintergrundfarbe\n" +
                    "  -hv <Farbe>  Button Hover Farbe\n" +
                    "  -sc <Farbe>  System-Nachrichten Farbe\n" +
                    "  -f <Schrift> Schriftart (noch nicht implementiert)\n\n" +
                    "Beispiel: theme -tc #00ff00 -bg #000000",
            );
            return;
        }

        // Aktuelles Theme kopieren und anpassen
        const newTheme = { ...ctx.themeColors };
        const changes: string[] = [];

        if (textColor) {
            newTheme.textColor = textColor;
            changes.push(`Textfarbe: ${textColor}`);
        }

        if (bgColor) {
            newTheme.bgColor = bgColor;
            changes.push(`Hintergrundfarbe: ${bgColor}`);
        }

        if (borderColor) {
            newTheme.borderColor = borderColor;
            changes.push(`Randfarbe: ${borderColor}`);
        }

        if (outerBgColor) {
            newTheme.outerBgColor = outerBgColor;
            changes.push(`Äußere Hintergrundfarbe: ${outerBgColor}`);
        }

        if (hoverColor) {
            newTheme.buttonHoverBgColor = hoverColor;
            changes.push(`Hover-Farbe: ${hoverColor}`);
        }

        if (systemColor) {
            newTheme.systemTextColor = systemColor;
            changes.push(`System-Nachrichten Farbe: ${systemColor}`);
        }

        if (font) {
            // Schriftart wird hier nicht direkt im Theme gespeichert
            // TODO: Schriftart-Verwaltung implementieren
            changes.push(`Schriftart ${font} (noch nicht unterstützt)`);
        }

        ctx.setThemeColors(newTheme);
        ctx.showSystemNotification(
            "Theme angepasst:\n  " + changes.join("\n  "),
        );
    },

    // theme save <Themenname> - Speichere aktuelles Theme
    "theme save": (args, ctx) => {
        if (!ctx.themeColors) {
            ctx.showSystemNotification("Theme-Verwaltung nicht verfügbar");
            return;
        }

        if (args.length === 0) {
            ctx.showSystemNotification("Verwendung: theme save <Themenname>");
            return;
        }

        const themeName = args[0];

        // Theme im localStorage speichern
        try {
            const savedThemes = JSON.parse(
                localStorage.getItem("savedThemes") || "{}",
            );
            savedThemes[themeName] = ctx.themeColors;
            localStorage.setItem("savedThemes", JSON.stringify(savedThemes));
            ctx.showSystemNotification(`Theme '${themeName}' gespeichert`);
        } catch (err) {
            ctx.showSystemNotification("Fehler beim Speichern des Themes");
        }
    },

    // theme load <Themenname> - Lade gespeichertes Theme
    "theme load": (args, ctx) => {
        if (!ctx.setThemeColors) {
            ctx.showSystemNotification("Theme-Verwaltung nicht verfügbar");
            return;
        }

        if (args.length === 0) {
            // Liste alle gespeicherten Themes auf
            try {
                const savedThemes = JSON.parse(
                    localStorage.getItem("savedThemes") || "{}",
                );
                const themeNames = Object.keys(savedThemes);

                if (themeNames.length === 0) {
                    ctx.showSystemNotification(
                        "Keine gespeicherten Themes vorhanden",
                    );
                } else {
                    ctx.showSystemNotification(
                        "Gespeicherte Themes:\n  " + themeNames.join("\n  "),
                    );
                }
            } catch (err) {
                ctx.showSystemNotification("Fehler beim Laden der Theme-Liste");
            }
            return;
        }

        const themeName = args[0];

        // Theme aus localStorage laden
        try {
            const savedThemes = JSON.parse(
                localStorage.getItem("savedThemes") || "{}",
            );

            if (!savedThemes[themeName]) {
                ctx.showSystemNotification(
                    `Theme '${themeName}' nicht gefunden`,
                );
                return;
            }

            ctx.setThemeColors(savedThemes[themeName]);
            ctx.showSystemNotification(`Theme '${themeName}' geladen`);
        } catch (err) {
            ctx.showSystemNotification("Fehler beim Laden des Themes");
        }
    },

    // === SYSTEM ===

    // Zeigt alle verfügbaren Befehle an
    help: async (_args, ctx) => {
        ctx.showSystemNotification(helpText);
    },

    // exit - Beende die Terminal-Sitzung.
    exit: (_args, ctx) => {
        // TODO: Implementieren
        ctx.showSystemNotification("exit command not implemented yet");
    },
};

const helpText = "Verfügbare Befehle:\n\n" +
                "=== Nachrichten ===\n" +
                "  send <Nachricht>     - Sendet eine Nachricht\n" +
                "  clear                - Löscht alle Info-Nachrichten aus dem Terminal\n" +
                "  clearall             - Löscht alle Nachrichten aus dem Terminal\n" +
                "  history              - Zeigt Nachrichtenverlauf des aktuellen Raums\n\n" +
                "=== Benutzer ===\n" +
                "  whoami               - Zeigt aktuellen Benutzer\n" +
                "  forge <Name>         - Erstellt neuen Benutzer\n" +
                "  impersonate <Name>   - Wechselt zu anderem Benutzer\n" +
                "  accede                - Wechselt Chat\n" +
                "  roomtour             - Liste alle Benutzer/Gruppen\n\n" +
                "=== Personalisierung ===\n" +
                "  theme [Optionen]     - Passe Farben und Schrift an\n" +
                "    -tc <Farbe>        - Textfarbe\n" +
                "    -bg <Farbe>        - Hintergrundfarbe\n" +
                "    -bc <Farbe>        - Randfarbe\n" +
                "    -ob <Farbe>        - Äußere Hintergrundfarbe\n" +
                "    -hv <Farbe>        - Button Hover Farbe\n" +
                "    -sc <Farbe>        - System-Nachrichten Farbe\n" +
                "    -f <Schrift>       - Schriftart (noch nicht implementiert)\n" +
                "  theme save <Name>    - Speichere aktuelles Theme\n" +
                "  theme load [Name]    - Lade gespeichertes Theme (ohne Name: Liste)\n\n" +
                "=== System ===\n" +
                "  help                 - Diese Hilfe\n" +
                "  h                    - Kurze Befehlsliste\n" +
                "  exit                 - Beende Terminal-Sitzung (noch nicht implementiert)";

/**
 * Theme-Definition für das Terminal
 */
interface ThemeColors {
    outerBgColor: string;
    bgColor: string;
    textColor: string;
    borderColor: string;
    buttonHoverBgColor: string;
    systemTextColor: string;
}

// Standard-Theme (Dunkles Terminal-Design)
const defaultTheme: ThemeColors = {
    outerBgColor: "#1a1a1a",
    bgColor: "#000000",
    textColor: "#00ff00",
    borderColor: "#333333",
    buttonHoverBgColor: "#00cc00",
    systemTextColor: "#ffcc00",
};

/**
 * Haupt-Komponente für das Terminal-Interface
 * Bietet eine Kommandozeile mit verschiedenen Befehlen
 */

export default function Terminal() {
    // Aktueller Text im Input-Feld
    const [input, setInput] = useState("");

    // Array aller angezeigten Nachrichten im Terminal
    // Jede Nachricht hat: id (eindeutig), text (Inhalt), kind (Typ: out/error/info), sender (Absender)
    const [messages, setMessages] = useState<
        {
            id: number;
            text: string;
            kind?: string;
            sender: string;
            timestamp?: Date;
            readBy?: number; // Anzahl der Personen, die die Nachricht gelesen haben
        }[]
    >([]);

    // Aktueller Benutzername (wird im Prompt angezeigt)
    // Versuche gespeicherte Session aus localStorage zu laden
    const [user, setUser] = useState(() => {
        const saved = loadSessionFromStorage();
        return saved?.user || "guest";
    });

    // Text für Fehler-Popover (leer = Popover ist versteckt)
    const [popoverText, setPopoverText] = useState("");

    const [knownUsers, setUsers] = useState<{ id: number; name: string }[]>([]);

    // Theme-Farben
    const [themeColors, setThemeColors] = useState<ThemeColors>(defaultTheme);

    // System-Benachrichtigung
    const [systemNotification, setSystemNotification] = useState("");

    // Auto-Scroll aktiviert (wird deaktiviert wenn User hochscrollt)
    const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

    // Counter für eindeutige Message-IDs
    const idRef = useRef(1);

    // Referenz zum Input-Element (für Focus-Management)
    const inputRef = useRef<HTMLInputElement | null>(null);

    // Referenz zum scrollbaren Nachrichten-Container (für Auto-Scroll)
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    // Ref für aktuellen messages state (um in WebSocket Handler Zugriff zu haben)
    const messagesStateRef = useRef(messages);

    // cycle through available emotions
    const emotionKeys = Object.values(EmotionKey) as EmotionKey[];
    const [emotionIndex, setEmotionIndex] = useState(0);
    const currentEmotion = emotionKeys[emotionIndex % emotionKeys.length];

    useEffect(() => {
        const id = setInterval(() => {
            setEmotionIndex((i) => (i + 1) % emotionKeys.length);
        }, 2200);
        return () => clearInterval(id);
    }, [emotionKeys.length]);

    const [[roomID, roomName], setRoom] = useState<[number, string]>(() => {
        const saved = loadSessionFromStorage();
        if (saved) {
            return [saved.roomID, saved.roomName];
        }
        return [-1, "null"];
    });
    const [rooms, setRooms] = useState<{ id: number; name: string }[]>([]);

    // Session-Daten in localStorage speichern wenn sie sich ändern
    useEffect(() => {
        saveSessionToStorage(user, roomID, roomName);
    }, [user, roomID, roomName]);

    // Liste aller verfügbaren Befehle (für Tab-Completion)
    const commands = Object.keys(COMMANDS);

    // Befehlshistorie
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Abgeleitete Variablen für Kompatibilität
    const username = user;
    const roomLabel = roomName !== "null" ? `${roomName}` : "No Room Selected";
    const inputValue = input;
    const setInputValue = setInput;
    const bgColor = themeColors.bgColor;
    const textColor = themeColors.textColor;
    const systemTextColor = themeColors.systemTextColor;
    const buttonHoverBgColor = themeColors.buttonHoverBgColor;

    // Beim ersten Laden: Input-Feld fokussieren
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Automatisch nach unten scrollen wenn neue Nachrichten hinzukommen
    // ABER nur wenn Auto-Scroll aktiviert ist (User nicht hochgescrollt hat)
    useEffect(() => {
        if (!autoScrollEnabled) return;

        const el = scrollContainerRef.current;
        if (!el) return;

        // Scrolle zum Ende des Containers
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, [messages, autoScrollEnabled]);

    // Handler für Scroll-Events: Prüft ob User ganz unten ist
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const scrollTop = target.scrollTop;
        const scrollHeight = target.scrollHeight;
        const clientHeight = target.clientHeight;

        // Toleranz von 5px - wenn User innerhalb von 5px vom Ende ist, gilt das als "unten"
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 5;

        // Auto-Scroll aktivieren wenn User ganz unten ist, sonst deaktivieren
        setAutoScrollEnabled(isAtBottom);
    };

    const ws = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const onlineFlag = useRef<boolean>(false);

    const nextRequestSilent = useRef<boolean>(false);

    function tryPushMessage(text: string, kind: string, sender: string) {
        if (nextRequestSilent.current) {
            nextRequestSilent.current = false;
            console.log(`suppressed msg:\n${text}`);
            return;
        }
        pushMessage(text, kind, sender);
    }

    function pushMessageDirectly(msg: { id: number; text: string; kind?: string; sender: string; timestamp?: Date, readBy?: number; }) {
        pushMessage(msg.text, msg.kind ?? "IN", msg.sender, msg.timestamp, msg.id);
    }

    const connectWebSocket = () => {
        ws.current = new WebSocket("ws://localhost:12000/ws");
        pushMessage("Connecting...", "TEMPINFO", "System");

        ws.current.onopen = () => {
            onlineFlag.current = true;
            pushMessage("Connected to Shello Server.", "INFO", "System");
            nextRequestSilent.current = true;
            getRooms();

            // Wenn ein gespeicherter User (nicht guest) vorhanden ist, setze ihn auf dem Server
            if (user && user !== "guest") {
                ws.current?.send(
                    JSON.stringify({ func: "login_as", username: user })
                );
            }

            // Wenn ein gültiger Raum aus localStorage geladen wurde, trete bei und lade Historie
            if (roomID > 0) {
                // Warte kurz, damit login_as vorher verarbeitet werden kann
                setTimeout(() => {
                    // Trete dem Raum auf dem Server bei (wichtig für Mitgliederzählung)
                    ws.current?.send(
                        JSON.stringify({ func: "join_room", room_id: roomID })
                    );
                    getHistory();
                }, 100); // 100ms Verzögerung
            }
        };

        //wenn der Server was schickt, wird das hier ausgeführt
        ws.current.onmessage = (event) => {
            const data = JSON.parse(event.data); //event.data ist der Text vom Server
            console.log("Nachricht vom Server:", data);

            // Broadcast-Events vom Server (haben "event" statt "response")
            if (data.event) {
                switch (data.event) {
                    case "new_message":
                        // Neue Nachricht wurde gebroadcastet
                        const msg = data.payload?.message;
                        if (msg) {
                            pushMessageDirectly(
                                {
                                    id: msg.MessageID,
                                    text: msg.Text ?? "",
                                    kind: "IN",
                                    sender: msg.Name ?? "unknown",
                                    timestamp: msg.Time
                                        ? new Date(msg.Time.replace(" ", "T"))
                                        : new Date(),
                                    readBy: msg.ReadBy ?? 0, // Anzahl der Leser vom Server
                                },
                            );
                        }
                        break;
                    case "room_created":
                        // Neuer Raum wurde erstellt
                        nextRequestSilent.current = true;
                        getRooms();
                        pushMessage(
                            `Raum '${data.payload.room_name}' erfolgreich erstellt.`,
                            "TEMPINFO",
                            "System",
                        );
                        break;
                    case "room_updated":
                        // Raum wurde aktualisiert
                        nextRequestSilent.current = true;
                        getRooms();
                        break;
                    case "user_joined":
                        // Benutzer ist beigetreten
                        const joinedUser = data.payload;
                        if (joinedUser?.user_id && joinedUser?.username) {
                            addUserToKnownList(joinedUser.user_id, joinedUser.username);
                        }
                        break;
                    case "user_left":
                        // Benutzer hat verlassen
                        break;
                    case "message_deleted":
                        const mesg = messagesStateRef.current.find(msg => msg.id === data.payload.message_id);
                        console.log("message_deleted event received for id:", data.payload.message_id, "found message:", mesg);
                        //setMessages(prev => prev.filter(m => m.id !== data.payload.message_id));
                        //anstelle es zu löschen, als gelöscht markieren
                        setMessages((m) => {
                            let updated = [...m];

                            //get msg to delete
                            const msgToDelete = updated.findIndex(
                                (msg) => msg.id === data.payload.message_id,
                            
                            );
                            
                            if (msgToDelete === -1) {
                                console.warn("Message to delete not found:", data.payload.message_id);
                                return updated; //keine änderung
                            }

                            updated[msgToDelete].text = "[Nachricht gelöscht]";
                            updated[msgToDelete].kind = "INFO";
                            return [...updated];
                        });
                        break;
                }
                return; // Broadcast-Event behandelt
            }

            // Response-Events vom Server (haben "response" statt "event")
            switch (data.response) {
                case "get_rooms":
                    // Ergebnis kann z.B. [{ ID: 1, Name: "Raum", MemberCount: 5 }, ...] sein
                    const mappedRooms = Array.isArray(data.result)
                        ? data.result.map((r: any) => ({
                              id: r.ID ?? r.id,
                              name: r.Name ?? r.name ?? "",
                              memberCount: r.MemberCount ?? r.memberCount ?? 0,
                          }))
                        : [];

                    setRooms(mappedRooms);

                    if (mappedRooms.length === 0) {
                        tryPushMessage(
                            "Keine Räume verfügbar.",
                            "TEMPINFO",
                            "System",
                        );
                        return;
                    }

                    // Sortiere Räume nach Mitgliederzahl (meiste zuerst)
                    const sortedRooms = [...mappedRooms].sort(
                        (a, b) => b.memberCount - a.memberCount
                    );

                    // Erstelle nummerierte Liste mit Mitgliederanzahl
                    const roomList = sortedRooms
                        .map((r, index) => {
                            const members = r.memberCount > 0
                                ? ` (${r.memberCount} ${r.memberCount === 1 ? 'Mitglied' : 'Mitglieder'})`
                                : '';
                            return `${index + 1}. ${r.name}${members}`;
                        })
                        .join('\n');

                    tryPushMessage(
                        `Verfügbare Räume:\n${roomList}`,
                        "TEMPINFO",
                        "System",
                    );
                    break;
                case "msg":
                    if (data.error !== null)
                        tryPushMessage(
                            "Fehler beim Senden der Nachricht: " + data.error,
                            "ERROR",
                            "System",
                        );
                    // Nachricht wurde erfolgreich gesendet
                    // Die neue Nachricht kommt über broadcast "new_message"
                    break;
                case "get_messages":
                    console.log(data.result);
                    setMessages(
                        Array.isArray(data.result)
                            ? data.result.map((msg: any) => ({
                                  id: msg.MessageID,
                                  text: msg.Text ?? "",
                                  kind: "IN",
                                  sender: msg.Name ?? "unknown",
                                  timestamp: msg.Time
                                      ? new Date(msg.Time.replace(" ", "T"))
                                      : new Date(),
                                  readBy: msg.ReadBy ?? 0, // Anzahl der Leser vom Server
                              }))
                            : [],
                    );
                    break;
                case "join_room":
                    if (data.error !== null) {
                        tryPushMessage(
                            `Fehler beim Beitreten: ${data.error}`,
                            "ERROR",
                            "System",
                        );
                    }
                    // Erfolgreicher Beitritt - broadcast kommt vom Server
                    break;
                case "login_as":
                    if (data.error === null) {
                        setUser(data.result.username);
                        tryPushMessage(
                            `Gewechselt zu Nutzer ${data.result.username}.`,
                            "INFO",
                            "System",
                        );
                        addUserToKnownList(
                            data.result.user_id,
                            data.result.username,
                        );
                    } else
                        tryPushMessage(
                            `Fehler beim Wechsel des Nutzers: ${data.error}`,
                            "ERROR",
                            "System",
                        );
                    break;
                case "create_user":
                    if (data.error === null) {
                        setUser(data.result.username);
                        tryPushMessage(
                            `Gewechselt zu neu ertelltem Nutzer '${data.result.username}'.`,
                            "INFO",
                            "System",
                        );
                        addUserToKnownList(
                            data.result.user_id,
                            data.result.username,
                        );
                    } else
                        tryPushMessage(
                            `Fehler bei der Erstellung des Nutzers: ${data.error}`,
                            "ERROR",
                            "System",
                        );
                    break;
                case "create_room":
                    if (data.error === null) {
                        const newRoomId = data.result.room_id;
                        const newRoomName = data.result.room_name;

                        pushMessage(
                            `Raum '${newRoomName}' erfolgreich erstellt.`,
                            "TEMPINFO",
                            "System",
                        );

                        // Direkt in den neu erstellten Raum wechseln
                        setRoom([newRoomId, newRoomName]);
                        pushMessage(`Zu Raum '${newRoomName}' gewechselt.`, "TEMPINFO", "System");

                        // Trete dem Raum auf dem Server bei
                        ws.current?.send(
                            JSON.stringify({ func: "join_room", room_id: newRoomId })
                        );

                        // Aktualisiere Raumliste im Hintergrund (ohne Anzeige)
                        nextRequestSilent.current = true;
                        getRooms();
                    } else if (data.error) {
                        pushMessage(
                            `Fehler beim Erstellen des Raums: ${data.error}`,
                            "ERROR",
                            "System",
                        );
                    }
                    break;
                case "nameof_user":
                    if (data.error === null && data.result !== null) {
                        addUserToKnownList(
                            data.result.user_id,
                            data.result.username,
                        );
                    } else
                        throw new Error(
                            "Fehler beim Abrufen des Benutzernamens: " +
                                data.error,
                        ); //hintergrund abfrage muss nicht sichtbar sein
                    break;
                case "delete_msg":
                    if (data.error !== null)
                        tryPushMessage(
                            "Fehler beim Löschen der Nachricht: " + data.error,
                            "ERROR",
                            "System",
                        );
                    else {
                        tryPushMessage(
                            `Nachricht erfolgreich gelöscht.`,
                            "INFO",
                            "System",
                        );
                    }
                    break;
            }
        };

        ws.current.onclose = () => {
            if (onlineFlag.current) {
                pushMessage(
                    "Disconnected from Shello Server.",
                    "INFO",
                    "System",
                );
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
        ws.current?.send(
            JSON.stringify({ func: "msg", text: text, room_id: roomID }),
        );
    }

    function deleteMsg(relativeMsg: number) {
        var msgCount = 0;

        if (relativeMsg <= 0) {
            pushMessage(
                "annihilate: parameter must be a positive number and not zero",
                "ERROR",
                "System",
            );
            return;
        }

        while (relativeMsg > 0) {
            msgCount++;
            const msg = messages[messages.length - msgCount];
            if (msg.sender === user && (msg.kind === "IN" || msg.kind === "OUT")) {
                relativeMsg--;
                console.log(`counting msg for deletion: ${msg.id} (${msg.text})`);
            }
        }

        const msgID = messages[messages.length - msgCount].id;

        // Nachricht an Server senden
        ws.current?.send(
            JSON.stringify({ func: "delete_msg", message_id: msgID, room_id: roomID }),
        );
    }

    function createUser(username: string) {
        // Nachricht an Server senden
        ws.current?.send(
            JSON.stringify({ func: "create_user", username: username }),
        );
    }

    function createRoom(roomName: string) {
        // Nachricht an Server senden
        ws.current?.send(
            JSON.stringify({ func: "create_room", room_name: roomName }),
        );
    }

    function changeUser(username: string) {
        // Nachricht an Server senden
        ws.current?.send(
            JSON.stringify({ func: "login_as", username: username }),
        );
    }

    function getHistory() {
        // Nachricht an Server senden
        ws.current?.send(
            JSON.stringify({ func: "get_messages", room_id: roomID }),
        );
    }

    function getRooms() {
        // Nachricht an Server senden
        ws.current?.send(JSON.stringify({ func: "get_rooms" }));
    }

    function enterRoom(roomName: string) {
        const match = rooms.find((r) => r.name === roomName);
        if (!match) {
            pushMessage(
                `Raum '${roomName}' nicht gefunden.`,
                "ERROR",
                "System",
            );
            return;
        }
        setRoom([match.id, match.name]);
        pushMessage(`Zu Raum '${roomName}' gewechselt.`, "INFO", "System");

        // Trete dem Raum auf dem Server bei
        ws.current?.send(
            JSON.stringify({ func: "join_room", room_id: match.id })
        );

        // Hole Nachrichten für diesen Raum
        ws.current?.send(
            JSON.stringify({ func: "get_messages", room_id: match.id })
        );
    }

    /**
     * Prüft ob ein Raum mit dem gegebenen Namen existiert
     */
    function roomExists(roomName: string): boolean {
        return rooms.some((r) => r.name === roomName);
    }

    /**
     * Sucht einen Raum nach Namen und gibt ihn zurück (oder undefined)
     */
    function getRoomByName(roomName: string): { id: number; name: string } | undefined {
        return rooms.find((r) => r.name === roomName);
    }

    /**
     * Gibt alle Raumnamen als Array zurück
     */
    function getAllRoomNames(): string[] {
        return rooms.map((r) => r.name);
    }

    function addUserToKnownList(id: number, name: string) {
        setUsers((prev) => {
            return [...prev, { id, name }];
        });
    }

    // Auto-Hide für Error-Popover nach 20 Sekunden
    useEffect(() => {
        if (!popoverText) return;

        const timer = setTimeout(() => {
            setPopoverText("");
        }, 20000);

        return () => clearTimeout(timer);
    }, [popoverText]);

    function pushMessage(text: string, kind: string, sender: string, timestamp?: Date, id?: number) {
        if (kind === "CLEAR_ALL") {
            //falls kind: clear alle nachichten löschen (nur lokal)
            setMessages([]);
            return;
        }

        if (kind === "CLEAR") {
            //falls kind: clear alle nachichten löschen, die nicht IN sind (nur lokal)
            setMessages((m) => {
                let updated = [...m];
                updated = updated.filter((msg) => msg.kind === "IN" );
                return [...updated];
            });
            return;
        }

        //Neue Nachricht anhängen, aber vorher aufräumen
        setMessages((m) => {
            let updated = [...m];

            // Wenn kind der aktuellen Nachricht INFO oder IN ist, lösche alle COMMAND, ERROR und TEMPINFO
            if (kind === "INFO" || kind === "IN") {
                updated = updated.filter(
                    (msg) =>
                        msg.kind !== "COMMAND" &&
                        msg.kind !== "ERROR" &&
                        msg.kind !== "TEMPINFO",
                );
            }

            return [
                ...updated,
                {
                    id: id ?? idRef.current++,
                    text,
                    kind,                                                           //whack shit: manchmal ist user hier guest, obwohl whoami den richtigen namen zurückgibt
                    sender: sender ?? (kind !== "IN" && kind !== "OUT" ? "System" : user),
                    timestamp: new Date(),
                    readBy: kind === "OUT" ? 0 : undefined, // Nur für gesendete Nachrichten
                },
            ];
        });
    }

    function showPopover(text: string) {
        setPopoverText(text);
    }

    /**
     * Zeigt eine System-Benachrichtigung an
     */
    function showSystemNotification(text: string) {
        setSystemNotification(text);
    }

    /**
     * Verarbeitet eine eingegebene Kommandozeile
     * - Parst die Eingabe
     * - Sucht den passenden Befehl
     * - Führt ihn aus
     * - Zeigt Fehler im Popover an
     */
    async function handleCommandLine(line: string) {
        // Leere Zeilen ignorieren
        if (!line.trim()) return;

        // Befehl zur Historie hinzufügen (wenn nicht identisch mit letztem)
        const lastCommand = commandHistory[commandHistory.length - 1];
        if (line !== lastCommand) {
            setCommandHistory((prev) => [...prev, line]);
        }

        setHistoryIndex(-1);

        pushMessage(`> ${line}`, "COMMAND", "System");

        try {
            // Kommando parsen
            const { cmd, args } = parseCommand(line);

            let handler: CmdHandler | undefined;
            let finalArgs = args;

            // Zuerst prüfen ob es einen Subcommand gibt (z.B. "theme save")
            if (args.length > 0) {
                const subCmd = `${cmd} ${args[0]}`;
                if (COMMANDS[subCmd]) {
                    handler = COMMANDS[subCmd];
                    finalArgs = args.slice(1); // Subcommand aus args entfernen
                }
            }

            // Fallback: normaler Befehl
            if (!handler) {
                handler = COMMANDS[cmd];
            }

            if (!handler) throw new Error("Unbekannter Befehl: " + cmd);

            // Handler ausführen mit Kontext
            await handler(finalArgs, {
                user,
                setUser,
                pushMessage,
                sendMessage,
                createUser,
                createRoom,
                changeUser,
                enterRoom,
                getRooms,
                getHistory,
                roomExists,
                getRoomByName,
                getAllRoomNames,
                showSystemNotification,
                themeColors,
                setThemeColors,
                deleteMsg,
            });
        } catch (err: any) {
            // Fehler im Popover anzeigen
            //showPopover(err?.message ?? String(err));
            pushMessage(err?.message ?? String(err), "ERROR", "System");
        }
    }

    /**
     * Keyboard-Event Handler für das Input-Feld
     * - Enter: Befehl ausführen
     * - Tab: Auto-Vervollständigung
     */
    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            // Bei Enter: Befehl ausführen und Input leeren
            handleCommandLine(input);
            setInput("");
            e.preventDefault();
        } else if (e.key === "Tab") {
            // Bei Tab: Befehl vervollständigen
            e.preventDefault();

            // Erstes Wort (vor Leerzeichen) extrahieren
            const cur = input.split(/\s+/)[0];

            // Ersten passenden Befehl finden
            const match = commands.find((c) => c.startsWith(cur));

            // Wenn gefunden: ersten Teil ersetzen
            if (match) setInput((s) => s.replace(/^[^\s]*/, match));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (commandHistory.length === 0) return;

            const newIndex =
                historyIndex === -1
                    ? commandHistory.length - 1
                    : Math.max(0, historyIndex - 1);

            setHistoryIndex(newIndex);
            setInputValue(commandHistory[newIndex]);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (historyIndex === -1) return;

            const newIndex = historyIndex + 1;

            if (newIndex >= commandHistory.length) {
                setHistoryIndex(-1);
                setInputValue("");
            } else {
                setHistoryIndex(newIndex);
                setInputValue(commandHistory[newIndex]);
            }
        }
    }

    /**
     * Dummy-Handler für KeyUp (für Kompatibilität)
     */
    function handleKeyUp(e: React.KeyboardEvent<HTMLInputElement>) {
        // KA wenn wer braucht ist da
    }

    /**
     * Sendet eine Nachricht (alternativer Handler für Button-Click)
     */
    function handleSendMessage() {
        if (input.trim()) {
            handleCommandLine(input);
            setInput("");
        }
    }

    // === RENDER ===
    return (
        <main
            className="flex justify-center h-screen w-full overflow-hidden"
            style={{ backgroundColor: themeColors.outerBgColor }}
        >
            {/* Container: Flex-Column, damit Input unten bleibt */}
            <div
                className="w-full max-w-[80vw] h-full shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8),0_10px_30px_-10px_rgba(0,0,0,0.6)] flex flex-col"
                style={{ backgroundColor: bgColor }}
            >
                {/* Header mit Kontaktname */}
                <header
                    className="p-4 border-b shrink-0"
                    style={{
                        borderColor: themeColors.borderColor,
                        backgroundColor: bgColor,
                    }}
                >
                    <div className="flex justify-center items-center relative">
                        <div>
                            <h1
                                className="text-lg font-semibold"
                                style={{ color: textColor }}
                            >
                                {roomLabel}
                            </h1>
                        </div>
                        {/*TODO: Buttonicon zum tatsächlichen Shello-Logo ändern*/}
                        <button
                            onClick={() =>
                                setSystemNotification(
                                    systemNotification
                                        ? ""
                                        : helpText,
                                )
                            }
                            className="absolute right-0 px-2 py-1 rounded cursor-pointer transition-opacity hover:opacity-70"
                            style={{ color: textColor }}
                            aria-label="Toggle System-Benachrichtigung"
                        >
                            <Character emotion={currentEmotion} />
                        </button>
                    </div>
                </header>

                {/* System-Benachrichtigung mit Sprechblase */}
                <div
                    style={{
                        position: "fixed",
                        top: 70,
                        left: 0,
                        right: 190,
                        zIndex: 9999,
                        pointerEvents: "none",
                    }}
                >
                    <div
                        style={{
                            pointerEvents: systemNotification ? "auto" : "none",
                        }}
                    >
                        <Popover
                            text={systemNotification}
                            variant="system"
                            onClose={() => setSystemNotification("")}
                            themeColors={{
                                bgColor: themeColors.bgColor,
                                textColor: themeColors.textColor,
                                borderColor: themeColors.borderColor,
                            }}
                        />
                    </div>
                </div>

                {/* Nachrichten-Bereich: Terminal Style */}
                <div
                    ref={scrollContainerRef}
                    className="flex-1 overflow-y-auto p-6 font-mono text-sm"
                    onScroll={handleScroll}
                    style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: `${themeColors.textColor} ${themeColors.bgColor}`,
                    }}
                >
                    <style>{`
                        .flex-1.overflow-y-auto::-webkit-scrollbar {
                            width: 12px;
                        }
                        .flex-1.overflow-y-auto::-webkit-scrollbar-track {
                            background: ${themeColors.bgColor};
                            border-left: 1px solid ${themeColors.borderColor};
                        }
                        .flex-1.overflow-y-auto::-webkit-scrollbar-thumb {
                            background: ${themeColors.textColor};
                            border-radius: 6px;
                            border: 2px solid ${themeColors.bgColor};
                        }
                        .flex-1.overflow-y-auto::-webkit-scrollbar-thumb:hover {
                            background: ${themeColors.buttonHoverBgColor};
                        }
                    `}</style>
                    {(() => {
                        // Gruppiere Nachrichten nach Datum
                        const groupedMessages: { date: string; messages: typeof messages }[] = [];
                        let currentDate = "";
                        let currentGroup: typeof messages = [];

                        messages.forEach((msg) => {
                            const msgDate = msg.timestamp
                                ? msg.timestamp.toLocaleDateString("de-DE", {
                                      year: "numeric",
                                      month: "long",
                                      day: "numeric",
                                  })
                                : "Unbekanntes Datum";

                            if (msgDate !== currentDate) {
                                if (currentGroup.length > 0) {
                                    groupedMessages.push({ date: currentDate, messages: currentGroup });
                                }
                                currentDate = msgDate;
                                currentGroup = [msg];
                            } else {
                                currentGroup.push(msg);
                            }
                        });

                        // Letzte Gruppe hinzufügen
                        if (currentGroup.length > 0) {
                            groupedMessages.push({ date: currentDate, messages: currentGroup });
                        }

                        return groupedMessages.map((group, groupIndex) => (
                            <div key={groupIndex}>
                                {/* Datumstrennzeile */}
                                <div className="flex items-center justify-center my-4">
                                    <div
                                        className="px-3 py-1 rounded text-xs font-semibold"
                                        style={{
                                            backgroundColor: themeColors.bgColor,
                                            color: themeColors.textColor,
                                            opacity: 0.7,
                                        }}
                                    >
                                        {group.date}
                                    </div>
                                </div>

                                {/* Nachrichten dieser Gruppe */}
                                {group.messages.map((msg, i) => (
                                    <div
                                        key={i}
                                        className={`mb-2 flex ${msg.sender === username || msg.sender === "System" ? "justify-start" : "justify-end"}`}
                                    >
                                        <div
                                            className="max-w-[70%] break-words hyphens-auto"
                                            style={{ color: msg.sender === "System" ? systemTextColor : textColor }}
                                        >
                                            {msg.sender === username ? (
                                                <>
                                                    <span
                                                        className="opacity-60 text-xs"
                                                        style={{ color: textColor }}
                                                    >
                                                        [
                                                        {msg.timestamp
                                                            ? msg.timestamp.toLocaleTimeString()
                                                            : ""}
                                                        ]{" "}
                                                    </span>
                                                    <span
                                                        className="font-bold"
                                                        style={{ color: textColor }}
                                                    >
                                                        {msg.sender}
                                                        <br />
                                                    </span>
                                                </>
                                            ) : msg.sender !== "System" ? (
                                                <div className="flex justify-end gap-1">
                                                    <span
                                                        className="font-bold"
                                                        style={{ color: textColor }}
                                                    >
                                                        {msg.sender}{" "}
                                                    </span>
                                                    <span
                                                        className="opacity-60 text-xs"
                                                        style={{ color: textColor }}
                                                    >
                                                        [
                                                        {msg.timestamp
                                                            ? msg.timestamp.toLocaleTimeString()
                                                            : ""}
                                                        ]
                                                    </span>
                                                </div>
                                            ) : (
                                                <></>
                                            )}
                                            <span
                                                className="break-words hyphens-auto whitespace-pre-wrap"
                                                style={{
                                                    color:
                                                        msg.sender === "System"
                                                            ? systemTextColor
                                                            : textColor,
                                                }}
                                            >
                                                {msg.text}
                                            </span>

                                            {/* Lesebestätigung - nur für eigene Nachrichten (OUT oder wenn sender === username) */}
                                            {msg.sender === username && msg.kind !== "COMMAND" && msg.kind !== "ERROR" && msg.kind !== "INFO" && msg.kind !== "TEMPINFO" && msg.readBy !== undefined && (
                                                <div className="flex items-center gap-1 mt-1 opacity-60">
                                                    <span style={{ color: textColor, fontSize: "0.7rem" }}>
                                                        ✓
                                                    </span>
                                                    <span style={{ color: textColor, fontSize: "0.65rem" }}>
                                                        {msg.readBy}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ));
                    })()}
                </div>

                {/* Error-Popover über Eingabe */}
                <Popover
                    text={popoverText}
                    onClose={() => setPopoverText("")}
                    variant="error"
                    themeColors={{
                        bgColor: themeColors.bgColor,
                        textColor: themeColors.textColor,
                        borderColor: themeColors.borderColor,
                    }}
                />

                {/* Eingabe-Bereich: Terminal Style */}
                <div
                    className="p-4 border-t shrink-0"
                    style={{
                        backgroundColor: bgColor,
                        borderColor: themeColors.borderColor,
                    }}
                >
                    <div className="flex gap-2 items-center font-mono">
                        <span style={{ color: textColor }}>&gt;</span>
                        <input
                            type="text"
                            className="flex-1 p-2 bg-transparent border-none focus:outline-none"
                            style={{ color: textColor }}
                            placeholder="Nachricht eingeben..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={onKeyDown}
                            onKeyUp={handleKeyUp}
                        />
                        <button
                            onClick={handleSendMessage}
                            className="px-4 py-2 rounded font-sans text-sm transition-colors"
                            style={{
                                backgroundColor: textColor,
                                color: bgColor,
                            }}
                            onMouseEnter={(e) =>
                                (e.currentTarget.style.backgroundColor =
                                    buttonHoverBgColor)
                            }
                            onMouseLeave={(e) =>
                                (e.currentTarget.style.backgroundColor =
                                    textColor)
                            }
                        >
                            ↵
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
}
