import { twMerge } from 'tailwind-merge';

const Button = ({ children, className, variant = 'primary', ...props }) => {
    const baseStyles = "px-4 py-2 rounded font-medium text-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black";

    const variants = {
        primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
        secondary: "bg-gray-700 text-white hover:bg-gray-600 focus:ring-gray-500",
        danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
        ghost: "bg-transparent text-gray-400 hover:text-white hover:bg-gray-800",
    };

    return (
        <button
            className={twMerge(baseStyles, variants[variant], className)}
            {...props}
        >
            {children}
        </button>
    );
};

export default Button;
