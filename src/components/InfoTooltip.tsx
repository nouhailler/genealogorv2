import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, Info } from 'lucide-react';
import { areContextGuidesEnabled } from './ContextualGuide';

interface InfoTooltipProps {
  content: string;
  title?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  icon?: 'help' | 'info';
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  content,
  title,
  position = 'top',
  className = '',
  icon = 'help',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [guidesEnabled, setGuidesEnabled] = useState(areContextGuidesEnabled());
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleToggle = () => setGuidesEnabled(areContextGuidesEnabled());
    window.addEventListener('genealogor:guides-toggle', handleToggle);
    return () => window.removeEventListener('genealogor:guides-toggle', handleToggle);
  }, []);

  // Close when clicked outside
  useEffect(() => {
    if (!isVisible) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setIsVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible]);

  if (!guidesEnabled) return null;

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div className={`relative inline-flex items-center align-middle ${className}`} ref={tooltipRef}>
      <button
        type="button"
        aria-label={title || content}
        onClick={(e) => {
          e.stopPropagation();
          setIsVisible(!isVisible);
        }}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        className="p-0.5 text-stone-400 hover:text-amber-800 dark:text-stone-500 dark:hover:text-amber-400 rounded-full transition-colors cursor-help focus:outline-none focus:ring-1 focus:ring-amber-500"
      >
        {icon === 'help' ? (
          <HelpCircle className="w-3.5 h-3.5" />
        ) : (
          <Info className="w-3.5 h-3.5" />
        )}
      </button>

      {isVisible && (
        <div
          role="tooltip"
          className={`absolute z-50 w-64 p-2.5 rounded-xl bg-stone-900/95 text-stone-100 dark:bg-[#1E222B] dark:text-stone-200 text-xs shadow-xl border border-stone-700/60 backdrop-blur-xs pointer-events-none animate-in fade-in zoom-in-95 duration-150 leading-relaxed ${positionClasses[position]}`}
        >
          {title && (
            <span className="font-semibold text-amber-300 dark:text-amber-400 block mb-1">
              {title}
            </span>
          )}
          <span className="text-[11px] text-stone-200 dark:text-stone-300">
            {content}
          </span>
        </div>
      )}
    </div>
  );
};
