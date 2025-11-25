import React from "react";

type InputProps = {
    inputRef: React.RefObject<HTMLInputElement | null>;
    input: string;
    setInput: (value: string) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

export default function Input({
    inputRef,
    input,
    setInput,
    onKeyDown,
}: InputProps): React.JSX.Element {
    return (
        <input
            ref={inputRef}
            className="w-full bg-gray-800 text-white p-2 font-mono rounded outline-none"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Terminal input"
            autoComplete="off"
            spellCheck={false}
        />
    );
}
