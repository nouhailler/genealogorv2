import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  textClassName?: string;
}

export const Logo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  showText = false,
  textClassName = '',
}) => {
  const sizeMap = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
    xl: 'w-14 h-14',
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className={`relative shrink-0 rounded-xl overflow-hidden shadow-xs border border-amber-900/30 dark:border-amber-500/40 ${sizeMap[size]}`}>
        <img
          src="/logo.svg"
          alt="Genealogor Logo"
          className="w-full h-full object-cover"
        />
      </div>
      {showText && (
        <div className="flex flex-col text-left">
          <span className={`font-serif font-bold tracking-tight text-stone-900 dark:text-stone-50 ${textClassName || 'text-xl leading-none'}`}>
            Genealogor
          </span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-800 dark:text-amber-400 font-semibold mt-0.5">
            Arbre & Archives
          </span>
        </div>
      )}
    </div>
  );
};
