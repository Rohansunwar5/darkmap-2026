import React, { useState } from 'react';
import { Link } from "react-router-dom";
import apiClient from "../lib/apiClient";
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function PricingScreen() {
    return (
        <div className='font-default-sans flex min-h-screen justify-center items-center pt-20 bg-gradient-to-b from-black to-primary-800'>
            <PricingComponent />
        </div>
    );
}

function PricingComponent() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [paymentSuccess, setPaymentSuccess] = useState(null);
    const [selectedCurrency, setSelectedCurrency] = useState('INR');
    const [currentPlan, setCurrentPlan] = useState(null);
    const navigate = useNavigate();


    const options = {
        "INR": {
            "symbol": "₹",
            "price": {
                "silver": "100",
                "gold": "150"
            },
        },
        "USD": {
            "symbol": "$",
            "price": {
                "silver": "101",
                "gold": "151"
            },
        },
        "EUR": {
            "symbol": "€",
            "price": {
                "silver": "102",
                "gold": "152"
            },
        }
    };

    const loadRazorpayScript = () => {
        return new Promise((resolve) => {
            if (window.Razorpay) {
                return resolve(true);
            }
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });
    };

    const handlePayment = async (planType) => {
        try {
            setCurrentPlan(planType);
            setLoading(true);
            
            // Wait for razorpay script to load dynamically before creating order
            const res = await loadRazorpayScript();
            if (!res) {
                console.error("Razorpay SDK failed to load");
                setLoading(false);
                return;
            }

            // Server is authoritative about price: send only plan + currency.
            const response = await apiClient.post(
                `${import.meta.env.VITE_API_BASE_URL}/payment/create-order`,
                 { planType, currency: selectedCurrency.toUpperCase() }
            );

            const { id: orderId } = response.data;

            const razorpayOptions = {
                key: "rzp_test_rk5UnQvaBl2fuh",
                amount: options[selectedCurrency].price[planType] * 100,
                currency: selectedCurrency.toUpperCase(),
                name: "Darkmap OSINT",
                description: "Subscription Payment",
                order_id: orderId,
                handler: async function (response) {
                    const { razorpay_payment_id, razorpay_signature } = response;
                    await verifyPayment(orderId, razorpay_payment_id, razorpay_signature, planType);
                },
                prefill: {
                    name: user?.firstName + ' ' + user?.lastName,
                    email: user?.email,
                },
                theme: { color: "#3399cc" },
            };

            const razorpay = new window.Razorpay(razorpayOptions);
            razorpay.open();
        } catch (error) {
            console.error("Payment initiation failed:", error);
            setLoading(false);
        }
    };

    const verifyPayment = async (orderId, paymentId, signature, planType) => {
        try {
            const response = await apiClient.post(
                `${import.meta.env.VITE_API_BASE_URL}/payment/verify`,
                { 
                    orderId, 
                    razorpayPaymentId: paymentId, 
                    razorpaySignature: signature,
                    planType 
                }
            );

            setPaymentSuccess(response.data.status);
            setLoading(false);

            if (response.data.status === "success") {
                navigate('/generic');
            }
        } catch (error) {
            console.error("Payment verification failed:", error);
            setLoading(false);
            setPaymentSuccess(false);
        }
    };

    return (
        <section>
            <div className="py-2 md:pb-16 px-4 mx-auto max-w-screen-xl lg:px-6">
                <div className="mx-auto max-w-screen-md text-center mb-4 lg:mb-12">
                    <h2 className="mb-2 text-4xl tracking-tight font-black text-white">Your Eyes<br />Inside the Underground</h2>
                    <p className="mb-5 font-thin text-gray-500 sm:text-xl">Unlock Darkmap's full potential by signing up for a monthly subscription.</p>
                </div>
                        <Options onChange={(c) => { setSelectedCurrency(c) }} options={options} selected={"INR"} />
                <div className="space-y-8 lg:grid lg:grid-cols-3 sm:gap-6 xl:gap-10 lg:space-y-0">
                    <div className="flex flex-col border-[0.7px] border-border-blue p-6 max-w-lg text-center text-white bg-gradient-to-b from-black to-primary-900 rounded-lg shadow xl:p-8">
                        <h3 className="mb-2 text-2xl font-semibold font-default-sans">Telegram OSINT</h3>
                        <div className="font-light text-gray-500 mt-2"><span className=' text-white font-semibold text-xs border border-gray-400 px-3 py-1 rounded-full'>Silver Plan</span><div className='mt-2'>30 Searches</div></div>
                        <div className="flex justify-center items-baseline my-8">
                            <span className="mr-2 text-5xl font-black">{`${options[selectedCurrency].symbol}${options[selectedCurrency].price['silver']}`}</span>
                            <span className="text-gray-500">/month</span>
                        </div>
                        <ul role="list" className="mb-8 space-y-4 text-left row-span-3">
                            <Feature>Username History</Feature>
                            <Feature>Profile Activity</Feature>
                            <Feature>Telegram Groups of target</Feature>
                            <Feature>Telegram Channels of target</Feature>
                            <Feature>Date and Time tags</Feature>
                        </ul>
                        <div className="flex-grow"></div>
                        <ButtonComponent onClick={() => handlePayment('silver')} disabled={loading}>
                            {loading ? "Processing..." : "Pay Now"}
                        </ButtonComponent>
                    </div>
                    <div className="flex flex-col border-[0.7px] border-border-blue p-6  max-w-lg text-center text-white bg-gradient-to-b from-black to-primary-900 rounded-lg shadow xl:p-8">
                        <h3 className="mb-2 text-2xl font-semibold font-default-sans">Telegram OSINT</h3>
                        <div className="font-light text-gray-500 mt-2"><span className=' text-[#efbf04] text-xs font-semibold border border-[#efbf04] px-3 py-1 rounded-full'>Gold Plan</span><div className='mt-2'>50 Searches</div></div>
                        <div className="flex justify-center items-baseline my-8">
                            <span className="mr-2 text-5xl font-black">{`${options[selectedCurrency].symbol}${options[selectedCurrency].price['gold']}`}</span>
                            <span className="text-gray-500">/month</span>
                        </div>
                        <ul role="list" className="mb-8 space-y-4 text-left row-span-3">
                            <Feature>Username History</Feature>
                            <Feature>Profile Activity</Feature>
                            <Feature>Telegram Groups of target</Feature>
                            <Feature>Telegram Channels of target</Feature>
                            <Feature>Date and Time tags</Feature>
                        </ul>
                        <div className="flex-grow"></div>
                        <ButtonComponent onClick={() => handlePayment('gold')} disabled={loading}>
                            {loading ? "Processing..." : "Pay Now"}
                        </ButtonComponent>
                    </div>
                    <div className="flex flex-col justify-between bg-[#01121a] p-6 max-w-lg text-center text-white rounded-lg shadow xl:p-8">
                        <h3 className="mb-2 text-2xl font-semibold text-border-blue">Darkweb Intelligence portal</h3>
                        <p className="font-light text-gray-200">Strictly for Defence & Government Agencies and Business enterprises</p>
                        <ul role="list" className="mb-8 space-y-4 text-left row-span-3">
                            <Feature>Darkweb Intelligence</Feature>
                            <Feature>Breach Detection & Response</Feature>
                            <Feature>Cybercriminals Chat Surveillance</Feature>
                            <Feature>Threat & Keyword Tracking</Feature>
                            <Feature>Telegram, Ransomware, anon hosting sites & Forums</Feature>
                        </ul>
                        <Link to="/contact" className='flex'>
                            <ButtonComponent className="flex-grow">Contact Us</ButtonComponent>
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}

function ButtonComponent({ children, className, onClick, disabled }) {
    return (
        <button
            type="button"
            className={`text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm px-4 py-2 text-center bg-blue-600 hover:bg-blue-700 focus:ring-blue-800 ${className}`}
            onClick={onClick}
            disabled={disabled}
        >
            {children}
        </button>
    );
}

function Feature({ children }) {
    return (
        <li className="flex items-center space-x-3">
            <svg className="flex-shrink-0 w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>{children}</span>
        </li>
    );
}

function Options({ options, onChange, selected }) {
    return (
        <ul className="flex justify-center mb-4" onChange={(e) => { onChange(e.target.id) }}>
            {Object.entries(options).map(([id, data]) => {
                return <Option key={id} id={id} defaultValue={selected}>{data.symbol}</Option>
            })}
        </ul>
    );
}

function Option({ children, id, defaultValue }) {
    return (
        <li>
            <input type="radio" id={id} name="currency" defaultChecked={defaultValue === id} className="hidden peer" required />
            <label htmlFor={id} className="py-2 px-3 inline-flex items-center justify-between border cursor-pointer border-gray-700 peer-checked:border-border-blue peer-checked:text-darkmap-blue hover:text-gray-600 text-gray-400 bg-gray-800 hover:bg-gray-700">
                <div className="block">
                    <div className="w-full text-lg font-semibold">{children}</div>
                </div>
            </label>
        </li>
    );
}

export default PricingScreen;
