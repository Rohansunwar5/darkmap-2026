import { motion, AnimatePresence } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faProjectDiagram } from '@fortawesome/free-solid-svg-icons';

const VisualizerFloatingButton = ({ onClick, isVisible }) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 100, opacity: 0 }}
          whileHover={{ backgroundColor: '#0094ff3b' }}
          whileTap={{ scale: 0.95 }}
          onClick={onClick}
          className="fixed bottom-10 right-10 z-[5000] flex items-center gap-2 bg-[#0094FF1C] border border-[#126382] text-[#A0DDFF] px-4 py-2 rounded cursor-pointer shadow-[0_0_20px_rgba(0,148,255,0.15)] transition-all font-[Aldrich]"
          style={{ fontSize: "12px" }}
          title="Visualize Groups"
        >
          <FontAwesomeIcon icon={faProjectDiagram} />
          Visualize Groups
        </motion.button>
      )}
    </AnimatePresence>
  );
};

export default VisualizerFloatingButton;
