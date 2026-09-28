import { Link, useNavigate } from "react-router-dom";
import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

export function SignUpScreen() {
    const { signup } = useAuth();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            alert("Passwords do not match");
            return;
        }
        const success = await signup(firstName, lastName, email, password);
        if (success) {
            navigate("/login");
        }
    };

    return <section className="bg-gradient-to-b from-black to-primary-900 bg-gray-900">
        <div className="flex flex-col items-center justify-center px-6 py-8 mx-auto md:h-screen lg:py-0">
            <div className="w-full rounded-lg shadow border md:mt-0 sm:max-w-md xl:p-0 bg-gray-800 border-gray-700">
                <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
                    <div className="flex justify-between">
                        <h1 className="text-xl font-bold leading-tight tracking-tight md:text-2xl text-white">
                            Create an account
                        </h1>
                        <Link to="/" className="flex items-center space-x-1 mb-4">
                            <img src="./logo.png" className="h-10" />
                        </Link>                    </div>
                    <form className="space-y-4 md:space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <label htmlFor="email" className="block mb-2 text-sm font-medium text-white">Your email</label>
                            <input type="email" name="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-primary-500 focus:border-primary-500" placeholder="name@company.com" required />
                        </div>
                        <div>
                            <label htmlFor="firstName" className="block mb-2 text-sm font-medium text-white">First Name</label>
                            <input type="text" name="firstName" id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-primary-500 focus:border-primary-500" placeholder="John" required />
                        </div>
                        <div>
                            <label htmlFor="lastName" className="block mb-2 text-sm font-medium text-white">Last Name</label>
                            <input type="text" name="lastName" id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-primary-500 focus:border-primary-500" placeholder="Holmes" required />
                        </div>
                        <div>
                            <label htmlFor="password" className="block mb-2 text-sm font-medium text-white">Password</label>
                            <input type="password" name="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-primary-500 focus:border-primary-500" required />
                        </div>
                        <div>
                            <label htmlFor="confirm-password" className="block mb-2 text-sm font-medium text-white">Confirm password</label>
                            <input type="password" name="confirm-password" id="confirm-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-primary-500 focus:border-primary-500" required />
                        </div>
                        <div className="flex items-start">
                            <div className="flex items-center h-5">
                                <input id="terms" aria-describedby="terms" type="checkbox" className="w-4 h-4 border rounded focus:ring-3 bg-gray-700 border-gray-600 focus:ring-primary-600 ring-offset-gray-800" required />
                            </div>
                            <div className="ml-3 text-sm">
                                {/* TODO: Redirect to terms */}
                                <label htmlFor="terms" className="font-light text-gray-300">I accept the <Link className="font-medium hover:underline text-primary-500" to="/terms">Terms and Conditions</Link></label>
                            </div>
                        </div>
                        <button type="submit" className="w-full text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm px-5 py-2.5 text-center bg-primary-600 hover:bg-primary-700 focus:ring-primary-800">Create an account</button>
                        <p className="text-sm font-light text-gray-400">
                            Already have an account? <a href="/login" className="font-medium hover:underline text-primary-500">Login here</a>
                        </p>
                    </form>
                </div>
            </div>
        </div>
    </section>

}