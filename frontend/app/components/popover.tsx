import React, { useState, useEffect } from "react";

/**
 * Props für die Popover-Komponente
 */
type PopoverProps = {
    text: string;           // Anzuzeigender Text (leer = Popover wird nicht gerendert)
    className?: string;     // Zusätzliche CSS-Klassen für Positionierung
    onClose?: () => void;   // Callback wenn Popover geschlossen wird
    variant?: "error" | "system";  // Variante: error (default) oder system (mit Sprechblase)
    themeColors?: {         // Theme-Farben (für system-Variante)
        bgColor: string;
        textColor: string;
        borderColor: string;
    };
};

/**
 * Popover-Komponente für Fehler- und Info-Meldungen
 * Info wird als Sprechblase oben rechts angezeigt
 * Error wird über dem Terminal-Input angezeigt mit Schließen-Button
 */
export default function Popover({ text, className, onClose, variant = "error", themeColors }: PopoverProps) {
    const [opacity, setOpacity] = useState(1);
    const [isVisible, setIsVisible] = useState(true);
    
    // Fade-Effekt für System-Nachricht nach 10 Sekunden
    useEffect(() => {
        if (variant === "system" && text !== "") {
            // Reset bei neuem Text
            setOpacity(1);
            setIsVisible(true);
            
            const fadeTimer = setTimeout(() => {
                setOpacity(0);
            }, 10000);
            
            // Nach dem Fade komplett ausblenden und onClose aufrufen
            const hideTimer = setTimeout(() => {
                setIsVisible(false);
                if (onClose) {
                    onClose();
                }
            }, 11000);
            
            return () => {
                clearTimeout(fadeTimer);
                clearTimeout(hideTimer);
            };
        }
    }, [text, variant, onClose]);
    
    // Wenn kein Text oder nicht sichtbar: nichts rendern
    if (text === "" || !isVisible) return null;
    
    // System-Variante mit Sprechblase
    if (variant === "system" && themeColors) {
        return (
            <div className="mx-3 mb-6 flex justify-end">
                <div 
                    className="relative max-w-[80%] p-3 rounded-lg border text-sm font-mono"
                    style={{ 
                        backgroundColor: themeColors.bgColor, 
                        borderColor: themeColors.borderColor,
                        color: themeColors.textColor,
                        opacity: opacity,
                        transition: 'opacity 1s ease-in-out'
                    }}
                >
                    {/* Dreieck oben rechts (Border) */}
                    <div 
                        className="absolute -top-2 right-4 w-0 h-0"
                        style={{
                            borderLeft: '8px solid transparent',
                            borderRight: '8px solid transparent',
                            borderBottom: `8px solid ${themeColors.borderColor}`,
                        }}
                    />
                    
                    {/* Dreieck-Füllung (1px tiefer) */}
                    <div 
                        className="absolute -top-[7px] right-4 w-0 h-0"
                        style={{
                            borderLeft: '7px solid transparent',
                            borderRight: '7px solid transparent',
                            borderBottom: `7px solid ${themeColors.bgColor}`,
                        }}
                    />
                    
                    {/* Inhalt */}
                    <div className="flex items-start gap-2">
                        <span className="whitespace-pre-wrap flex-1">{text}</span>
                    </div>
                </div>
            </div>
        );
    }
    
    // Standard Error-Variante (mit Theme-Support)
    return (
        <div
            className={
                // Basis-Styling + optionale zusätzliche Klassen
                "flex flex-row text-sm p-2 rounded-t w-full border-t border-x font-mono " +
                className
            }
            style={{
                backgroundColor: themeColors?.bgColor || "#1f2937",
                borderColor: themeColors?.borderColor || "#374151",
                color: themeColors?.textColor || "#ffffff"
            }}
        >
            {/* Text-Bereich (nimmt meisten Platz ein) */}
            <div className="flex-2">{text}</div>
            
            {/* Schließen-Button */}
            <button
                onClick={onClose}
                aria-label="Close popover"
                className="opacity-60 hover:opacity-100 transition-opacity"
                style={{ color: themeColors?.textColor || "#9ca3af" }}
                type="button"
            >
                {/* X-Icon als SVG (zwei sich kreuzende Linien) */}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="inline"
                >
                    {/* Linie von rechts-oben nach links-unten */}
                    <line x1="18" y1="6" x2="6" y2="18" />
                    {/* Linie von links-oben nach rechts-unten */}
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
    );
}
