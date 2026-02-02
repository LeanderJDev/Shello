import React from "react";

/**
 * Props für die Input-Komponente
 */
type InputProps = {
    inputRef: React.RefObject<HTMLInputElement | null>; // Referenz für Focus-Management
    input: string;                                       // Aktueller Input-Wert
    setInput: (value: string) => void;                  // Callback zum Aktualisieren des Inputs
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void; // Keyboard-Event Handler
};

/**
 * Wiederverwendbare Input-Komponente für das Terminal
 * Styled im Terminal-Look (monospace, dunkel)
 */
export default function Input({
    inputRef,
    input,
    setInput,
    onKeyDown,
}: InputProps): React.JSX.Element {
    return (
        <input
            ref={inputRef}  // Ref für programmatisches Fokussieren
            className="w-full bg-gray-800 text-white p-2 font-mono rounded outline-none"
            value={input}   // Controlled Component: Wert kommt von außen
            onChange={(e) => setInput(e.target.value)} // Bei Änderung: Parent informieren
            onKeyDown={onKeyDown} // Keyboard-Events (Enter, Tab) an Parent weiterreichen
            aria-label="Terminal input" // Accessibility
            autoComplete="off"  // Keine Browser-Autovervollständigung
            spellCheck={false}  // Keine Rechtschreibprüfung (für Commands unpassend)
        />
    );
}
