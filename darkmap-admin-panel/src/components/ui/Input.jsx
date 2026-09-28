import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

const Input = ({ label, className, error, ...props }) => {
    return (
        <div className="flex flex-col gap-1 w-full">
            {label && (
                <label className="text-xs font-mono text-cyber-primary uppercase tracking-wider mb-1">
                    {label}
                </label>
            )}
            <div className="relative group">
                <input
                    className={twMerge(
                        "w-full bg-cyber-black/50 border border-cyber-muted/30 text-cyber-text px-4 py-3 outline-none transition-all duration-300 font-mono text-sm",
                        "focus:border-cyber-primary focus:shadow-neon focus:bg-cyber-dark/80",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        error && "border-cyber-danger focus:border-cyber-danger focus:shadow-danger-glow",
                        className
                    )}
                    {...props}
                />
                <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-cyber-primary transition-all duration-300 group-focus-within:w-full"></div>
            </div>
            {error && (
                <span className="text-xs text-cyber-danger font-mono mt-1 animate-pulse">
                    {`_error: ${error}`}
                </span>
            )}
        </div>
    );
};

export default Input;
