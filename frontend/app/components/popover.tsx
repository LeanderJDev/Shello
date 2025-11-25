import React from "react";

type PopoverProps = {
    text: string;
    className?: string;
    onClose?: () => void;
};

export default function Popover({ text, className, onClose }: PopoverProps) {
    if (text === "") return null;
    return (
        <div
            className={
                "flex flex-row bg-gray-800 text-sm p-2 rounded-t w-full " +
                className
            }
        >
            <div className="flex-2 text-white">{text}</div>
            <button
                onClick={onClose}
                aria-label="Close popover"
                className="text-gray-400 hover:text-white"
                type="button"
            >
                {/* kleines X-Icon (SVG) */}
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
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
    );
}
