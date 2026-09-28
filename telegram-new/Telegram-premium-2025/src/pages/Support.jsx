import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import GenericLayout from '../components/Genric/GenericLayout';

const MAIL_API = "https://mail.darkmap.org/api";

export default function Support() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState('idle'); // idle, loading, success, error
    const [errorMsg, setErrorMsg] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('loading');
        setErrorMsg('');

        try {
            const response = await fetch(`${MAIL_API}/support`, {
                method: "POST",
                body: JSON.stringify({
                    firstName: user?.firstName || 'User',
                    lastName: user?.lastName || '',
                    email: user?.email,
                    subject,
                    message
                }),
                headers: {
                    "Content-type": "application/json; charset=UTF-8",
                },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                setErrorMsg(errorData.error || 'Failed to send support request. Please try again.');
                setStatus('error');
                return;
            }

            setStatus('success');
            setSubject('');
            setMessage('');
        } catch (error) {
            console.error('Request failed:', error);
            setErrorMsg('Network error. Please try again later.');
            setStatus('error');
        }
    };

    return (
        <GenericLayout hideNavbar={true} hideSidebox={true}>
            <div className="flex flex-col items-center justify-center h-full w-full p-6">
                <div className="w-full rounded-lg shadow border md:mt-0 sm:max-w-2xl xl:p-0 bg-gray-800 border-gray-700 relative">
                    <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
                        <button
                            onClick={() => navigate(-1)}
                            className="absolute top-6 left-6 text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm"
                        >
                            <FontAwesomeIcon icon={faArrowLeft} /> Back
                        </button>
                        <h1 className="text-xl font-bold leading-tight tracking-tight md:text-2xl text-white text-center mt-6">
                            Contact Support
                        </h1>
                        <p className="text-gray-400 text-center text-sm">
                            How can we help you? Send us a message and we'll get back to you shortly.
                        </p>

                        {status === 'success' ? (
                            <div className="p-4 mb-4 text-sm text-green-400 rounded-lg bg-gray-700 border border-green-800 text-center" role="alert">
                                <p className="font-bold">Request Sent!</p>
                                <p>Our team will contact you at {user?.email} soon.</p>
                                <button
                                    onClick={() => setStatus('idle')}
                                    className="mt-4 text-white bg-green-600 hover:bg-green-700 focus:ring-4 focus:outline-none focus:ring-green-800 font-medium rounded-lg text-sm px-5 py-2.5 text-center"
                                >
                                    Send another message
                                </button>
                            </div>
                        ) : (
                            <form className="space-y-4 md:space-y-6" onSubmit={handleSubmit}>
                                {status === 'error' && (
                                    <div className="p-4 text-sm text-red-400 rounded-lg bg-gray-700 border border-red-800" role="alert">
                                        {errorMsg}
                                    </div>
                                )}
                                <div>
                                    <label className="block mb-2 text-sm font-medium text-white">Email Address</label>
                                    <input
                                        type="email"
                                        value={user?.email || ''}
                                        disabled
                                        className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-gray-400 cursor-not-allowed"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="subject" className="block mb-2 text-sm font-medium text-white">Subject</label>
                                    <input
                                        type="text"
                                        id="subject"
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-primary-500 focus:border-primary-500"
                                        placeholder="What is this regarding?"
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="message" className="block mb-2 text-sm font-medium text-white">Message</label>
                                    <textarea
                                        id="message"
                                        rows="4"
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-primary-500 focus:border-primary-500 resize-none"
                                        placeholder="Write your message here..."
                                        required
                                    ></textarea>
                                </div>
                                <button
                                    type="submit"
                                    disabled={status === 'loading'}
                                    className="w-full text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm px-5 py-2.5 text-center bg-primary-600 hover:bg-primary-700 focus:ring-primary-800 disabled:opacity-50 flex justify-center items-center gap-2"
                                >
                                    {status === 'loading' ? 'Sending...' : (
                                        <>
                                            Send Message <FontAwesomeIcon icon={faPaperPlane} />
                                        </>
                                    )}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </GenericLayout>
    );
}
