import React from "react";
import type { VerticalOffset } from "./types";

interface CharacterCharProps {
    char: string;
    y?: VerticalOffset;
    style?: React.CSSProperties;
    className?: string;
}

const offsetToEm = (y: VerticalOffset | undefined) => {
    if (y === 1) return "-0.35em";
    if (y === -1) return "0.35em";
    return "0em";
};

export default function CharacterChar({
    char,
    y = 0,
    style,
    className,
}: CharacterCharProps) {
    const transform = `translateY(${offsetToEm(y)})`;
    const defaultStyle: React.CSSProperties = {
        display: "inline-block",
        fontFamily: "monospace, monospace",
        lineHeight: 1,
        transform,
        transition: "transform 160ms ease",
        whiteSpace: "pre",
    };

    return (
        <span
            aria-hidden
            className={className}
            style={{ ...defaultStyle, ...style }}
        >
            {char}
        </span>
    );
}
