import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from "react-router-dom";
import { useAuth } from '../context/AuthContext';

export function LogInScreen() {
    const { login, verify2fa, completeLogin, isAuthenticated } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    // 2FA state
    const [step, setStep] = useState('credentials'); // 'credentials' | '2fa' | 'recovery-codes'
    const [challengeId, setChallengeId] = useState(null);
    const [setupRequired, setSetupRequired] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState(null);
    const [totpCode, setTotpCode] = useState('');
    const [useRecoveryInput, setUseRecoveryInput] = useState(false);
    const [recoveryCodesList, setRecoveryCodesList] = useState([]);
    const [pendingAuthData, setPendingAuthData] = useState(null);
    const codeInputRef = useRef(null);

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        
        try {
            const result = await login(email, password);

            if (result?.requires2FA) {
                // Transition to 2FA step
                setChallengeId(result.challengeId);
                setSetupRequired(result.setupRequired);
                setQrCodeUrl(result.qrCode);
                setTotpCode('');
                setUseRecoveryInput(false);
                setStep('2fa');
            }
            // If no 2FA, AuthContext already set the user state
            // and the useEffect below will redirect
        } catch (err) {
            setError(err?.response?.data?.message || err.message || "An error occurred during login");
        } finally {
            setIsLoading(false);
        }
    };

    const handle2FASubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const result = await verify2fa(challengeId, totpCode);
            if (result?.recoveryCodes) {
                setRecoveryCodesList(result.recoveryCodes);
                setPendingAuthData({ token: result.token, profile: result.profile });
                setStep('recovery-codes');
            }
            // On regular success, AuthContext sets user → useEffect redirects
        } catch (err) {
            const message = err?.response?.data?.message || err.message || "Verification failed";
            setError(message);

            // If challenge was destroyed (too many attempts or expired), go back to step 1
            if (err?.response?.status === 400 || message.includes('Please login again')) {
                resetToCredentials();
            } else {
                setTotpCode('');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleProceedToApp = () => {
        if (pendingAuthData) {
            completeLogin(pendingAuthData.token, pendingAuthData.profile);
        }
    };

    const resetToCredentials = () => {
        setStep('credentials');
        setChallengeId(null);
        setSetupRequired(false);
        setQrCodeUrl(null);
        setTotpCode('');
        setUseRecoveryInput(false);
        setRecoveryCodesList([]);
        setPendingAuthData(null);
    };

    // Auto-focus the code input when switching to 2FA step
    useEffect(() => {
        if (step === '2fa' && codeInputRef.current) {
            codeInputRef.current.focus();
        }
    }, [step, useRecoveryInput]);

    useEffect(()=>{
        if (isAuthenticated) {
            navigate("/");
        }
    }, [isAuthenticated]);

    return (
        <section className="bg-gradient-to-b from-black to-primary-900 bg-gray-900 min-h-screen flex items-center">
            <div className="flex flex-col items-center justify-center px-6 py-8 mx-auto w-full md:h-screen lg:py-0">
                <a href="#" className="flex items-center mb-6 text-2xl font-semibold text-white">
                    <img className="size-10 mr-2" src="/logo.png" alt="logo" />
                    <img className="h-8 mt-2" src="/logo_text.png" alt="logo" />
                </a>
                <div className="w-full rounded-lg shadow border md:mt-0 sm:max-w-md xl:p-0 bg-gray-800 border-gray-700">
                    <div className="p-6 space-y-4 md:space-y-6 sm:p-8">

                        {/* ── Step 1: Credentials ── */}
                        {step === 'credentials' && (
                            <>
                                <h1 className="text-xl font-bold leading-tight tracking-tight md:text-2xl text-white">
                                    Welcome, Login
                                </h1>
                                {error && (
                                    <div className="p-4 mb-4 text-sm text-red-400 rounded-lg bg-gray-700 border border-red-800" role="alert">
                                        {error}
                                    </div>
                                )}
                                <form className="space-y-4 md:space-y-6" onSubmit={handleLoginSubmit}>
                                    <div>
                                        <label htmlFor="email" className="block mb-2 text-sm font-medium text-white">Your email</label>
                                        <input 
                                            type="email" 
                                            name="email" 
                                            id="email" 
                                            value={email} 
                                            onChange={(e) => setEmail(e.target.value)} 
                                            className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-primary-500 focus:border-primary-500" 
                                            placeholder="name@company.com" 
                                            required 
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="password" className="block mb-2 text-sm font-medium text-white">Password</label>
                                        <input 
                                            type="password" 
                                            name="password" 
                                            id="password" 
                                            value={password} 
                                            onChange={(e) => setPassword(e.target.value)} 
                                            placeholder="••••••••" 
                                            className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-primary-500 focus:border-primary-500" 
                                            required 
                                        />
                                    </div>
                                    <button 
                                        type="submit" 
                                        className="w-full text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm px-5 py-2.5 text-center bg-primary-600 hover:bg-primary-700 focus:ring-primary-800"
                                        disabled={isLoading}
                                    >
                                        {isLoading ? "Logging in..." : "Login"}
                                    </button>
                                    <p className="text-sm font-light text-gray-400">
                                        Do not have an account? <a href="/signup" className="font-medium hover:underline text-primary-500">Sign up here</a>
                                    </p>
                                </form>
                            </>
                        )}

                        {/* ── Step 2: Two-Factor Authentication ── */}
                        {step === '2fa' && (
                            <>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={resetToCredentials}
                                        className="text-gray-400 hover:text-white transition-colors"
                                        title="Back to login"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                    </button>
                                    <h1 className="text-xl font-bold leading-tight tracking-tight md:text-2xl text-white">
                                        {useRecoveryInput ? "Recovery Code" : "Two-Factor Authentication"}
                                    </h1>
                                </div>

                                {error && (
                                    <div className="p-4 mb-4 text-sm text-red-400 rounded-lg bg-gray-700 border border-red-800" role="alert">
                                        {error}
                                    </div>
                                )}

                                {/* QR Code for first-time setup */}
                                {setupRequired && !useRecoveryInput && qrCodeUrl && (
                                    <div className="space-y-3">
                                        <p className="text-sm text-gray-300">
                                            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                                        </p>
                                        <div className="flex justify-center p-4 bg-white rounded-lg">
                                            <img 
                                                src={qrCodeUrl} 
                                                alt="2FA QR Code" 
                                                className="w-48 h-48"
                                            />
                                        </div>
                                    </div>
                                )}

                                {!setupRequired && !useRecoveryInput && (
                                    <p className="text-sm text-gray-300">
                                        Enter the 6-digit code from your authenticator app.
                                    </p>
                                )}

                                {useRecoveryInput && (
                                    <p className="text-sm text-gray-300">
                                        Enter one of your 8-character recovery codes.
                                    </p>
                                )}

                                <form className="space-y-4 md:space-y-6" onSubmit={handle2FASubmit}>
                                    <div>
                                        <label htmlFor="totp-code" className="block mb-2 text-sm font-medium text-white">
                                            {useRecoveryInput ? "Recovery Code" : (setupRequired ? "Enter the code shown in your app" : "Authentication Code")}
                                        </label>
                                        <input 
                                            ref={codeInputRef}
                                            type="text"
                                            inputMode={useRecoveryInput ? "text" : "numeric"}
                                            name="totp-code"
                                            id="totp-code"
                                            value={totpCode}
                                            onChange={(e) => {
                                                if (useRecoveryInput) {
                                                    const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
                                                    setTotpCode(val);
                                                } else {
                                                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                                    setTotpCode(val);
                                                }
                                            }}
                                            className={`border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-primary-500 focus:border-primary-500 text-center ${useRecoveryInput ? 'text-xl tracking-[0.3em]' : 'text-2xl tracking-[0.5em]'} font-mono uppercase`}
                                            placeholder={useRecoveryInput ? "ABCDEFGH" : "000000"}
                                            maxLength={useRecoveryInput ? 8 : 6}
                                            autoComplete="one-time-code"
                                            required
                                        />
                                    </div>
                                    <button 
                                        type="submit" 
                                        className="w-full text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm px-5 py-2.5 text-center bg-primary-600 hover:bg-primary-700 focus:ring-primary-800"
                                        disabled={isLoading || totpCode.length !== (useRecoveryInput ? 8 : 6)}
                                    >
                                        {isLoading ? "Verifying..." : "Verify"}
                                    </button>
                                </form>

                                {!setupRequired && (
                                    <div className="text-center pt-2">
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                setUseRecoveryInput(!useRecoveryInput);
                                                setTotpCode('');
                                                setError(null);
                                            }}
                                            className="text-sm text-primary-500 hover:underline"
                                        >
                                            {useRecoveryInput ? "Use authenticator app instead" : "Use a recovery code"}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {/* ── Step 3: Recovery Codes Display (After Setup) ── */}
                        {step === 'recovery-codes' && (
                            <>
                                <h1 className="text-xl font-bold leading-tight tracking-tight md:text-2xl text-white">
                                    Save your Recovery Codes
                                </h1>
                                <div className="p-4 mb-4 text-sm text-yellow-200 rounded-lg bg-yellow-900/30 border border-yellow-800" role="alert">
                                    <strong>Important:</strong> These codes are the ONLY way to access your account if you lose your device. Save them somewhere safe. They will not be shown again.
                                </div>
                                <div className="grid grid-cols-2 gap-3 mb-6 bg-gray-900 p-4 rounded-lg border border-gray-700">
                                    {recoveryCodesList.map((code, idx) => (
                                        <div key={idx} className="font-mono text-gray-300 text-center tracking-widest text-sm bg-gray-800 py-2 rounded">
                                            {code}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-4">
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(recoveryCodesList.join('\n'));
                                            alert('Recovery codes copied to clipboard!');
                                        }}
                                        className="w-full text-white bg-gray-700 hover:bg-gray-600 focus:ring-4 focus:outline-none focus:ring-gray-800 font-medium rounded-lg text-sm px-5 py-2.5 text-center transition-colors"
                                    >
                                        Copy Codes
                                    </button>
                                    <button 
                                        onClick={handleProceedToApp}
                                        className="w-full text-white bg-primary-600 hover:bg-primary-700 focus:ring-4 focus:outline-none focus:ring-primary-800 font-medium rounded-lg text-sm px-5 py-2.5 text-center transition-colors"
                                    >
                                        I've saved them
                                    </button>
                                </div>
                            </>
                        )}

                    </div>
                </div>
            </div>
        </section>
    );
}