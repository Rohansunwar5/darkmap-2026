import { useState, useEffect, useRef } from 'react';

const Dropdown = ({
    items = [],
    value = null,
    getLabel = (item) => item?.label ?? '',
    getKey = (item) => item,
    onChange = () => {},
    placeholder = 'Select an option',
    localStorageKey = null,
    width = 'w-64',
    children = <></>
}) => {
    const [selected, setSelected] = useState(value);
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef();

    useEffect(() => {
        if (localStorageKey) {
            const localValue = localStorage.getItem(localStorageKey);
            const matched = items.find(
                (item) => getKey(item) === localValue
            );
            if (matched) setSelected(matched);
        }
    }, [items, localStorageKey]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (item) => {
        setSelected(item);
        setOpen(false);
        if (localStorageKey) {
            localStorage.setItem(localStorageKey, getKey(item));
        }
        onChange(item);
    };

    return (
        <div className="relative text-sm" ref={dropdownRef}>
            <div onClick={() => setOpen(!open)} className="cursor-pointer rounded-lg text-gray-400 text-xs shadow-sm flex justify-end items-center">
                <span>{selected ? getLabel(selected) : placeholder}</span>
                <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M19 9l-7 7-7-7" />
                </svg>
            </div>

            {open && (
                <div className={`absolute z-10 right-0 rounded-lg border border-red-900 bg-black text-white shadow-lg max-h-60 overflow-auto mt-3 ${width}`}>
                    {items.map((item, idx) => (
                        <div key={idx} onClick={() => handleSelect(item)} className="px-3 py-2 text-sm hover:text-primary-500 cursor-pointer">
                            {getLabel(item)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Dropdown;
