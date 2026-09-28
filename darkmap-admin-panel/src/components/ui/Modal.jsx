import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import Button from './Button';
import Card from './Card';

const Modal = ({ isOpen, onClose, title, children, onConfirm, confirmText = "CONFIRM", variant = "default" }) => {
    if (!isOpen) return null;

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-cyber-black/80 backdrop-blur-sm"
                />
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="relative z-10 w-full max-w-md"
                >
                    <Card title={title} className={variant === 'danger' ? 'border-cyber-danger/50 shadow-danger-glow' : 'border-cyber-primary/50 shadow-neon'}>
                        <div className="mb-6 text-cyber-text font-mono text-sm leading-relaxed">
                            {children}
                        </div>
                        <div className="flex justify-end gap-4">
                            <Button variant="ghost" onClick={onClose}>ABORT</Button>
                            <Button variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
                                {confirmText}
                            </Button>
                        </div>
                    </Card>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
};

export default Modal;
