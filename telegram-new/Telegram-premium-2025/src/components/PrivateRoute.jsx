import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Spinner from "../pages/dashboard/components/common/spinner";
import { useAuth } from "../context/AuthContext";

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/login");
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gradient-to-br from-primary-950 to-primary-950 via-black">
        <Spinner className="w-6" />
      </div>
    );
  }

  return isAuthenticated ? children : null;
};

export default PrivateRoute;
