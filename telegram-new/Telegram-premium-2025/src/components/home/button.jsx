import React from 'react';
import { cn } from '../../helper/Cn';

function ButtonComponent(props) {
    const { children, className, onClick, disabled } = props;

    return (
        <button
            type="button"
            className={cn(className, "text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm px-4 py-2 text-center bg-blue-600 hover:bg-blue-700 focus:ring-blue-800")}
            onClick={onClick}
            disabled={disabled}
        >
            {children}
        </button>
    );
}

export default ButtonComponent;

