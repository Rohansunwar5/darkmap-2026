import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify"; // Make sure to import toast

const InactivityModal = ({ onRestart, onClose }) => {
  useEffect(() => {
    // Prevent scrolling when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleRestart = async () => {
    try {
      /*
      const firstResponse = await fetch(
        import.meta.env.VITE_API_URL1,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: "test@gmail.com" }),
        }
      );

      if (!firstResponse.ok) {
        const errorData = await firstResponse.json();
        throw new Error(errorData.message || "Failed to start first service");
      }
      */
      localStorage.removeItem('firstTimeLoadTimestamp');
      // toast.success("First service started successfully!");
      onRestart();
      useNavigate('/login')
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-blue-400 rounded-xl p-6 w-full max-w-md relative">
        <div className="absolute top-0 right-0 m-3 cursor-pointer" onClick={onClose}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400 hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        <div className="flex items-center mb-4">
          <div className="bg-red-500 rounded-full p-2 mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white">Services Offline</h3>
        </div>

        <p className="text-gray-300 mb-6">
          The services went offline due to inactivity. Please re-login to continue using the application.
        </p>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRestart}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
          >
            Re-login
          </button>
        </div>
      </div>
    </div>
  );
};

export default InactivityModal;