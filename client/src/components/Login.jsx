import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth"; // Import your custom auth hook
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth(); // Get the login function from your auth hook

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); // Reset error before new attempt
    setIsLoading(true);

    try {
      // Use your custom auth login instead of Firebase
      const loginSuccess = await login(email, password);

      if (loginSuccess) {
        // First API Call
        /*
        const firstResponse = await fetch(
          import.meta.env.VITE_API_URL1,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email }),
          }
        );

        if (!firstResponse.ok) {
          const errorData = await firstResponse.json();
          throw new Error(errorData.message || "Failed to start first service");
        }
        toast.success("First service started successfully!");

        // Second API Call (Cyberattacks)
        // Call the second service after 15 seconds
        setTimeout(async () => {
          try {
            const secondResponse = await fetch(import.meta.env.VITE_API_URL3, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email }),
            });

            if (!secondResponse.ok) {
              throw new Error("Failed to start second service");
            }
            toast.success("Second service started successfully!");
          } catch (err) {
            toast.error("Error starting second service.");
          }
        }, 15000);
        */

        // Redirect to generic page
        toast.success("Login successful!");
        window.location.href = "/generic";
      }
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const resetLogoutTimer = () => {
    if (window.logoutTimer) {
      clearTimeout(window.logoutTimer);
    }
    window.logoutTimer = setTimeout(() => {
      // Use your custom auth logout
      localStorage.removeItem("accessToken");
      toast.info("You have been logged out due to inactivity.");
      window.location.href = "/login";
    }, 15 * 60 * 1000);
  };

  const handleUserActivity = () => {
    resetLogoutTimer();
  };

  useEffect(() => {
    resetLogoutTimer();
    window.addEventListener("mousemove", handleUserActivity);
    window.addEventListener("keydown", handleUserActivity);

    return () => {
      window.removeEventListener("mousemove", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      if (window.logoutTimer) {
        clearTimeout(window.logoutTimer);
      }
    };
  }, []);

  return (
    <section className="bg-gradient-to-b from-black to-primary-900 bg-gray-900">
      <ToastContainer />
      <div className="flex flex-col items-center justify-center px-6 py-8 mx-auto md:h-screen lg:py-0">
        <a href="#" className="flex items-center mb-6 text-2xl font-semibold text-white">
          <img className="size-10 mr-2" src="/logo.png" alt="logo" />
          <img className="h-8 mt-2" src="/logo_text.png" alt="logo" />
        </a>
        <div className="w-full rounded-lg shadow border md:mt-0 sm:max-w-md xl:p-0 bg-gray-800 border-gray-700">
          <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
            <h1 className="text-xl font-bold leading-tight tracking-tight md:text-2xl text-white">
              Welcome to Darkmap
            </h1>
            {error && (
              <div className="p-4 mb-4 text-sm text-red-400 rounded-lg bg-gray-700 border border-red-800" role="alert">
                {error}
              </div>
            )}
            <form className="space-y-4 md:space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block mb-2 text-sm font-medium text-white">
                  Your email
                </label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label htmlFor="password" className="block mb-2 text-sm font-medium text-white">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <button
                type="submit"
                className="w-full text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm px-5 py-2.5 text-center bg-primary-600 hover:bg-primary-700 focus:ring-primary-800"
                disabled={isLoading}
              >
                {isLoading ? "Logging in..." : "Login"}
              </button>

            </form>
          </div>
        </div>
      </div>
    </section>
  );
}