import { useEffect } from "react";
import { useState } from "react";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";


function SearchScreenNavbar() {
    const navigate = useNavigate();
    const [navTextIndex, setNavTextIndex] = useState(0);
    const text = ['Compromised Assets', 'Open Source Data', 'Intelligence', 'Better', 'Faster', 'Deeper']

    const navbarRef = useRef()

    useEffect(() => {
        const timer = setInterval(() => {
            setNavTextIndex((index) => { if (index + 1 >= text.length) { return 0 } return index + 1 })
        }, 2000);

        return () => clearInterval(timer);
    }, [])

    const toggleMenu = (open) => {
        navbarRef.current.classList.toggle('hidden', !open);
    }


    return (
        <div className='flex justify-between p-4 gap-x-2 z-50 text-white'>
            <div className="pb-2 xl:pb-0 flex flex-col flex-grow">
                <div className="flex">
                    <button className="p-2 flex rounded-lg focus:outline-none xl:hidden hover:bg-gray-700 focus:ring-gray-600 focus:ring-2" onFocus={() => { toggleMenu(true) }} onBlur={() => { toggleMenu(false) }} >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                    </button>
                </div>
                <div className="self-stretch relative">
                    <div className="absolute w-full hidden xl:flex xl:flex-row gap-2 mt-2 xl:mt-0 py-2 xl:static xl:w-auto bg-black xl:bg-transparent rounded-lg shadow-2xl xl:shadow-none shadow-black" ref={navbarRef}>
                        <MockupNavIcon>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="fill-primary-400 size-4 text-darkmap-blue me-2">
                                <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z" />
                                <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z" />
                            </svg>
                            Dashboard
                        </MockupNavIcon>
                       <MockupNavIcon onClick={() => {
                            const isLoggedIn = !!localStorage.getItem('accessToken');
                            if (isLoggedIn) {
                                navigate('/payment');
                            } else {
                                if (window.confirm('You need to login or create an account to view pricing. Would you like to login now?')) {
                                    navigate('/login', { state: { from: 'pricing' } });
                                }
                            }
                        }}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="fill-primary-400 size-4 text-darkmap-blue me-2">
                                <path d="M10.464 8.746c.227-.18.497-.311.786-.394v2.795a2.252 2.252 0 0 1-.786-.393c-.394-.313-.546-.681-.546-1.004 0-.323.152-.691.546-1.004ZM12.75 15.662v-2.824c.347.085.664.228.921.421.427.32.579.686.579.991 0 .305-.152.671-.579.991a2.534 2.534 0 0 1-.921.42Z" />
                                <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v.816a3.836 3.836 0 0 0-1.72.756c-.712.566-1.112 1.35-1.112 2.178 0 .829.4 1.612 1.113 2.178.502.4 1.102.647 1.719.756v2.978a2.536 2.536 0 0 1-.921-.421l-.879-.66a.75.75 0 0 0-.9 1.2l.879.66c.533.4 1.169.645 1.821.75V18a.75.75 0 0 0 1.5 0v-.81a4.124 4.124 0 0 0 1.821-.749c.745-.559 1.179-1.344 1.179-2.191 0-.847-.434-1.632-1.179-2.191a4.122 4.122 0 0 0-1.821-.75V8.354c.29.082.559.213.786.393l.415.33a.75.75 0 0 0 .933-1.175l-.415-.33a3.836 3.836 0 0 0-1.719-.755V6Z" clipRule="evenodd" />
                            </svg>
                            Pricing
                        </MockupNavIcon>
                        <MockupNavIcon>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="fill-primary-400 size-4 text-darkmap-blue me-2">
                                <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 0 1 .75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 0 1 9.75 22.5a.75.75 0 0 1-.75-.75v-4.131A15.838 15.838 0 0 1 6.382 15H2.25a.75.75 0 0 1-.75-.75 6.75 6.75 0 0 1 7.815-6.666ZM15 6.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" clipRule="evenodd" />
                                <path d="M5.26 17.242a.75.75 0 1 0-.897-1.203 5.243 5.243 0 0 0-2.05 5.022.75.75 0 0 0 .625.627 5.243 5.243 0 0 0 5.022-2.051.75.75 0 1 0-1.202-.897 3.744 3.744 0 0 1-3.008 1.51c0-1.23.592-2.323 1.51-3.008Z" />
                            </svg>
                            Support
                        </MockupNavIcon>
                        <MockupNavIcon>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="fill-primary-400 size-5 text-darkmap-blue me-2" x>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Zm3.75 11.625a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                            </svg>
                            Documentation
                        </MockupNavIcon>
                        <MockupNavIcon onClick={()=>{navigate('/group/search')}}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="fill-primary-400 size-5 text-darkmap-blue me-2" x>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Zm3.75 11.625a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                            </svg>
                            Group Analysis
                        </MockupNavIcon>
                        <MockupNavIcon onClick={() => { navigate('/generic/decoy') }}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="fill-primary-400 size-5 text-darkmap-blue me-2">
                                <path d="M34.221 27.538c-9.955-2.248-11.497-3.79-13.745-13.745-.103-.455-.508-.779-.976-.779s-.873.324-.976.779c-2.249 9.955-3.79 11.497-13.745 13.745-.456.104-.78.508-.78.976s.324.872.78.976c9.955 2.249 11.496 3.791 13.745 13.745.103.455.508.779.976.779s.873-.324.976-.779c2.249-9.954 3.79-11.496 13.745-13.745.456-.104.779-.508.779-.976s-.324-.872-.779-.976Z" />
                                <path d="M43.221 12.039c-5.292-1.195-6.035-1.938-7.23-7.229-.104-.456-.508-.779-.976-.779s-.872.323-.976.779c-1.195 5.291-1.938 6.034-7.229 7.229-.456.104-.779.508-.779.976s.323.872.779.976c5.291 1.195 6.034 1.938 7.229 7.23.104.455.508.779.976.779s.872-.324.976-.779c1.195-5.292 1.938-6.035 7.23-7.23.455-.104.779-.508.779-.976s-.324-.872-.779-.976Z" />
                            </svg>
                            Decoy Agent
                        </MockupNavIcon>
                    </div>
                </div>
            </div>

            <div className="text-3xl aldrich-font hidden text-nowrap md:block">Darkmap Index <span className='text-primary-400 font-semibold font-default-sans '>{text[navTextIndex]}</span></div>
        </div>
    )
}

export default SearchScreenNavbar

function MockupNavIcon({ children , onClick}) {
    return (
        <div className='flex items-center xl:justify-center xl:border xl:border-blue-900 xl:bg-black px-5 py-2'
            onClick={onClick}
        >
            {children}
        </div>
    )
}