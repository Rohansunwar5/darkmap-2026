import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import { motion } from 'framer-motion';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        const success = await login(email, password);
        if (success) {
            // Force hard refresh to ensure clean state and Context re-initialization
            window.location.href = '/';
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-cyber-black relative overflow-hidden">
            {/* Background Grid & Effects */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,243,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,243,255,0.03)_1px,transparent_1px)] bg-[size:30px_30px]"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyber-primary/10 blur-[100px] rounded-full pointing-events-none"></div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md z-10 px-4"
            >
                <Card title=":: SYSTEM ENTRY ::" className="shadow-neon border-cyber-primary/30">
                    <div className="mb-6 text-center">
                        <h1 className="text-3xl font-orbitron font-bold text-white mb-2 text-glow">DARKMAP</h1>
                        <p className="text-cyber-primary text-xs tracking-[0.2em] animate-pulse">SECURE ADMIN CONSOLE</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <Input
                            label="USER_ID // EMAIL"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@darkmap.org"
                            required
                        />
                        <Input
                            label="PASSCODE"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />

                        <Button
                            type="submit"
                            className="w-full mt-4"
                            disabled={loading}
                        >
                            {loading ? 'AUTHENTICATING...' : 'INITIATE SESSION'}
                        </Button>

                        {/* Link to Signup - Temporary for admin workflow */}
                        <div className="text-center mt-4">
                            <span className="text-cyber-muted text-xs">NO ACCESS? </span>
                            <button
                                type="button"
                                onClick={() => navigate('/signup')}
                                className="text-cyber-primary text-xs hover:text-white transition-colors underline decoration-dotted"
                            >
                                REQUEST CLEARANCE
                            </button>
                        </div>
                    </form>
                </Card>
            </motion.div>
        </div>
    );
};

export default LoginPage;
