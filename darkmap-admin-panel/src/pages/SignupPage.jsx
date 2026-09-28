import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import { motion } from 'framer-motion';

const SignupPage = () => {
    const [formData, setFormData] = useState({
        name: '',
        number: '',
        email: '',
        password: ''
    });
    const { signup } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        const success = await signup(formData);
        if (success) {
            navigate('/login');
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-cyber-black relative overflow-hidden">
            {/* Background Grid & Effects */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,243,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,243,255,0.03)_1px,transparent_1px)] bg-[size:30px_30px]"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyber-secondary/10 blur-[100px] rounded-full pointing-events-none"></div>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md z-10 px-4"
            >
                <Card title=":: NEW OPERATOR REGISTRATION ::" className="shadow-neon border-cyber-secondary/30">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input
                            label="OPERATOR NAME"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="J. DOE"
                            required
                        />
                        <Input
                            label="CONTACT CODE"
                            name="number"
                            value={formData.number}
                            onChange={handleChange}
                            placeholder="+1 555-0100"
                            required
                        />
                        <Input
                            label="COMM_LINK // EMAIL"
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="agent@darkmap.org"
                            required
                        />
                        <Input
                            label="PASSPHRASE"
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="••••••••"
                            required
                        />

                        <Button
                            type="submit"
                            variant="secondary"
                            className="w-full mt-6"
                            disabled={loading}
                        >
                            {loading ? 'REGISTERING...' : 'ESTABLISH IDENTITY'}
                        </Button>

                        <div className="text-center mt-4">
                            <span className="text-cyber-muted text-xs">ALREADY CLEARED? </span>
                            <button
                                type="button"
                                onClick={() => navigate('/login')}
                                className="text-cyber-secondary text-xs hover:text-white transition-colors underline decoration-dotted"
                            >
                                ACCESS TERMINAL
                            </button>
                        </div>
                    </form>
                </Card>
            </motion.div>
        </div>
    );
};

export default SignupPage;
