import MainLayout from '../components/layout/MainLayout';
import Card from '../components/ui/Card';
import { useAuth } from '../context/AuthContext';
import { User, Shield, Mail, Phone, Hash } from 'lucide-react';

const ProfileDetail = ({ icon: Icon, label, value }) => (
    <div className="flex items-center gap-4 p-4 bg-white/5 border border-cyber-muted/20 rounded-lg hover:border-cyber-primary/50 transition-colors">
        <div className="p-3 bg-cyber-primary/10 rounded-full text-cyber-primary">
            <Icon size={20} />
        </div>
        <div>
            <p className="text-xs text-cyber-muted font-mono uppercase tracking-wider">{label}</p>
            <p className="text-cyber-text font-bold font-orbitron tracking-wide">{value || 'N/A'}</p>
        </div>
    </div>
);

const ProfilePage = () => {
    const { user } = useAuth();

    return (
        <MainLayout>
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="border-b border-cyber-muted/20 pb-4">
                    <h2 className="text-3xl font-orbitron font-bold text-white mb-1">OPERATOR PROFILE</h2>
                    <p className="text-cyber-primary font-mono text-xs tracking-wider">:: IDENTITY CONFIRMED ::</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Identity Card */}
                    <Card className="md:col-span-1 border-cyber-primary/50 shadow-neon flex flex-col items-center text-center py-10">
                        <div className="w-32 h-32 rounded-full bg-cyber-dark border-2 border-cyber-primary p-2 mb-6 relative">
                            <div className="w-full h-full rounded-full bg-cyber-primary/10 flex items-center justify-center overflow-hidden">
                                <User size={64} className="text-cyber-primary" />
                            </div>
                            <div className="absolute bottom-0 right-0 w-8 h-8 bg-cyber-success rounded-full border-4 border-cyber-black" title="Online"></div>
                        </div>
                        <h3 className="text-xl font-orbitron font-bold text-white text-glow mb-1">{user?.name}</h3>
                        <span className="px-3 py-1 rounded-full bg-cyber-primary/10 text-cyber-primary text-xs font-mono font-bold border border-cyber-primary/30">
                            LEVEL 5 CLEARANCE
                        </span>
                    </Card>

                    {/* Details Grid */}
                    <div className="md:col-span-2 space-y-6">
                        <Card title="PERSONNEL DATA">
                            <div className="grid grid-cols-1 gap-4">
                                <ProfileDetail icon={Mail} label="COMMUNICATION LINK" value={user?.email} />
                                <ProfileDetail icon={Phone} label="CONTACT CIPHER" value={user?.number} />
                                <ProfileDetail icon={Hash} label="OPERATOR ID" value={user?._id || 'UNK-000'} />
                                <ProfileDetail icon={Shield} label="SECURITY ROLE" value="SYSTEM ADMINISTRATOR" />
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default ProfilePage;
