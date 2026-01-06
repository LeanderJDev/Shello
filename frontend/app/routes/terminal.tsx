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
        pushMessage: (s: string, kind?: string) => void;
        showSystemNotification: (text: string) => void;
        themeColors?: ThemeColors;
        setThemeColors?: (colors: ThemeColors) => void;
    }
) => void | Promise<void>;

/**
 * Zentrale Befehls-Registry
 * Hier werden alle verfügbaren Terminal-Befehle definiert
 * (Sortiert nach Kategorien wie in help angezeigt)
 */
const COMMANDS: Record<string, CmdHandler> = {
    // === NACHRICHTEN ===
    
    // Sendet eine Nachricht (alle Argumente werden zusammengefügt)
    send: (args, ctx) => {
        if (args.length === 0) throw new Error("send: Nachricht fehlt");
        ctx.pushMessage(args.join(" "));
    },
    
    // Löscht alle Nachrichten aus dem Terminal
    clear: (_args, ctx) => {
        // Spezielle Nachricht als Marker für die Lösch-Funktion
        ctx.pushMessage("__CLEAR__");
    },
    
    // Placeholder für zukünftige History-Funktion
    // TODO: Was genau soll hier rein? (Weil obviously anders als commandhistory right, aber chat history wird doch automatisch geladen, wenn der Chat geöffnet wird)
    history: (_args, ctx) => {
        ctx.showSystemNotification("history not implemented");
    },
    
    // === BENUTZER & CHAT ===
    
    // Zeigt den aktuellen Benutzernamen
    whoami: (_args, ctx) => {
        ctx.showSystemNotification("Aktueller Benutzer: <" + ctx.user + ">");
    },
    
    // Erstellt einen neuen Benutzer (oder wechselt zu einem Namen)
    forge: (args, ctx) => {
        if (!args[0]) throw new Error("forge: Benutzername fehlt");
        ctx.setUser(args[0]); // TODO: Abgleich ob der schon existiert
        ctx.showSystemNotification(`Neuer Nutzer '${args[0]}' erstellt`);
    },
    
    // Wechselt zu einem anderen Benutzer
    impersonate: (args, ctx) => {
        if (!args[0]) throw new Error("impersonate: Benutzername fehlt");
        ctx.setUser(args[0]); // TODO: Abgleich ob der existiert
        ctx.showSystemNotification(`Wechsle zu ${args[0]}`);
    },

    // sc <Benutzer/Gruppe> - Wechsle zu angegebenem Benutzer oder Gruppe.
    // -> permission denied when not member of group
    // -> list available options when Tab is pressed
    // -> switch to own chat when no argument is given
    sc: (args, ctx) => {
        // TODO: Implementieren
        ctx.showSystemNotification("sc command not implemented yet");
    },

    // lc - Liste alle verfügbaren Benutzer und Gruppen auf.
    lc: (_args, ctx) => {
        //TODO: Implementieren
        ctx.showSystemNotification("lc command not implemented yet");
    },
    
    // === GRUPPEN ===
    
    // accede <Gruppe> - Trete der angegebenen Gruppe bei.
    accede: (args, ctx) => {
        //TODO: Implementieren
        ctx.showSystemNotification("accede command not implemented yet");
    },

    // secede <Gruppe> - Verlasse die angegebene Gruppe.
    secede: (args, ctx) => {
        //TODO: Implementieren
        ctx.showSystemNotification("secede command not implemented yet");
    },
    
    // === PERSONALISIERUNG ===
    
    // theme - Passe die Farben und Schriftarten des Terminals an.
    // Optionen:
    //   -tc <Farbe>  - Textfarbe (text color)
    //   -bg <Farbe>  - Hintergrundfarbe (background)
    //   -bc <Farbe>  - Randfarbe (border color)
    //   -ob <Farbe>  - Äußere Hintergrundfarbe (outer background)
    //   -hv <Farbe>  - Button Hover Farbe
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
            } else if (args[i] === "-f" && i + 1 < args.length) {
                font = args[i + 1];
                i++;
            }
        }
        
        if (!textColor && !bgColor && !borderColor && !outerBgColor && !hoverColor && !font) {
            ctx.showSystemNotification("Verwendung: theme [Optionen]\n" +
                "Optionen:\n" +
                "  -tc <Farbe>  Textfarbe\n" +
                "  -bg <Farbe>  Hintergrundfarbe\n" +
                "  -bc <Farbe>  Randfarbe\n" +
                "  -ob <Farbe>  Äußere Hintergrundfarbe\n" +
                "  -hv <Farbe>  Button Hover Farbe\n" +
                "  -f <Schrift> Schriftart (noch nicht implementiert)\n\n" +
                "Beispiel: theme -tc #00ff00 -bg #000000");
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
        
        if (font) {
            // Schriftart wird hier nicht direkt im Theme gespeichert
            // TODO: Schriftart-Verwaltung implementieren
            changes.push(`Schriftart ${font} (noch nicht unterstützt)`);
        }
        
        ctx.setThemeColors(newTheme);
        ctx.showSystemNotification("Theme angepasst:\n  " + changes.join("\n  "));
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
            const savedThemes = JSON.parse(localStorage.getItem("savedThemes") || "{}");
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
                const savedThemes = JSON.parse(localStorage.getItem("savedThemes") || "{}");
                const themeNames = Object.keys(savedThemes);
                
                if (themeNames.length === 0) {
                    ctx.showSystemNotification("Keine gespeicherten Themes vorhanden");
                } else {
                    ctx.showSystemNotification("Gespeicherte Themes:\n  " + themeNames.join("\n  "));
                }
            } catch (err) {
                ctx.showSystemNotification("Fehler beim Laden der Theme-Liste");
            }
            return;
        }
        
        const themeName = args[0];
        
        // Theme aus localStorage laden
        try {
            const savedThemes = JSON.parse(localStorage.getItem("savedThemes") || "{}");
            
            if (!savedThemes[themeName]) {
                ctx.showSystemNotification(`Theme '${themeName}' nicht gefunden`);
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
        ctx.showSystemNotification(
            "Verfügbare Befehle:\n\n" +
            "=== Nachrichten ===\n" +
            "  send <Nachricht>     - Sendet eine Nachricht\n" +
            "  clear                - Löscht alle Nachrichten aus dem Terminal\n" +
            "  history              - Zeigt Befehlshistorie (noch nicht implementiert)\n\n" +
            "=== Benutzer & Chat ===\n" +
            "  whoami               - Zeigt aktuellen Benutzer\n" +
            "  forge <Name>         - Erstellt neuen Benutzer\n" +
            "  impersonate <Name>   - Wechselt zu anderem Benutzer\n" +
            "  sc [Benutzer/Gruppe] - Wechselt Chat (noch nicht implementiert)\n" +
            "  lc                   - Liste alle Benutzer/Gruppen (noch nicht implementiert)\n\n" +
            "=== Gruppen ===\n" +
            "  accede <Gruppe>      - Trete Gruppe bei (noch nicht implementiert)\n" +
            "  secede <Gruppe>      - Verlasse Gruppe (noch nicht implementiert)\n\n" +
            "=== Personalisierung ===\n" +
            "  theme [Optionen]     - Passe Farben und Schrift an\n" +
            "    -tc <Farbe>        - Textfarbe\n" +
            "    -bg <Farbe>        - Hintergrundfarbe\n" +
            "    -bc <Farbe>        - Randfarbe\n" +
            "    -ob <Farbe>        - Äußere Hintergrundfarbe\n" +
            "    -hv <Farbe>        - Button Hover Farbe\n" +
            "    -f <Schrift>       - Schriftart (noch nicht implementiert)\n" +
            "  theme save <Name>    - Speichere aktuelles Theme\n" +
            "  theme load [Name]    - Lade gespeichertes Theme (ohne Name: Liste)\n\n" +
            "=== System ===\n" +
            "  help                 - Diese Hilfe\n" +
            "  exit                 - Beende Terminal-Sitzung (noch nicht implementiert)"
        );
    },
    
    // exit - Beende die Terminal-Sitzung.
    exit: (_args, ctx) => {
        // TODO: Implementieren
        ctx.showSystemNotification("exit command not implemented yet");
    }
};

/**
 * Theme-Definition für das Terminal
 */
interface ThemeColors {
    outerBgColor: string;
    bgColor: string;
    textColor: string;
    borderColor: string;
    buttonHoverBgColor: string;
}

// Standard-Theme (Dunkles Terminal-Design)
const defaultTheme: ThemeColors = {
    outerBgColor: "#1a1a1a",
    bgColor: "#000000",
    textColor: "#00ff00",
    borderColor: "#333333",
    buttonHoverBgColor: "#00cc00"
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
        { id: number; text: string; kind?: string; sender: string; timestamp?: Date }[]
    >([]);
    
    // Aktueller Benutzername (wird im Prompt angezeigt)
    const [user, setUser] = useState("guest");
    
    // Text für Fehler-Popover (leer = Popover ist versteckt)
    const [popoverText, setPopoverText] = useState(
        "Benutzen Sie 'help' für Hilfe."
    );
    
    // Theme-Farben
    const [themeColors, setThemeColors] = useState<ThemeColors>(defaultTheme);
    
    // System-Benachrichtigung
    const [systemNotification, setSystemNotification] = useState("");
    
    // Letzte System-Benachrichtigung (für Toggle-Funktion)
    const [lastSystemNotification, setLastSystemNotification] = useState("");
    
    // Counter für eindeutige Message-IDs
    const idRef = useRef(1);
    
    // Referenz zum Input-Element (für Focus-Management)
    const inputRef = useRef<HTMLInputElement | null>(null);
    
    // Referenz zum Messages-Container (für Auto-Scroll)
    const messagesRef = useRef<HTMLDivElement | null>(null);

    // Liste aller verfügbaren Befehle (für Tab-Completion)
    const commands = Object.keys(COMMANDS);

    // Befehlshistorie
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Abgeleitete Variablen für Kompatibilität
    const username = user;
    const otheruser = "Terminal Chat";
    const inputValue = input;
    const setInputValue = setInput;
    const bgColor = themeColors.bgColor;
    const textColor = themeColors.textColor;
    const buttonHoverBgColor = themeColors.buttonHoverBgColor;

    // Beim ersten Laden: Input-Feld fokussieren
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Automatisch nach unten scrollen wenn neue Nachrichten hinzukommen
    useEffect(() => {
        const el = messagesRef.current;

        if (!el) return;

        // Sofort ans Ende scrollen (für smooth scrollen: behavior: 'smooth')
        el.parentElement?.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    }, [messages]);

    // Auto-Hide für Error-Popover nach 20 Sekunden
    useEffect(() => {
        if (!popoverText) return;
        
        const timer = setTimeout(() => {
            setPopoverText("");
        }, 20000);
        
        return () => clearTimeout(timer);
    }, [popoverText]);

    /**
     * Fügt eine neue Nachricht zur Ausgabe hinzu
     * @param text - Nachrichtentext
     * @param kind - Typ: "out" (normal), "error" (rot), "info" (gelb)
     */
    function pushMessage(text: string, kind: string = "out") {
        // Spezialbehandlung für clear-Befehl
        if (text === "__CLEAR__") {
            setMessages([]);
            return;
        }
        // Neue Nachricht mit eindeutiger ID hinzufügen
        setMessages((m) => [...m, { 
            id: idRef.current++, 
            text, 
            kind,
            sender: kind === "info" ? "System" : user,
            timestamp: new Date()
        }]);

        // Command zur History hinzufügen
        setCommandHistory(prev => [...prev, inputValue]);
        setHistoryIndex(-1);

    }

    /**
     * Zeigt das Fehler-Popover mit gegebenem Text an
     */
    function showPopover(text: string) {
        setPopoverText(text);
    }
    
    /**
     * Zeigt eine System-Benachrichtigung an
     */
    function showSystemNotification(text: string) {
        setSystemNotification(text);
        setLastSystemNotification(text);
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
        
        // Eingabe als Info-Nachricht anzeigen
        pushMessage(`> ${line}`, "info");

        try {
            // Kommando parsen
            const { cmd, args } = parseCommand(line);
            
            // Handler suchen
            const handler = COMMANDS[cmd];
            if (!handler) throw new Error("Unbekannter Befehl: " + cmd);
            
            // Handler ausführen mit Kontext
            await handler(args, { 
                user, 
                setUser, 
                pushMessage,
                showSystemNotification,
                themeColors,
                setThemeColors
            });
        } catch (err: any) {
            // Fehler im Popover anzeigen
            showPopover(err?.message ?? String(err));
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
        }else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (commandHistory.length === 0) return;
        
            const newIndex = historyIndex === -1 
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
    };
    
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
    <main className="flex justify-center h-screen w-full overflow-hidden" style={{ backgroundColor: themeColors.outerBgColor }}>
      
      {/* Container: Flex-Column, damit Input unten bleibt */}
      <div className="w-full max-w-[80vw] h-full shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8),0_10px_30px_-10px_rgba(0,0,0,0.6)] flex flex-col" style={{ backgroundColor: bgColor }}>
        
        {/* Header mit Kontaktname */}
        <header className="p-4 border-b shrink-0" style={{ borderColor: themeColors.borderColor, backgroundColor: bgColor }}>
          <div className="flex justify-center items-center relative">
            <div>
              <h1 className="text-lg font-semibold" style={{ color: textColor }}>
                {otheruser}
              </h1>
            </div>
            {/*TODO: Buttonicon zum tatsächlichen Shello-Logo ändern*/}
            <button
              onClick={() => setSystemNotification(systemNotification ? "" : lastSystemNotification)}
              className="absolute right-0 px-2 py-1 rounded border cursor-pointer transition-opacity hover:opacity-70"
              style={{ color: textColor, borderColor: textColor }}
              aria-label="Toggle System-Benachrichtigung"
            >
              ^_^
            </button>
          </div>
        </header>

        {/* System-Benachrichtigung mit Sprechblase */}
        <Popover 
          text={systemNotification}
          variant="system"
          onClose={() => setSystemNotification("")}
          themeColors={{
            bgColor: themeColors.bgColor,
            textColor: themeColors.textColor,
            borderColor: themeColors.borderColor
          }}
        />

        {/* Nachrichten-Bereich: Terminal Style */}
        <div className="flex-1 overflow-y-auto p-6 font-mono text-sm">
          {messages.filter(msg => msg.sender !== "System").map((msg, i) => (
            <div 
              key={i} 
              className={`mb-2 flex ${msg.sender === username ? 'justify-start' : 'justify-end'}`}
            >
              <div className="max-w-[70%] break-words hyphens-auto" style={{ color: textColor }}>
                {msg.sender === username ? (
                  <>
                    <span className="opacity-60 text-xs" style={{ color: textColor }}>[{msg.timestamp ? msg.timestamp.toLocaleTimeString() : ""}] </span>
                    <span className="font-bold" style={{ color: textColor }}>{msg.sender}<br /></span>
                  </>
                ) : (
                  <div className="flex justify-end gap-1">
                    <span className="font-bold" style={{ color: textColor }}>{msg.sender} </span>
                    <span className="opacity-60 text-xs" style={{ color: textColor }}>
                        [{msg.timestamp ? msg.timestamp.toLocaleTimeString() : ""}]
                    </span>
                  </div>
                )}
                <span className="break-words hyphens-auto whitespace-pre-wrap">{msg.text}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Error-Popover über Eingabe */}
        <Popover
          text={popoverText}
          onClose={() => setPopoverText("")}
          variant="error"
          themeColors={{
            bgColor: themeColors.bgColor,
            textColor: themeColors.textColor,
            borderColor: themeColors.borderColor
          }}
        />

        {/* Eingabe-Bereich: Terminal Style */}
        <div className="p-4 border-t shrink-0" style={{ backgroundColor: bgColor, borderColor: themeColors.borderColor }}>
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
                color: bgColor
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = buttonHoverBgColor}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = textColor}
            >
              ↵
            </button>
          </div>
        </div>

      </div>
    </main>
  );
}
