import React from "react";

interface CompanionOrbProps {
  isThinking?: boolean;
  size?: "sm" | "md" | "lg";
}

export const CompanionOrb: React.FC<CompanionOrbProps> = ({ isThinking = false, size = "md" }) => {
  const sizeClasses = {
    sm: "w-5 h-5",
    md: "w-7 h-7",
    lg: "w-10 h-10",
  }[size];

  return (
    <div className="relative flex items-center justify-center">
      <div
        className={`${sizeClasses} rounded-full transition-all duration-300 ${
          isThinking
            ? "dexor-orb-active bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-300"
            : "dexor-orb-idle bg-gradient-to-tr from-[#131b18] via-[#103026] to-[#1f4c3c] border border-emerald-500/40"
        }`}
      >
        <div className="absolute inset-1 rounded-full bg-[#08090c]/40 backdrop-blur-[1px]" />
        <div className="absolute inset-1.5 rounded-full bg-gradient-to-br from-emerald-400/20 to-transparent" />
      </div>
    </div>
  );
};
