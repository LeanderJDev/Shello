import React from "react";
import CharacterChar from "./CharacterChar";
import type { FaceConfig, EmotionKey } from "./types";
import { EMOTIONS, DEFAULT_FACE } from "./types";

export interface FaceProps {
    emotion?: EmotionKey;
    config?: Partial<FaceConfig>;
    size?: number; // font-size in px
    className?: string;
}

function mergeConfig(
    base: FaceConfig,
    partial?: Partial<FaceConfig>
): FaceConfig {
    if (!partial) return base;
    return {
        leftArm: { ...base.leftArm, ...(partial.leftArm || {}) },
        rightArm: { ...base.rightArm, ...(partial.rightArm || {}) },
        leftEye: partial.leftEye ?? base.leftEye,
        rightEye: partial.rightEye ?? base.rightEye,
        mouth: partial.mouth ?? base.mouth,
    };
}

export default function Character({
    emotion,
    config,
    size = 20,
    className,
}: FaceProps) {
    const base = emotion ? EMOTIONS[emotion] : DEFAULT_FACE;
    const cfg = mergeConfig(base, config);

    const containerStyle: React.CSSProperties = {
        display: "inline-flex",
        alignItems: "center",
        fontSize: `${size}px`,
        fontFamily: "monospace, monospace",
        gap: "0",
        letterSpacing: "-0.16em",
    };

    const spacerStyle: React.CSSProperties = {
        display: "inline-block",
        width: "0.25em",
    };

    return (
        <span
            className={className}
            style={containerStyle}
            aria-label={`Shello face: ${emotion ?? "custom"}`}
        >
            <CharacterChar char={cfg.leftArm.char} y={cfg.leftArm.y} />
            <span>[</span>
            <CharacterChar char={cfg.leftEye} />
            <CharacterChar char={cfg.mouth} />
            <CharacterChar char={cfg.rightEye} />
            <span>]</span>
            <CharacterChar char={cfg.rightArm.char} y={cfg.rightArm.y} />
        </span>
    );
}
