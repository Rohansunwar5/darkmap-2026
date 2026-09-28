import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

const Card = ({ children, className, title, ...props }) => {
    return (
        <div
            className={twMerge(
                "bg-gray-900 border border-gray-800 rounded-lg p-6 relative overflow-hidden",
                className
            )}
            {...props}
        >
            {title && (
                <div className="mb-4 border-b border-gray-800 pb-2">
                    <h3 className="text-white font-bold text-lg">{title}</h3>
                </div>
            )}
            {children}
        </div>
    );
};


export default Card;
